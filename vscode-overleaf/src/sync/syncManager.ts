import * as path from 'path'
import * as vscode from 'vscode'
import AdmZip from 'adm-zip'
import { LatexSpaceClient, ConnectionError } from '../api/client'
import { getConfig } from '../config'
import { IgnoreMatcher } from '../util/glob'
import {
  contentsEqual,
  MAX_SYNC_FILE_SIZE,
  readFileOrNull,
  sanitizeZipEntryName,
  walkDir,
  writeFileEnsuringDir,
} from '../util/fsutil'
import { ProjectMeta, ProjectState, LATEXSPACE_DIR } from './state'

export type SyncStatus =
  | 'synced'
  | 'syncing'
  | 'pending'
  | 'conflict'
  | 'offline'

export interface Conflict {
  rel: string
  kind: 'modified' | 'deletedOnServer'
  serverContent: Buffer | null
}

export interface SyncStatusInfo {
  status: SyncStatus
  conflicts: number
  pendingPushes: number
  lastSyncedVersion: number
  lastError?: string
}

/**
 * Двусторонняя синхронизация локальной папки с проектом LatexSpace.
 *
 * Модель: трёхсторонее сравнение «локальный файл ↔ базовая копия ↔ сервер».
 * Базовая копия (.latexspace/base) — последнее состояние, про которое известно,
 * что оно совпадало с сервером. Любое расхождение обеих сторон от базы —
 * конфликт, который никогда не разрешается автоматически.
 */
export class SyncManager implements vscode.Disposable {
  private conflicts = new Map<string, Conflict>()
  private inFlight = new Map<string, Promise<void>>()
  private pushTimers = new Map<string, NodeJS.Timeout>()
  private retryQueue = new Set<string>()
  private selfWrites = new Map<string, number>()
  /**
   * Новые (untracked) файлы: есть локально, но нет в базовой копии.
   * Автоматически на сервер НЕ отправляются — их часто создают другие
   * расширения (автокомпиляция и т.п.). Отправка только явная.
   */
  private untracked = new Set<string>()
  private freshUntracked = new Set<string>()
  private untrackedTimer?: NodeJS.Timeout
  private muteUntrackedNotice = false
  private lock: Promise<unknown> = Promise.resolve()
  private pollTimer?: NodeJS.Timeout
  private pollCount = 0
  private offline = false
  private lastError?: string
  private disposed = false

  private statusEmitter = new vscode.EventEmitter<SyncStatusInfo>()
  readonly onDidChangeStatus = this.statusEmitter.event
  private pullEmitter = new vscode.EventEmitter<void>()
  readonly onDidPull = this.pullEmitter.event

  /**
   * Файлы, управляемые real-time потоком: файловая синхронизация
   * их не трогает (ни push, ни pull).
   */
  realtimeFilter?: (rel: string) => boolean

  constructor(
    private client: LatexSpaceClient,
    readonly state: ProjectState,
    readonly meta: ProjectMeta,
    private output: vscode.OutputChannel
  ) {}

