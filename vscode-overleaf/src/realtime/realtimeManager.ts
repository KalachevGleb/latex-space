import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'
import { LatexSpaceClient } from '../api/client'
import { getConfig } from '../config'
import { ProjectMeta, ProjectState } from '../sync/state'
import { writeFileEnsuringDir } from '../util/fsutil'
import { OtDoc, OtUpdate } from './docClient'
import { SioClient } from './socketClient'
import { diffAsOp, diffReplaceOps, isDelete, isInsert, TextOp } from './textOt'
// та же библиотека, что применяет ranges на сервере (document-updater)
import RangesTracker from '../vendor/rangesTracker'
import type { TrackedChange, TrackedComment } from '../vendor/rangesTracker'

export type RtState = 'off' | 'connecting' | 'connected'

interface TreeEntity {
  name: string
  parentId: string | null
  type: 'doc' | 'file' | 'folder'
}

interface Binding {
  docId: string
  rel: string
  uri: vscode.Uri
  ot: OtDoc
  /** серверная модель комментариев и tracked changes (общий код с сервером) */
  tracker: InstanceType<typeof RangesTracker>
  /** seed идентификаторов для операции в полёте (meta.tc) */
  inflightSeed?: string
  saveTimer?: NodeJS.Timeout
}

export interface LiveRanges {
  rel: string
  docId: string
  comments: TrackedComment[]
  changes: TrackedChange[]
}

const decodeLine = (line: string): string => decodeURIComponent(escape(line))

/**
 * Реальное время: подключение к real-time сервису (socket.io 0.9),
 * привязка открытых документов к OT-потоку. Правки уходят на сервер
 * по мере набора, чужие правки применяются к буферу немедленно.
 * Файловая синхронизация остаётся для бинарных файлов и как fallback.
 */
export class RealtimeManager implements vscode.Disposable {
  private sio?: SioClient
  private state: RtState = 'off'
  private publicId = ''
  private entities = new Map<string, TreeEntity>()
  private rootFolderId = ''
  private bindings = new Map<string, Binding>() // docId → binding
  private suppress = new Map<string, number>() // uri → счётчик
  private reconnectDelay = 2000
  private reconnectTimer?: NodeJS.Timeout
  private treePullTimer?: NodeJS.Timeout
  private disposed = false
  private subs: vscode.Disposable[] = []

  private stateEmitter = new vscode.EventEmitter<RtState>()
  readonly onDidChangeState = this.stateEmitter.event
  /** дерево проекта изменилось (нужен файловый pull) */
  onTreeChanged?: () => void
  /** комментарии могли измениться */
  onCommentsChanged?: () => void
  /** диапазоны (комментарии/правки) изменились */
  onRangesChanged?: () => void
  /** запомнить свою запись на диск (для подавления watcher'а) */
  noteSelfWrite?: (absPath: string) => void
  /** режим рецензирования: наши операции идут как tracked changes */
  trackChangesEnabled = false
  /** режим рецензирования переключён (в т.ч. удалённо из веба) */
  onTrackChangesChanged?: (enabled: boolean) => void
  private rangesTimer?: NodeJS.Timeout

  constructor(
    private client: LatexSpaceClient,
    private projState: ProjectState,
    private meta: ProjectMeta,
    private output: vscode.OutputChannel
  ) {
    this.subs.push(
      vscode.workspace.onDidOpenTextDocument(doc => this.maybeBind(doc)),
      vscode.workspace.onDidCloseTextDocument(doc => this.onDocClosed(doc)),
      vscode.workspace.onDidChangeTextDocument(e => this.onBufferChange(e)),
      vscode.workspace.onDidSaveTextDocument(doc => this.onDocSaved(doc))
    )
  }

  dispose(): void {
    this.disposed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.treePullTimer) clearTimeout(this.treePullTimer)
    if (this.rangesTimer) clearTimeout(this.rangesTimer)
    for (const b of this.bindings.values()) {
      if (b.saveTimer) clearTimeout(b.saveTimer)
      void this.persistBinding(b)
    }
    this.bindings.clear()
    this.sio?.close()
    for (const s of this.subs) s.dispose()
    this.stateEmitter.dispose()
  }

  private log(msg: string): void {
    this.output.appendLine(`[rt ${new Date().toLocaleTimeString()}] ${msg}`)
  }

  isLive(): boolean {
    return this.state === 'connected'
  }

  /** Управляется ли файл потоком реального времени. */
  managesRel(rel: string): boolean {
    if (this.state !== 'connected') return false
    for (const b of this.bindings.values()) {
      if (b.rel === rel) return true
    }
    return false
  }

  /** Актуальные диапазоны (комментарии/правки) привязанных документов. */
  getLiveRanges(): LiveRanges[] {
    if (this.state !== 'connected') return []
    return [...this.bindings.values()].map(b => ({
      rel: b.rel,
      docId: b.docId,
      comments: b.tracker.comments,
      changes: b.tracker.changes,
    }))
  }

  private fireRangesChanged(): void {
    if (this.rangesTimer) clearTimeout(this.rangesTimer)
    this.rangesTimer = setTimeout(() => {
      this.onRangesChanged?.()
      this.onCommentsChanged?.()
    }, 300)
  }

  /**
   * Добавить комментарий: якорная операция {c, p, t} через OT-канал
   * (текст треда создаётся отдельно через REST).
   */
  addCommentAnchor(rel: string, pos: number, quoted: string, threadId: string): boolean {
    const binding = [...this.bindings.values()].find(b => b.rel === rel)
    if (!binding || this.state !== 'connected') return false
    const comp = { p: pos, c: quoted, t: threadId }
    binding.tracker.applyOp(comp, { user_id: 'local' })
    binding.ot.localChange([comp as unknown as TextOp[number]])
    this.fireRangesChanged()
    return true
  }

  /** Убрать принятые правки из локальной модели. */
  applyAcceptedChanges(docId: string, changeIds: string[]): void {
    const binding = this.bindings.get(docId)
    if (!binding) return
    binding.tracker.removeChangeIds(changeIds)
    this.fireRangesChanged()
  }

  /**
   * Отклонить правки — как это делает веб в sharejs-режиме:
   * обратные правки обычными операциями (вставка отменяется удалением,
   * удаление — вставкой с флагом u, который RangesTracker трактует как
   * отмену маркера). Обрабатываем с конца, чтобы позиции не поплыли.
   */
  async rejectChanges(docId: string, changeIds: string[]): Promise<void> {
    const binding = this.bindings.get(docId)
    if (!binding || this.state !== 'connected') {
      throw new Error('Документ не подключён live')
    }
    const doc =
      this.findDoc(binding.uri) ??
      (await vscode.workspace.openTextDocument(binding.uri))
    const changes = binding.tracker
      .getChanges(changeIds)
      .slice()
      .sort((a, b) => b.op.p - a.op.p)
    if (changes.length === 0) return

    const wasTc = this.trackChangesEnabled
    this.trackChangesEnabled = false
    try {
      for (const change of changes) {
        if (change.op.i !== undefined) {
          // отклонить вставку: удалить её текст
          const from = change.op.p
          const to = from + change.op.i.length
          const actual = doc.getText(
            new vscode.Range(doc.positionAt(from), doc.positionAt(to))
          )
          if (actual !== change.op.i) {
            throw new Error('текст правки разошёлся с документом')
          }
          await this.applySuppressedEdit(doc, from, to, '')
          binding.tracker.track_changes = false
          binding.tracker.applyOp({ p: from, d: change.op.i })
          binding.ot.localChange([{ p: from, d: change.op.i }])
        } else if (change.op.d !== undefined) {
          // отклонить удаление: вернуть текст с undo-флагом
          const from = change.op.p
          await this.applySuppressedEdit(doc, from, from, change.op.d)
          binding.tracker.track_changes = false
          binding.tracker.applyOp({ p: from, i: change.op.d, u: true })
          binding.ot.localChange([{ p: from, i: change.op.d, u: true }])
        }
      }
      await this.flushSynchronized()
    } finally {
      this.trackChangesEnabled = wasTc
    }
    this.scheduleAutoSave(binding)
    this.fireRangesChanged()
  }

  private async applySuppressedEdit(
    doc: vscode.TextDocument,
    from: number,
    to: number,
    insert: string
  ): Promise<void> {
    const key = this.suppressKey(doc.uri)
    this.suppress.set(key, (this.suppress.get(key) ?? 0) + 1)
    try {
      const edit = new vscode.WorkspaceEdit()
      edit.replace(
        doc.uri,
        new vscode.Range(doc.positionAt(from), doc.positionAt(to)),
        insert
      )
      const ok = await vscode.workspace.applyEdit(edit)
      if (!ok) throw new Error('applyEdit отклонён')
    } finally {
      const n = (this.suppress.get(key) ?? 1) - 1
      if (n <= 0) this.suppress.delete(key)
      else this.suppress.set(key, n)
    }
  }

  /** Дождаться подтверждения всех локальных операций (перед компиляцией). */
  async flushSynchronized(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const pending = [...this.bindings.values()].some(b => b.ot.hasPending())
      if (!pending) return
      await new Promise(r => setTimeout(r, 100))
    }
  }

  // ---------- подключение ----------

  start(): void {
    void this.connect()
  }

  private setState(s: RtState): void {
    if (this.state !== s) {
      this.state = s
      this.stateEmitter.fire(s)
    }
  }

  private async connect(): Promise<void> {
    if (this.disposed) return
    this.setState('connecting')
    try {
      const cookie = await this.client.getWsCookieHeader()
      const sio = new SioClient({
        serverUrl: this.meta.serverUrl,
        projectId: this.meta.projectId,
        cookie,
      })
      this.sio = sio
      const joined = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('joinProjectResponse не получен')),
          15_000
        )
        const origOnEvent = (name: string, args: unknown[]) => {
          if (name === 'joinProjectResponse') {
            clearTimeout(timer)
            this.onJoinProject(args[0] as Record<string, unknown>)
            resolve()
          } else if (name === 'connectionRejected') {
            clearTimeout(timer)
            reject(
              new Error(
                `подключение отклонено: ${JSON.stringify(args[0]).slice(0, 120)}`
              )
            )
          }
          this.dispatchEvent(name, args)
        }
        sio.onEvent = origOnEvent
      })
      sio.onDisconnect = () => this.onDisconnected()
      await sio.connect()
      await joined
      this.reconnectDelay = 2000
      this.log('подключено (live)')
      this.setState('connected')
      this.bindOpenDocs()
    } catch (err) {
      this.log(
        `не удалось подключиться: ${err instanceof Error ? err.message : err}`
      )
      this.sio?.close()
      this.scheduleReconnect()
    }
  }

  private onDisconnected(): void {
    if (this.state === 'off') return
    this.log('соединение потеряно — переход на файловую синхронизацию')
    // сохранить состояние привязок
    for (const b of this.bindings.values()) {
      if (b.saveTimer) clearTimeout(b.saveTimer)
      void this.persistBinding(b)
    }
    this.bindings.clear()
    this.setState('off')
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.disposed) return
    this.setState('off')
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
      void this.connect()
    }, this.reconnectDelay)
  }

  // ---------- дерево проекта ----------

  private onJoinProject(resp: Record<string, unknown>): void {
    this.publicId = String(resp.publicId ?? '')
    this.entities.clear()
    const project = resp.project as
      | { rootFolder?: unknown[] }
      | undefined
    const root = project?.rootFolder?.[0] as
      | Record<string, unknown>
      | undefined
    if (root) {
      this.rootFolderId = String(root._id)
      this.walkFolder(root, null)
    }
  }

  private walkFolder(
    folder: Record<string, unknown>,
    parentId: string | null
  ): void {
    const id = String(folder._id)
    this.entities.set(id, {
      name: String(folder.name ?? ''),
      parentId,
      type: 'folder',
    })
    for (const d of (folder.docs as Array<Record<string, unknown>>) ?? []) {
      this.entities.set(String(d._id), {
        name: String(d.name),
        parentId: id,
        type: 'doc',
      })
    }
    for (const f of (folder.fileRefs as Array<Record<string, unknown>>) ?? []) {
      this.entities.set(String(f._id), {
        name: String(f.name),
        parentId: id,
        type: 'file',
      })
    }
    for (const sub of (folder.folders as Array<Record<string, unknown>>) ??
      []) {
      this.walkFolder(sub, id)
    }
  }

  /** Относительный путь сущности (без ведущего «/»). */
  private pathOf(entityId: string): string | null {
    const parts: string[] = []
    let cur: string | null = entityId
    let guard = 0
    while (cur && guard++ < 100) {
      if (cur === this.rootFolderId) break
      const e = this.entities.get(cur)
      if (!e) return null
      parts.unshift(e.name)
      cur = e.parentId
    }
    return parts.join('/')
  }

  private docIdByRel(rel: string): string | null {
    for (const [id, e] of this.entities) {
      if (e.type === 'doc' && this.pathOf(id) === rel) return id
    }
    return null
  }

  private fireTreeChanged(): void {
    if (this.treePullTimer) clearTimeout(this.treePullTimer)
    this.treePullTimer = setTimeout(() => this.onTreeChanged?.(), 800)
  }

  // ---------- события сокета ----------

  private dispatchEvent(name: string, args: unknown[]): void {
    switch (name) {
      case 'otUpdateApplied':
        this.onOtUpdate(args[0] as OtUpdate)
        break
      case 'otUpdateError': {
        this.log(`otUpdateError: ${JSON.stringify(args[0]).slice(0, 200)}`)
        // сервер разорвёт соединение; пересинхронизация на reconnect
        break
      }
      case 'reciveNewDoc':
      case 'reciveNewFile':
      case 'reciveNewFolder': {
        const parentId = String(args[0])
        const entity = args[1] as Record<string, unknown> | undefined
        if (entity?._id) {
          this.entities.set(String(entity._id), {
            name: String(entity.name ?? ''),
            parentId,
            type:
              name === 'reciveNewDoc'
                ? 'doc'
                : name === 'reciveNewFile'
                  ? 'file'
                  : 'folder',
          })
        }
        this.fireTreeChanged()
        break
      }
      case 'reciveEntityRename': {
        const e = this.entities.get(String(args[0]))
        if (e) e.name = String(args[1])
        this.refreshBindingPaths()
        this.fireTreeChanged()
        break
      }
      case 'reciveEntityMove': {
        const e = this.entities.get(String(args[0]))
        if (e) e.parentId = String(args[1])
        this.refreshBindingPaths()
        this.fireTreeChanged()
        break
      }
      case 'removeEntity': {
        const id = String(args[0])
        const binding = this.bindings.get(id)
        if (binding) {
          if (binding.saveTimer) clearTimeout(binding.saveTimer)
          this.bindings.delete(id)
        }
        this.entities.delete(id)
        this.fireTreeChanged()
        break
      }
      case 'projectNameUpdated':
        break
      case 'accept-changes': {
        // правки приняты (в вебе или другим клиентом)
        this.applyAcceptedChanges(String(args[0]), (args[1] as string[]) ?? [])
        break
      }
      case 'toggle-track-changes': {
        // проектный переключатель рецензирования из веба
        if (typeof args[0] === 'boolean') {
          this.trackChangesEnabled = args[0]
          this.onTrackChangesChanged?.(args[0])
          this.fireRangesChanged()
        }
        break
      }
      case 'new-comment':
      case 'new-comment-threads':
      case 'resolve-thread':
      case 'reopen-thread':
      case 'delete-thread':
      case 'edit-message':
      case 'delete-message':
        this.onCommentsChanged?.()
        break
      case 'reconnectGracefully':
        this.log('сервер попросил переподключиться')
        this.sio?.close()
        break
      default:
        break
    }
  }

  private refreshBindingPaths(): void {
    for (const b of this.bindings.values()) {
      const rel = this.pathOf(b.docId)
      if (rel && rel !== b.rel) {
        b.rel = rel
        b.uri = vscode.Uri.file(this.projState.localPath(rel))
      }
    }
  }

  // ---------- привязка документов ----------

  private relOf(uri: vscode.Uri): string | null {
    if (uri.scheme !== 'file') return null
    const rel = path
      .relative(this.projState.rootDir, uri.fsPath)
      .split(path.sep)
      .join('/')
    if (!rel || rel.startsWith('..')) return null
    return rel
  }

  private bindOpenDocs(): void {
    for (const doc of vscode.workspace.textDocuments) {
      this.maybeBind(doc)
    }
  }

  private maybeBind(doc: vscode.TextDocument): void {
    if (this.state !== 'connected' || !this.sio) return
    const rel = this.relOf(doc.uri)
    if (!rel) return
    const docId = this.docIdByRel(rel)
    if (!docId || this.bindings.has(docId)) return
    void this.joinDoc(docId, rel, doc).catch(err =>
      this.log(`joinDoc «${rel}»: ${err instanceof Error ? err.message : err}`)
    )
  }

  private async joinDoc(
    docId: string,
    rel: string,
    doc: vscode.TextDocument
  ): Promise<void> {
    const sio = this.sio
    if (!sio) return
    const args = await sio.emitWithAck('joinDoc', [docId, -1, {}])
    if (args[0]) {
      throw new Error(`сервер отказал: ${JSON.stringify(args[0]).slice(0, 120)}`)
    }
    const lines = (args[1] as string[]) ?? []
    const version = Number(args[2] ?? 0)
    const type = args[5] as string | undefined
    if (type === 'history-ot') {
      this.log(`«${rel}»: документ в формате history-ot — остаётся файловая синхронизация`)
      await sio.emitWithAck('leaveDoc', [docId]).catch(() => undefined)
      return
    }
    const serverText = lines.map(decodeLine).join('\n')

    const rawRanges = (args[4] ?? {}) as {
      comments?: TrackedComment[]
      changes?: TrackedChange[]
    }
    const tracker = new RangesTracker(
      rawRanges.changes ?? [],
      rawRanges.comments ?? []
    )
    tracker.setIdSeed(RangesTracker.generateIdSeed())

    const ot = new OtDoc(docId, serverText, version)
    const binding: Binding = { docId, rel, uri: doc.uri, ot, tracker }
    ot.onFlip = () => {
      // операции применялись к трекеру с текущим seed — он уходит в meta.tc
      binding.inflightSeed = tracker.getIdSeed()
      tracker.setIdSeed(RangesTracker.generateIdSeed())
    }
    ot.onSend = update => {
      if (this.trackChangesEnabled && binding.inflightSeed) {
        update.meta = { tc: binding.inflightSeed }
      }
      sio
        .emitWithAck('applyOtUpdate', [docId, update])
        .then(ackArgs => {
          if (ackArgs[0]) {
            this.log(
              `applyOtUpdate «${rel}» отклонён: ${JSON.stringify(ackArgs[0]).slice(0, 160)}`
            )
            void this.resyncDoc(binding)
          }
        })
        .catch(err => {
          this.log(`applyOtUpdate «${rel}»: ${err.message}`)
        })
    }
    ot.onNeedResync = reason => {
      this.log(`resync «${rel}»: ${reason}`)
      void this.resyncDoc(binding)
    }
    this.bindings.set(docId, binding)

    // сверка с буфером
    const bufText = doc.getText()
    if (bufText !== serverText) {
      const base = await this.projState.readBase(rel)
      const baseText = base?.toString('utf8')
      const normalizedBuf = bufText
      if (!doc.isDirty && baseText !== undefined && normalizedBuf === baseText) {
        // локальных правок нет — принимаем серверный текст
        await this.replaceBuffer(doc, serverText, ot)
      } else {
        // есть локальные правки — отправляем их как операцию
        const op = diffAsOp(serverText, bufText)
        if (op.length) {
          this.log(`«${rel}»: локальные правки отправлены как OT (${op.length} комп.)`)
          ot.localChange(op)
        }
      }
    }
    this.log(`live: ${rel} (v${version})`)
  }

  /** Заменить содержимое буфера серверным текстом (с подавлением событий). */
  private async replaceBuffer(
    doc: vscode.TextDocument,
    newText: string,
    ot: OtDoc
  ): Promise<void> {
    const key = this.suppressKey(doc.uri)
    this.suppress.set(key, (this.suppress.get(key) ?? 0) + 1)
    try {
      const edit = new vscode.WorkspaceEdit()
      const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length)
      )
      edit.replace(doc.uri, fullRange, newText)
      await vscode.workspace.applyEdit(edit)
      ot.text = newText
    } finally {
      const n = (this.suppress.get(key) ?? 1) - 1
      if (n <= 0) this.suppress.delete(key)
      else this.suppress.set(key, n)
    }
  }

  private async resyncDoc(binding: Binding): Promise<void> {
    const sio = this.sio
    if (!sio || this.state !== 'connected') return
    this.bindings.delete(binding.docId)
    await sio.emitWithAck('leaveDoc', [binding.docId]).catch(() => undefined)
    const doc = this.findDoc(binding.uri)
    if (doc) {
      await this.joinDoc(binding.docId, binding.rel, doc).catch(err =>
        this.log(`resync join: ${err instanceof Error ? err.message : err}`)
      )
    }
  }

  private findDoc(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find(
      d => d.uri.toString() === uri.toString()
    )
  }

  private onDocClosed(doc: vscode.TextDocument): void {
    const rel = this.relOf(doc.uri)
    if (!rel) return
    for (const [docId, b] of this.bindings) {
      if (b.rel === rel) {
        if (!b.ot.hasPending()) {
          this.bindings.delete(docId)
          void this.persistBinding(b)
          void this.sio?.emitWithAck('leaveDoc', [docId]).catch(() => undefined)
        }
        // если есть неподтверждённые операции — оставляем привязку,
        // изменения дойдут и запишутся фоново
        return
      }
    }
  }

  /** Записать состояние документа на диск и в базовую копию. */
  private async persistBinding(b: Binding): Promise<void> {
    if (b.ot.hasPending()) return
    const abs = this.projState.localPath(b.rel)
    const doc = this.findDoc(b.uri)
    try {
      if (!doc || !doc.isDirty) {
        const current = doc?.getText()
        if (current !== b.ot.text) {
          this.noteSelfWrite?.(abs)
          await writeFileEnsuringDir(abs, Buffer.from(b.ot.text, 'utf8'))
        }
      }
      await this.projState.writeBase(b.rel, Buffer.from(b.ot.text, 'utf8'))
    } catch (err) {
      this.log(`persist «${b.rel}»: ${err instanceof Error ? err.message : err}`)
    }
  }

  // ---------- локальные правки ----------

  private suppressKey(uri: vscode.Uri): string {
    return uri.toString()
  }

  private isSuppressed(uri: vscode.Uri): boolean {
    return (this.suppress.get(this.suppressKey(uri)) ?? 0) > 0
  }

  private onBufferChange(e: vscode.TextDocumentChangeEvent): void {
    if (e.contentChanges.length === 0) return
    if (this.isSuppressed(e.document.uri)) return
    const rel = this.relOf(e.document.uri)
    if (!rel) return
    const binding = [...this.bindings.values()].find(b => b.rel === rel)
    if (!binding) return

    // contentChanges даны относительно документа ДО события
    const changes = [...e.contentChanges].sort(
      (a, b) => a.rangeOffset - b.rangeOffset
    )
    const op: TextOp = []
    let delta = 0
    for (const ch of changes) {
      const deleted =
        ch.rangeLength > 0
          ? binding.ot.text.substr(ch.rangeOffset, ch.rangeLength)
          : ''
      if (deleted && ch.text) {
        // замена выделения: пословный diff вместо «всё удалить + всё вставить»
        op.push(...diffReplaceOps(deleted, ch.text, ch.rangeOffset + delta))
      } else if (deleted) {
        op.push({ p: ch.rangeOffset + delta, d: deleted })
      } else if (ch.text) {
        op.push({ p: ch.rangeOffset + delta, i: ch.text })
      }
      delta += ch.text.length - ch.rangeLength
    }
    try {
      // сначала трекер (использует текущий pending-seed), затем OT
      binding.tracker.track_changes = this.trackChangesEnabled
      binding.tracker.applyOps(
        op as Parameters<Binding['tracker']['applyOps']>[0],
        { user_id: 'local', ts: new Date() }
      )
      binding.ot.localChange(op)
    } catch (err) {
      this.log(
        `localChange «${rel}»: ${err instanceof Error ? err.message : err}`
      )
      void this.resyncDoc(binding)
      return
    }
    if (this.trackChangesEnabled) this.fireRangesChanged()
    this.scheduleAutoSave(binding)
  }

  private scheduleAutoSave(binding: Binding): void {
    if (binding.saveTimer) clearTimeout(binding.saveTimer)
    binding.saveTimer = setTimeout(() => {
      binding.saveTimer = undefined
      const doc = this.findDoc(binding.uri)
      if (doc?.isDirty) {
        void doc.save()
      } else if (!doc) {
        void this.persistBinding(binding)
      }
    }, 1500)
  }

  private onDocSaved(doc: vscode.TextDocument): void {
    const rel = this.relOf(doc.uri)
    if (!rel) return
    const binding = [...this.bindings.values()].find(b => b.rel === rel)
    if (!binding) return
    if (!binding.ot.hasPending()) {
      void this.projState
        .writeBase(rel, Buffer.from(binding.ot.text, 'utf8'))
        .catch(() => undefined)
    }
  }

  // ---------- удалённые правки ----------

  private onOtUpdate(update: OtUpdate): void {
    const binding = this.bindings.get(update.doc)
    if (!binding) return
    let op: TextOp | null
    try {
      op = binding.ot.handleUpdate(update, this.publicId)
    } catch (err) {
      this.log(
        `handleUpdate «${binding.rel}»: ${err instanceof Error ? err.message : err}`
      )
      void this.resyncDoc(binding)
      return
    }
    const hasComment = update.op?.some(c => !isInsert(c) && !isDelete(c))
    if (op && op.length > 0) {
      // применить к трекеру так же, как это делает document-updater
      const savedSeed = binding.tracker.getIdSeed()
      binding.tracker.track_changes = !!update.meta?.tc
      if (update.meta?.tc) binding.tracker.setIdSeed(update.meta.tc)
      try {
        binding.tracker.applyOps(
          op as Parameters<Binding['tracker']['applyOps']>[0],
          { user_id: update.meta?.user_id, ts: new Date() }
        )
      } catch (err) {
        this.log(
          `tracker «${binding.rel}»: ${err instanceof Error ? err.message : err}`
        )
      }
      binding.tracker.setIdSeed(savedSeed)
      binding.tracker.track_changes = this.trackChangesEnabled
      if (hasComment || update.meta?.tc) this.fireRangesChanged()
      void this.applyRemoteOp(binding, op)
    } else if (hasComment) {
      this.fireRangesChanged()
    }
    if (!binding.ot.hasPending()) {
      // запись базы после подтверждения (отложенно)
      this.scheduleAutoSave(binding)
    }
  }

  private async applyRemoteOp(binding: Binding, op: TextOp): Promise<void> {
    const doc = this.findDoc(binding.uri)
    if (!doc) {
      // документ закрыт — состояние живёт в ot.text, пишем на диск отложенно
      this.scheduleAutoSave(binding)
      return
    }
    const key = this.suppressKey(binding.uri)
    this.suppress.set(key, (this.suppress.get(key) ?? 0) + 1)
    try {
      for (const c of op) {
        const edit = new vscode.WorkspaceEdit()
        if (isInsert(c)) {
          edit.insert(doc.uri, doc.positionAt(c.p), c.i)
        } else if (isDelete(c)) {
          const start = doc.positionAt(c.p)
          const end = doc.positionAt(c.p + c.d.length)
          const actual = doc.getText(new vscode.Range(start, end))
          if (actual !== c.d) {
            throw new Error('буфер разошёлся с моделью')
          }
          edit.delete(doc.uri, new vscode.Range(start, end))
        } else {
          continue
        }
        const ok = await vscode.workspace.applyEdit(edit)
        if (!ok) throw new Error('applyEdit отклонён')
      }
      // контроль целостности
      if (doc.getText() !== binding.ot.text) {
        throw new Error('текст буфера не совпал с моделью')
      }
      this.scheduleAutoSave(binding)
    } catch (err) {
      this.log(
        `применение удалённой правки «${binding.rel}»: ${err instanceof Error ? err.message : err}`
      )
      void this.resyncDoc(binding)
    } finally {
      const n = (this.suppress.get(key) ?? 1) - 1
      if (n <= 0) this.suppress.delete(key)
      else this.suppress.set(key, n)
    }
  }
}