  dispose(): void {
    this.disposed = true
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.untrackedTimer) clearTimeout(this.untrackedTimer)
    for (const t of this.pushTimers.values()) clearTimeout(t)
    this.statusEmitter.dispose()
    this.pullEmitter.dispose()
  }

  // ---------- статус ----------

  getStatusInfo(): SyncStatusInfo {
    let status: SyncStatus = 'synced'
    if (this.offline) status = 'offline'
    else if (this.conflicts.size > 0) status = 'conflict'
    else if (this.inFlight.size > 0 || this.retryQueue.size > 0)
      status = 'pending'
    return {
      status,
      conflicts: this.conflicts.size,
      pendingPushes: this.inFlight.size + this.retryQueue.size,
      lastSyncedVersion: this.meta.lastSyncedVersion,
      lastError: this.lastError,
    }
  }

  getConflicts(): Conflict[] {
    return [...this.conflicts.values()]
  }

  private fireStatus(syncing = false): void {
    const info = this.getStatusInfo()
    if (syncing) info.status = 'syncing'
    this.statusEmitter.fire(info)
  }

  private log(msg: string): void {
    this.output.appendLine(`[sync ${new Date().toLocaleTimeString()}] ${msg}`)
  }

  // ---------- вспомогательное ----------

  private matcher(): IgnoreMatcher {
    return new IgnoreMatcher([
      `${LATEXSPACE_DIR}/**`,
      ...getConfig().ignore,
    ])
  }

  /** Относительный путь файла внутри проекта или null. */
  relOf(uri: vscode.Uri): string | null {
    if (uri.scheme !== 'file') return null
    const rel = path
      .relative(this.state.rootDir, uri.fsPath)
      .split(path.sep)
      .join('/')
    if (!rel || rel.startsWith('..')) return null
    if (rel.startsWith(`${LATEXSPACE_DIR}/`)) return null
    return rel
  }

  private markSelfWrite(absPath: string): void {
    this.selfWrites.set(path.resolve(absPath), Date.now() + 5000)
  }

  /** Пометить свою запись на диск (для real-time модуля). */
  noteSelfWrite(absPath: string): void {
    this.markSelfWrite(absPath)
  }

  private isRealtimeManaged(rel: string): boolean {
    return this.realtimeFilter?.(rel) ?? false
  }

  isSelfWrite(absPath: string): boolean {
    const key = path.resolve(absPath)
    const expiry = this.selfWrites.get(key)
    if (expiry === undefined) return false
    if (Date.now() > expiry) {
      this.selfWrites.delete(key)
      return false
    }
    return true
  }

  /** Содержимое файла с учётом несохранённого буфера редактора. */
  private async effectiveLocal(rel: string): Promise<Buffer | null> {
    const abs = this.state.localPath(rel)
    const dirtyDoc = vscode.workspace.textDocuments.find(
      d => d.isDirty && d.uri.scheme === 'file' && path.resolve(d.uri.fsPath) === path.resolve(abs)
    )
    if (dirtyDoc) return Buffer.from(dirtyDoc.getText(), 'utf8')
    return readFileOrNull(abs)
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn)
    this.lock = run.catch(() => undefined)
    return run
  }

  private setOffline(err: unknown): void {
    this.offline = true
    this.lastError = err instanceof Error ? err.message : String(err)
    this.log(`нет связи с сервером: ${this.lastError}`)
    this.fireStatus()
  }

  private setOnline(): void {
    if (this.offline) {
      this.offline = false
      this.lastError = undefined
      this.log('связь с сервером восстановлена')
    }
  }

  // ---------- цикл опроса ----------

  start(): void {
    this.schedulePoll()
    // первый прогон сразу после старта
    void this.pollTick()
  }

  private schedulePoll(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    const interval = getConfig().pollIntervalSeconds * 1000
    this.pollTimer = setInterval(() => void this.pollTick(), interval)
  }

  /** Перечитать интервал опроса из настроек. */
  restartPolling(): void {
    this.schedulePoll()
  }

  async pollTick(): Promise<void> {
    if (this.disposed) return
    const cfg = getConfig()
    if (!cfg.autoPull) return
    let version: number
    try {
      version = await this.client.getLatestVersion(this.meta.projectId)
      this.setOnline()
    } catch (err) {
      if (err instanceof ConnectionError) this.setOffline(err)
      else {
        this.lastError = err instanceof Error ? err.message : String(err)
        this.log(`ошибка опроса: ${this.lastError}`)
      }
      this.fireStatus()
      return
    }
    this.pollCount++
    const deep =
      cfg.deepReconcileEveryNPolls > 0 &&
      this.pollCount % cfg.deepReconcileEveryNPolls === 0
    if (version !== this.meta.lastSyncedVersion || deep) {
      await this.pull().catch(err =>
        this.log(`ошибка pull: ${err?.message ?? err}`)
      )
    } else {
      this.fireStatus()
    }
    // повторить неудавшиеся отправки
    if (!this.offline && this.retryQueue.size > 0) {
      const retry = [...this.retryQueue]
      this.retryQueue.clear()
      for (const rel of retry) this.schedulePush(rel, 0)
    }
  }

  // ---------- pull ----------

  /**
   * Забрать изменения с сервера и свести с локальными.
   * Никогда не перезаписывает локальные правки: расхождение → конфликт.
   */
  async pull(): Promise<void> {
    return this.withLock(async () => {
      this.fireStatus(true)
      let version: number
      let zipBuf: Buffer
      try {
        // версию читаем ДО скачивания: если между ними придут изменения,
        // следующий опрос просто повторит pull
        version = await this.client.getLatestVersion(this.meta.projectId)
        zipBuf = await this.client.downloadZip(this.meta.projectId)
        this.setOnline()
      } catch (err) {
        if (err instanceof ConnectionError) this.setOffline(err)
        throw err
      }

      const matcher = this.matcher()
      const server = new Map<string, Buffer>()
      for (const entry of new AdmZip(zipBuf).getEntries()) {
        if (entry.isDirectory) continue
        const rel = sanitizeZipEntryName(entry.entryName)
        if (!rel || matcher.ignoresFile(rel)) continue
        server.set(rel, entry.getData())
      }

      const baseList = await this.state.listBase()
      const newConflicts = new Map<string, Conflict>()
      const applied: string[] = []
      const resurrected: string[] = []
      const removed: string[] = []

      for (const [rel, S] of server) {
        if (this.isRealtimeManaged(rel)) continue
        const B = await this.state.readBase(rel)
        const L = await this.effectiveLocal(rel)
        if (B !== null && contentsEqual(S, B)) {
          // сервер не менялся; локальные правки (если есть) уйдут при push
          continue
        }
        if (L === null && B === null) {
          // новый файл на сервере
          this.markSelfWrite(this.state.localPath(rel))
          await writeFileEnsuringDir(this.state.localPath(rel), S)
          await this.state.writeBase(rel, S)
          applied.push(rel)
        } else if (L === null && B !== null) {
          // удалён локально, но изменён на сервере → восстанавливаем серверную версию
          this.markSelfWrite(this.state.localPath(rel))
          await writeFileEnsuringDir(this.state.localPath(rel), S)
          await this.state.writeBase(rel, S)
          resurrected.push(rel)
        } else if (contentsEqual(L, S)) {
          // уже совпали (например, наш же push)
          await this.state.writeBase(rel, S)
        } else if (B !== null && contentsEqual(L, B)) {
          // локально не менялся → безопасно обновить
          this.markSelfWrite(this.state.localPath(rel))
          await writeFileEnsuringDir(this.state.localPath(rel), S)
          await this.state.writeBase(rel, S)
          applied.push(rel)
        } else {
          // обе стороны изменились
          newConflicts.set(rel, { rel, kind: 'modified', serverContent: S })
        }
      }

      for (const rel of baseList) {
        if (server.has(rel)) continue
        if (this.isRealtimeManaged(rel)) continue
        // файл удалён на сервере
        const L = await this.effectiveLocal(rel)
        const B = await this.state.readBase(rel)
        if (L === null) {
          await this.state.deleteBase(rel)
        } else if (contentsEqual(L, B)) {
          this.markSelfWrite(this.state.localPath(rel))
          await this.state.moveToTrash(rel)
          await this.state.deleteBase(rel)
          removed.push(rel)
        } else {
          newConflicts.set(rel, {
            rel,
            kind: 'deletedOnServer',
            serverContent: null,
          })
        }
      }

      this.meta.lastSyncedVersion = version
      await this.state.saveMeta(this.meta)

      // новые локальные файлы (нет ни на сервере, ни в базе):
      // авто-отправка только если явно включена, иначе — в список untracked
      if (getConfig().autoPush) {
        const localList = await walkDir(this.state.rootDir, matcher)
        for (const rel of localList) {
          if (server.has(rel)) continue
          if (await this.state.readBase(rel)) continue
          if (getConfig().autoPushNewFiles) this.schedulePush(rel, 500)
          else this.registerUntracked(rel)
        }
      }
      // файлы, пришедшие с сервера, перестали быть новыми
      for (const rel of server.keys()) this.untracked.delete(rel)

      this.conflicts = newConflicts
      if (applied.length || resurrected.length || removed.length) {
        this.log(
          `pull v${version}: обновлено ${applied.length}, восстановлено ${resurrected.length}, удалено ${removed.length}`
        )
        // перечитать буферы для обновлённых открытых файлов делает сам VSCode
      }
      if (resurrected.length) {
        void vscode.window.showInformationMessage(
          `LatexSpace: файлы, удалённые локально, изменились на сервере и были восстановлены: ${resurrected.join(', ')}`
        )
      }
      if (newConflicts.size > 0) {
        this.log(
          `конфликты: ${[...newConflicts.keys()].join(', ')}`
        )
        void vscode.window
          .showWarningMessage(
            `LatexSpace: конфликт синхронизации (${newConflicts.size} файл(ов)). Локальные версии не тронуты.`,
            'Показать конфликты'
          )
          .then(pick => {
            if (pick === 'Показать конфликты')
              void vscode.commands.executeCommand('latexspace.showConflicts')
          })
      }
      this.fireStatus()
      this.pullEmitter.fire()
    })
  }

  // ---------- push ----------

  /** Отложенная отправка файла (склеивает частые сохранения). */
  schedulePush(rel: string, delayMs = 300): void {
    if (!getConfig().autoPush) return
    if (this.isRealtimeManaged(rel)) return
    const existing = this.pushTimers.get(rel)
    if (existing) clearTimeout(existing)
    this.pushTimers.set(
      rel,
      setTimeout(() => {
        this.pushTimers.delete(rel)
        void this.pushFile(rel)
      }, delayMs)
    )
    this.fireStatus()
  }

  async pushFile(rel: string): Promise<void> {
    // отправки одного файла сериализуются; doPushFile сам обрабатывает ошибки
    const prev = this.inFlight.get(rel) ?? Promise.resolve()
    const job: Promise<void> = prev
      .then(() => this.doPushFile(rel))
      .catch(() => undefined)
      .then(() => {
        if (this.inFlight.get(rel) === job) {
          this.inFlight.delete(rel)
          this.fireStatus()
        }
      })
    this.inFlight.set(rel, job)
    await job
  }

  private async doPushFile(rel: string): Promise<void> {
    if (this.conflicts.has(rel)) {
      void vscode.window.showWarningMessage(
        `LatexSpace: «${rel}» не отправлен — есть конфликт синхронизации. Разрешите его через меню синхронизации.`
      )
      return
    }
    const L = await readFileOrNull(this.state.localPath(rel))
    if (L === null) return
    if (L.length > MAX_SYNC_FILE_SIZE) {
      void vscode.window.showWarningMessage(
        `LatexSpace: «${rel}» больше 50 МБ, пропущен.`
      )
      return
    }
    const B = await this.state.readBase(rel)
    if (contentsEqual(L, B)) return

    // защита от перезаписи: если на сервере появились новые версии — сначала pull
    try {
      const v = await this.client.getLatestVersion(this.meta.projectId)
      if (v !== this.meta.lastSyncedVersion) {
        await this.pull()
        if (this.conflicts.has(rel)) return // pull сообщил о конфликте
      }
    } catch (err) {
      if (err instanceof ConnectionError) {
        this.setOffline(err)
        this.retryQueue.add(rel)
        return
      }
    }

    try {
      const fresh = await readFileOrNull(this.state.localPath(rel))
      if (fresh === null) return
      const res = await this.client.uploadByPath(
        this.meta.projectId,
        rel,
        fresh
      )
      if (!res.success) throw new Error(res.error || 'upload failed')
      await this.state.writeBase(rel, fresh)
      this.setOnline()
      this.log(`push: ${rel}`)
    } catch (err) {
      if (err instanceof ConnectionError) {
        this.setOffline(err)
        this.retryQueue.add(rel)
      } else {
        this.lastError = err instanceof Error ? err.message : String(err)
        this.retryQueue.add(rel)
        this.log(`ошибка push «${rel}»: ${this.lastError}`)
        void vscode.window.showErrorMessage(
          `LatexSpace: не удалось отправить «${rel}»: ${this.lastError}`
        )
      }
    } finally {
      this.fireStatus()
    }
  }

  /** Отправить все файлы, отличающиеся от базы (после сохранения всех буферов). */
  async pushAllDirty(): Promise<void> {
    const matcher = this.matcher()
    const localList = await walkDir(this.state.rootDir, matcher)
    for (const rel of localList) {
      if (this.isRealtimeManaged(rel)) continue
      const L = await readFileOrNull(this.state.localPath(rel))
      const B = await this.state.readBase(rel)
      if (B === null && !getConfig().autoPushNewFiles) {
        // новые файлы отправляются только явно
        this.registerUntracked(rel)
        continue
      }
      if (!contentsEqual(L, B) && !this.conflicts.has(rel)) {
        await this.pushFile(rel)
      }
    }
  }

  /** Дождаться завершения всех текущих отправок. */
  async flushPending(): Promise<void> {
    for (const [rel, t] of this.pushTimers) {
      clearTimeout(t)
      this.pushTimers.delete(rel)
      void this.pushFile(rel)
    }
    await Promise.all([...this.inFlight.values()])
  }

  /**
   * Полная отправка: сервер приводится к состоянию локальной папки,
   * включая удаления (через sync-from-zip). Требует подтверждения.
   */
  async pushFullSync(): Promise<void> {
    return this.withLock(async () => {
      const matcher = this.matcher()
      const localList = await walkDir(this.state.rootDir, matcher)
      const baseList = await this.state.listBase()
      const baseSet = new Set(baseList)
      const localSet = new Set(localList)

      const added: string[] = []
      const modified: string[] = []
      const files = new Map<string, Buffer>()
      for (const rel of localList) {
        const L = await readFileOrNull(this.state.localPath(rel))
        if (L === null) continue
        if (L.length > MAX_SYNC_FILE_SIZE) continue
        files.set(rel, L)
        if (!baseSet.has(rel)) added.push(rel)
        else if (!contentsEqual(L, await this.state.readBase(rel)))
          modified.push(rel)
      }
      const deleted = baseList.filter(rel => !localSet.has(rel))

      const fmt = (arr: string[]) =>
        arr.length
          ? `${arr.length} (${arr.slice(0, 8).join(', ')}${arr.length > 8 ? ', …' : ''})`
          : '0'
      const pick = await vscode.window.showWarningMessage(
        `Полная отправка приведёт проект на сервере к состоянию локальной папки.\n` +
          `Новых файлов: ${fmt(added)}; изменённых: ${fmt(modified)}; ` +
          `будет удалено на сервере: ${fmt(deleted)}.`,
        { modal: true },
        'Отправить'
      )
      if (pick !== 'Отправить') return

      this.fireStatus(true)
      const zip = new AdmZip()
      for (const [rel, buf] of files) {
        zip.addFile(rel, buf)
      }
      const res = await this.client.syncFromZip(
        this.meta.projectId,
        zip.toBuffer()
      )
      if (!res.success) {
        throw new Error(res.error || 'sync-from-zip failed')
      }
      await this.state.resetBase(files)
      this.conflicts.clear()
      this.untracked.clear()
      try {
        this.meta.lastSyncedVersion = await this.client.getLatestVersion(
          this.meta.projectId
        )
      } catch {
        /* обновится следующим опросом */
      }
      await this.state.saveMeta(this.meta)
      const count = (v: unknown) => (Array.isArray(v) ? v.length : (v ?? 0))
      void vscode.window.showInformationMessage(
        `LatexSpace: полная отправка завершена (добавлено ${count(res.added)}, обновлено ${count(res.updated)}, удалено ${count(res.deleted)}).`
      )
      this.log('полная отправка завершена')
      this.fireStatus()
      this.pullEmitter.fire()
    })
  }

  // ---------- разрешение конфликтов ----------

  async showConflictDiff(conflict: Conflict): Promise<void> {
    const localUri = vscode.Uri.file(this.state.localPath(conflict.rel))
    if (conflict.kind === 'deletedOnServer') {
      void vscode.window.showInformationMessage(
        `«${conflict.rel}» удалён на сервере, но изменён локально. Выберите: оставить локальную версию (файл будет создан на сервере заново) или удалить локально.`
      )
      await vscode.window.showTextDocument(localUri, { preview: true })
      return
    }
    const remotePath = await this.state.writeRemoteCopy(
      conflict.rel,
      conflict.serverContent ?? Buffer.alloc(0)
    )
    await vscode.commands.executeCommand(
      'vscode.diff',
      vscode.Uri.file(remotePath),
      localUri,
      `${conflict.rel}: сервер ↔ локально`
    )
  }

  async resolveTakeServer(conflict: Conflict): Promise<void> {
    const abs = this.state.localPath(conflict.rel)
    if (conflict.kind === 'deletedOnServer') {
      this.markSelfWrite(abs)
      await this.state.moveToTrash(conflict.rel)
      await this.state.deleteBase(conflict.rel)
    } else if (conflict.serverContent) {
      this.markSelfWrite(abs)
      await writeFileEnsuringDir(abs, conflict.serverContent)
      await this.state.writeBase(conflict.rel, conflict.serverContent)
      // сбросить несохранённый буфер, если файл открыт
      const doc = vscode.workspace.textDocuments.find(
        d => d.uri.scheme === 'file' && path.resolve(d.uri.fsPath) === path.resolve(abs)
      )
      if (doc?.isDirty) {
        await vscode.window.showTextDocument(doc)
        await vscode.commands.executeCommand('workbench.action.files.revert')
      }
    }
    this.conflicts.delete(conflict.rel)
    this.log(`конфликт «${conflict.rel}»: взята серверная версия`)
    this.fireStatus()
    this.pullEmitter.fire()
  }

  async resolveKeepLocal(conflict: Conflict): Promise<void> {
    const L = await readFileOrNull(this.state.localPath(conflict.rel))
    if (L === null) {
      this.conflicts.delete(conflict.rel)
      await this.state.deleteBase(conflict.rel)
      this.fireStatus()
      return
    }
    const res = await this.client.uploadByPath(
      this.meta.projectId,
      conflict.rel,
      L
    )
    if (!res.success) {
      throw new Error(res.error || 'upload failed')
    }
    await this.state.writeBase(conflict.rel, L)
    this.conflicts.delete(conflict.rel)
    this.log(`конфликт «${conflict.rel}»: отправлена локальная версия`)
    this.fireStatus()
    this.pullEmitter.fire()
  }

  // ---------- новые (untracked) файлы ----------

  /** Количество новых файлов, не отправленных на сервер. */
  getUntrackedCount(): number {
    return this.untracked.size
  }

  private registerUntracked(rel: string): void {
    if (this.untracked.has(rel)) return
    this.untracked.add(rel)
    this.freshUntracked.add(rel)
    if (this.muteUntrackedNotice) return
    if (this.untrackedTimer) clearTimeout(this.untrackedTimer)
    // подождать, пока «пачка» файлов (например, от чужой автокомпиляции)
    // накопится, и показать одно уведомление
    this.untrackedTimer = setTimeout(() => this.notifyUntracked(), 3000)
  }

  private notifyUntracked(): void {
    const fresh = [...this.freshUntracked]
    this.freshUntracked.clear()
    if (fresh.length === 0) return
    const list =
      fresh.slice(0, 3).join(', ') +
      (fresh.length > 3 ? ` и ещё ${fresh.length - 3}` : '')
    void vscode.window
      .showInformationMessage(
        `LatexSpace: новые файлы НЕ отправлены на сервер: ${list}. Если это ваши файлы — отправьте их; автогенерируемые отправлять не нужно.`,
        'Отправить…',
        'Больше не показывать'
      )
      .then(pick => {
        if (pick === 'Отправить…') void this.pickAndSendUntracked()
        else if (pick === 'Больше не показывать')
          this.muteUntrackedNotice = true
      })
  }

  /** Диалог выбора и явной отправки новых файлов. */
  async pickAndSendUntracked(): Promise<void> {
    // убрать из списка исчезнувшие файлы
    for (const rel of [...this.untracked]) {
      if ((await readFileOrNull(this.state.localPath(rel))) === null) {
        this.untracked.delete(rel)
      }
    }
    if (this.untracked.size === 0) {
      void vscode.window.showInformationMessage(
        'LatexSpace: новых файлов нет — всё синхронизировано.'
      )
      return
    }
    const picks = await vscode.window.showQuickPick(
      [...this.untracked].sort().map(rel => ({ label: rel })),
      {
        canPickMany: true,
        title: 'Новые файлы — отметьте, что отправить на сервер',
        placeHolder: 'Не отмеченные останутся только локально',
      }
    )
    if (!picks || picks.length === 0) return
    for (const p of picks) {
      await this.pushFile(p.label)
      if (await this.state.readBase(p.label)) this.untracked.delete(p.label)
    }
    void vscode.window.showInformationMessage(
      `LatexSpace: отправлено файлов: ${picks.length}.`
    )
  }

  // ---------- обработчики файловых событий ----------

  /** push для существующих на сервере файлов; новые — в список untracked */
  private schedulePushPolicy(rel: string, delayMs: number): void {
    void this.state.readBase(rel).then(base => {
      if (base !== null || getConfig().autoPushNewFiles) {
        this.schedulePush(rel, delayMs)
      } else {
        this.registerUntracked(rel)
      }
    })
  }

  onLocalSave(doc: vscode.TextDocument): void {
    const rel = this.relOf(doc.uri)
    if (!rel || this.matcher().ignoresFile(rel)) return
    this.schedulePushPolicy(rel, 300)
  }

  onFsChangeOrCreate(uri: vscode.Uri): void {
    if (this.isSelfWrite(uri.fsPath)) return
    const rel = this.relOf(uri)
    if (!rel || this.matcher().ignoresFile(rel)) return
    this.schedulePushPolicy(rel, 1000)
  }

  onFsDelete(uri: vscode.Uri): void {
    if (this.isSelfWrite(uri.fsPath)) return
    const rel = this.relOf(uri)
    if (!rel || this.matcher().ignoresFile(rel)) return
    this.untracked.delete(rel)
    void this.state.readBase(rel).then(base => {
      if (base !== null) {
        void vscode.window
          .showInformationMessage(
            `LatexSpace: «${rel}» удалён локально, но на сервере остался.`,
            'Удалить и на сервере (полная отправка)…'
          )
          .then(pick => {
            if (pick) void vscode.commands.executeCommand('latexspace.pushAll')
          })
      }
    })
  }
}
