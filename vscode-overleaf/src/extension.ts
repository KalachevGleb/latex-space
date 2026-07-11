import AdmZip from 'adm-zip'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'
import { LatexSpaceClient } from './api/client'
import { ChangesDecorations } from './changes/changesDecorations'
import {
  ChangeNode,
  ChangesNode,
  ChangesTreeProvider,
} from './changes/changesTree'
import { LiveCommentController } from './comments/commentController'
import { CommentsService } from './comments/commentsService'
import { CommentsTreeProvider, ThreadNode } from './comments/commentsTree'
import { CommentDecorations } from './comments/decorations'
import { CompileManager } from './compile/compiler'
import { PdfPreview, registerPdfPanelSerializer } from './compile/pdfPreview'
import { SyncTexService } from './compile/synctex'
import {
  buildClient,
  buildClientSilent,
  clearStoredPassword,
  getConfig,
  setCredentialsFlow,
} from './config'
import { FileNode, ProjectsTreeProvider } from './projects/projectsTree'
import { RealtimeManager } from './realtime/realtimeManager'
import { LATEXSPACE_DIR, ProjectMeta, ProjectState } from './sync/state'
import { Conflict, SyncManager } from './sync/syncManager'
import { StatusBarUi } from './ui/statusBar'
import { revealDocumentSmart } from './util/editors'
import {
  contentsEqual,
  readFileOrNull,
  sanitizeZipEntryName,
  walkDir,
} from './util/fsutil'
import { IgnoreMatcher } from './util/glob'

const FOLDER_MEMORY_KEY = 'latexspace.projectFolders'
const OFFLINE_KEY = 'latexspace.offlineMode'

let session: ProjectSession | undefined
let output: vscode.OutputChannel
let projectsTree: ProjectsTreeProvider
let appClient: LatexSpaceClient | undefined
let extContext: vscode.ExtensionContext

// ---------- сессия открытого проекта ----------

class ProjectSession implements vscode.Disposable {
  readonly sync: SyncManager
  readonly compiler: CompileManager
  readonly preview: PdfPreview
  readonly comments: CommentsService
  readonly commentCtl?: LiveCommentController
  readonly tree: CommentsTreeProvider
  readonly decorations: CommentDecorations
  readonly synctex: SyncTexService
  readonly realtime?: RealtimeManager
  readonly changesTree: ChangesTreeProvider
  readonly changesDecorations: ChangesDecorations
  private readonly statusBar: StatusBarUi
  private readonly changesView: vscode.TreeView<ChangesNode>
  private disposables: vscode.Disposable[] = []

  constructor(
    context: vscode.ExtensionContext,
    readonly client: LatexSpaceClient,
    readonly state: ProjectState,
    readonly meta: ProjectMeta,
    readonly offline: boolean
  ) {
    this.sync = new SyncManager(client, state, meta, output)
    this.preview = new PdfPreview(context, state.rootDir)
    this.compiler = new CompileManager(
      client,
      this.sync,
      state,
      meta,
      this.preview,
      output
    )
    this.synctex = new SyncTexService(
      client,
      state,
      meta,
      this.compiler,
      this.preview,
      output
    )
    this.preview.onSyncToCode = click => void this.synctex.backward(click)
    this.comments = new CommentsService(client, meta, output)
    this.tree = new CommentsTreeProvider(this.comments, state.rootDir)
    this.decorations = new CommentDecorations(this.comments, state.rootDir)

    const treeView = vscode.window.createTreeView('latexspaceComments', {
      treeDataProvider: this.tree,
      showCollapseAll: true,
    })
    this.changesTree = new ChangesTreeProvider()
    this.changesDecorations = new ChangesDecorations(state.rootDir)
    const changesView = vscode.window.createTreeView('latexspaceChanges', {
      treeDataProvider: this.changesTree,
      showCollapseAll: true,
    })
    this.changesView = changesView

    const statusBar = new StatusBarUi(this.sync, this.compiler, offline)
    this.statusBar = statusBar

    // обновление дерева файлов в панели «Проекты» при изменениях на диске
    let treePokeTimer: NodeJS.Timeout | undefined
    const pokeFilesTree = () => {
      if (treePokeTimer) clearTimeout(treePokeTimer)
      treePokeTimer = setTimeout(() => projectsTree.poke(), 700)
    }
    const filesWatcher = vscode.workspace.createFileSystemWatcher(
      '**/*',
      false,
      true,
      false
    )
    this.disposables.push(
      filesWatcher,
      filesWatcher.onDidCreate(pokeFilesTree),
      filesWatcher.onDidDelete(pokeFilesTree),
      { dispose: () => treePokeTimer && clearTimeout(treePokeTimer) }
    )
    this.disposables.push(
      this.preview,
      this.sync,
      this.compiler,
      this.comments,
      this.tree,
      this.decorations,
      this.changesTree,
      this.changesDecorations,
      treeView,
      changesView,
      statusBar,
      this.sync.onDidChangeStatus(() => this.publishActiveInfo()),
      this.sync.onDidPull(() => void this.comments.refresh(true))
    )

    if (!offline) {
      // инлайн-комментарии в редакторе (нативный Comments API)
      this.commentCtl = new LiveCommentController(this.comments, state.rootDir)
      this.disposables.push(this.commentCtl)
      // реальное время: правки уходят по мере набора, чужие приходят сразу
      this.realtime = new RealtimeManager(client, state, meta, output)
      this.commentCtl.managesRel = rel =>
        this.realtime?.managesRel(rel) ?? false
      this.realtime.noteSelfWrite = abs => this.sync.noteSelfWrite(abs)
      this.realtime.onTreeChanged = () =>
        void this.sync.pull().catch(() => undefined)
      this.realtime.onCommentsChanged = () =>
        void this.comments.refresh(true)
      this.realtime.onRangesChanged = () => {
        this.changesTree.refresh()
        this.changesDecorations.redrawAll()
        this.decorations.redrawAll()
      }
      this.comments.liveProvider = () => this.realtime!.getLiveRanges()
      this.changesTree.liveProvider = () => this.realtime!.getLiveRanges()
      this.changesDecorations.liveProvider = () =>
        this.realtime!.getLiveRanges()
      this.sync.realtimeFilter = rel => !!this.realtime?.managesRel(rel)
      this.sync.entityResolver = rel => this.realtime?.entityByRel(rel) ?? null
      this.compiler.beforeServerCompile = () =>
        this.realtime!.flushSynchronized()
      this.realtime.onTrackChangesChanged = () => this.updateTrackChangesUi()
      this.disposables.push(
        this.realtime,
        this.realtime.onDidChangeState(s => {
          statusBar.setLive(s === 'connected')
          this.publishActiveInfo()
          this.updateTrackChangesUi()
          void this.comments.refresh(true)
          this.changesTree.refresh()
        })
      )
    }

    if (!offline) {
      const watcher = vscode.workspace.createFileSystemWatcher('**/*')
      this.disposables.push(
        watcher,
        vscode.workspace.onDidSaveTextDocument(doc =>
          this.sync.onLocalSave(doc)
        ),
        watcher.onDidCreate(uri => this.sync.onFsChangeOrCreate(uri)),
        watcher.onDidChange(uri => this.sync.onFsChangeOrCreate(uri)),
        watcher.onDidDelete(uri => {
          if (this.sync.isSelfWrite(uri.fsPath)) return
          const rel = this.sync.relOf(uri)
          if (rel && this.realtime?.managesRel(rel)) {
            // live-документ: отвязать (иначе он будет воссоздан с диска)
            // и передать решение файловой синхронизации
            void this.realtime.handleLocalFileDeleted(rel).then(content => {
              if (content) this.sync.notifyDeleted(rel, content)
            })
          } else {
            this.sync.onFsDelete(uri)
          }
        }),
        vscode.window.onDidChangeWindowState(e => {
          if (e.focused) void this.sync.pollTick()
        }),
        vscode.workspace.onDidChangeConfiguration(e => {
          if (e.affectsConfiguration('latexspace.sync.pollIntervalSeconds')) {
            this.sync.restartPolling()
            this.comments.startPolling(getConfig().pollIntervalSeconds)
          }
        })
      )
    }
  }

  start(): void {
    projectsTree.isUntracked = rel => this.sync.isUntrackedFile(rel)
    if (!this.offline) {
      this.sync.start()
      this.comments.startPolling(getConfig().pollIntervalSeconds)
      this.realtime?.start()
    } else {
      void this.comments.refresh(true).catch(() => undefined)
    }
    this.publishActiveInfo()
    this.updateTrackChangesUi()
  }

  publishActiveInfo(): void {
    projectsTree.setActive({
      projectId: this.meta.projectId,
      projectName: this.meta.projectName,
      rootDir: this.state.rootDir,
      conflicts: this.sync.getStatusInfo().conflicts,
      offline: this.offline,
      live: this.realtime?.isLive() ?? false,
    })
  }

  /** Индикатор режима: статус-бар, значок панели «Правки», context key. */
  updateTrackChangesUi(): void {
    const live = this.realtime?.isLive() ?? false
    const on = live && !!this.realtime?.trackChangesEnabled
    void vscode.commands.executeCommand(
      'setContext',
      'latexspace.trackChanges',
      on
    )
    this.statusBar.setTrackChanges(live && !this.offline, on)
    this.changesView.message = on
      ? 'Рецензирование включено: ваши правки записываются как предлагаемые.'
      : undefined
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    void vscode.commands.executeCommand(
      'setContext',
      'latexspace.trackChanges',
      false
    )
    projectsTree.isUntracked = undefined
    projectsTree.setActive(undefined)
  }
}

// ---------- активация ----------

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  extContext = context
  output = vscode.window.createOutputChannel('LatexSpace')
  context.subscriptions.push(output)
  await vscode.commands.executeCommand('setContext', 'latexspace.active', false)
  await vscode.commands.executeCommand(
    'setContext',
    'latexspace.signedIn',
    false
  )

  projectsTree = new ProjectsTreeProvider()
  context.subscriptions.push(
    projectsTree,
    registerPdfPanelSerializer(context),
    vscode.window.createTreeView('latexspaceProjects', {
      treeDataProvider: projectsTree,
    })
  )

  const cmd = (
    id: string,
    fn: (...args: unknown[]) => unknown
  ): vscode.Disposable =>
    vscode.commands.registerCommand(id, async (...args) => {
      try {
        return await fn(...args)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        output.appendLine(`[error] ${id}: ${msg}`)
        void vscode.window.showErrorMessage(`LatexSpace: ${msg}`)
      }
    })

  const needSession = (): ProjectSession => {
    if (!session) {
      throw new Error(
        'Папка не привязана к проекту LatexSpace. Откройте проект из панели LatexSpace.'
      )
    }
    return session
  }

  const needOnline = (): ProjectSession => {
    const s = needSession()
    if (s.offline) {
      throw new Error(
        'Проект открыт в оффлайн-режиме. Выполните «LatexSpace: Выйти из оффлайн-режима…».'
      )
    }
    return s
  }

  context.subscriptions.push(
    cmd('latexspace.signIn', async () => {
      const ok = await setCredentialsFlow(context)
      if (ok) {
        await initAppClient()
        if (session) {
          // пересоздать сессию проекта с новыми учётными данными
          const { state, meta } = session
          session.dispose()
          session = undefined
          await activateProjectFolder(state, meta)
        } else {
          await tryActivateProject()
        }
      }
    }),
    cmd('latexspace.signOut', async () => {
      // закрыть активную сессию проекта — она работает под этой учёткой
      if (session) {
        session.dispose()
        session = undefined
        await vscode.commands.executeCommand(
          'setContext',
          'latexspace.active',
          false
        )
      }
      await clearStoredPassword(context)
      appClient = undefined
      projectsTree.setClient(undefined)
      await vscode.commands.executeCommand(
        'setContext',
        'latexspace.signedIn',
        false
      )
      void vscode.window.showInformationMessage(
        'LatexSpace: вы вышли из учётной записи. Чтобы продолжить (в том числе под другой учётной записью), нажмите «Войти» в панели LatexSpace.'
      )
    }),
    cmd('latexspace.openProject', () => pickAndOpenProject()),
    cmd('latexspace.openProjectItem', (id, name) =>
      openProjectById(String(id), String(name))
    ),
    cmd('latexspace.projects.refresh', () => projectsTree.refresh()),
    cmd('latexspace.syncNow', () => needOnline().sync.pull()),
    cmd('latexspace.pushAll', () => needOnline().sync.pushFullSync()),
    cmd('latexspace.showConflicts', () => showConflictsUi(needOnline())),
    cmd('latexspace.goOnline', () => goOnline()),
    cmd('latexspace.compile', async () => {
      const s = needSession()
      if (s.offline && (await s.compiler.resolveMode()) === 'server') {
        throw new Error(
          'В оффлайн-режиме доступна только локальная компиляция — установите TeX Live (latexmk).'
        )
      }
      await s.compiler.compile()
    }),
    cmd('latexspace.stopCompile', () => needSession().compiler.stop()),
    cmd('latexspace.showPdf', async () => {
      const s = needSession()
      return s.preview.showFile(
        s.compiler.pdfPath,
        await s.compiler.previewTitle()
      )
    }),
    cmd('latexspace.showLog', () => needSession().compiler.showLog()),
    cmd('latexspace.syncToPdf', () => {
      const editor = vscode.window.activeTextEditor
      if (editor) void needSession().synctex.forward(editor)
    }),
    cmd('latexspace.syncMenu', () => syncMenuUi(needSession())),
    cmd('latexspace.comments.refresh', () => needSession().comments.refresh()),
    cmd('latexspace.comments.toggleResolved', () =>
      needSession().tree.toggleResolved()
    ),
    cmd('latexspace.comments.open', threadId =>
      needSession().decorations.revealThread(String(threadId))
    ),
    cmd('latexspace.comments.reply', async node => {
      const s = needSession()
      const thread = node instanceof ThreadNode ? node.thread : undefined
      if (!thread) return
      const text = await vscode.window.showInputBox({
        title: 'Ответ на комментарий',
        prompt: thread.quoted
          ? `Фрагмент: «${thread.quoted.slice(0, 80)}»`
          : undefined,
        ignoreFocusOut: true,
      })
      if (text) await s.comments.reply(thread.threadId, text)
    }),
    cmd('latexspace.comments.resolve', async node => {
      if (node instanceof ThreadNode) {
        await needSession().comments.resolve(node.thread)
      }
    }),
    cmd('latexspace.comments.reopen', async node => {
      if (node instanceof ThreadNode) {
        await needSession().comments.reopen(node.thread)
      }
    }),
    cmd('latexspace.comments.add', () => addCommentCommand(needSession())),
    // инлайн-виджет Comments API: создание треда из «+» на gutter'е
    cmd('latexspace.commentCreate', async reply => {
      await createCommentFromWidget(
        needOnline(),
        reply as vscode.CommentReply
      )
    }),
    cmd('latexspace.commentReplyInline', async reply => {
      const s = needOnline()
      const r = reply as vscode.CommentReply
      const threadId = s.commentCtl?.threadIdOf(r.thread)
      if (!threadId) throw new Error('Тред не найден')
      await s.comments.reply(threadId, r.text)
      await s.comments.refresh(true)
    }),
    cmd('latexspace.commentResolveInline', async arg => {
      const s = needOnline()
      // из кнопки виджета приходит CommentReply, из других мест — сам тред
      const maybeReply = arg as Partial<vscode.CommentReply>
      const t = (maybeReply?.thread ?? arg) as vscode.CommentThread
      const threadId = s.commentCtl?.threadIdOf(t)
      const model = threadId ? s.comments.threadById(threadId) : undefined
      if (!model) throw new Error('Тред не найден')
      await s.comments.resolve(model)
    }),
    // Ctrl/Cmd+S в .tex: компиляция (сохранение выполняется в её начале)
    cmd('latexspace.saveAndCompile', async () => {
      if (!session || session.compiler.isCompiling) {
        await vscode.workspace.saveAll(false)
        return
      }
      await vscode.commands.executeCommand('latexspace.compile')
    }),
    cmd('latexspace.sendNewFiles', () =>
      needOnline().sync.pickAndSendUntracked()
    ),
    // кнопка ↑ у файла «не на сервере» в панели
    cmd('latexspace.pushFile', async node => {
      if (!(node instanceof FileNode)) return
      await needOnline().sync.sendFile(node.rel)
      projectsTree.poke()
    }),
    cmd('latexspace.checkConflicts', () =>
      suggestDisablingConflicts(needSession().state, true)
    ),
    cmd('latexspace.fineGrained.toggle', async () => {
      const on = !getConfig().syncFineGrained
      await vscode.workspace
        .getConfiguration('latexspace')
        .update('synctex.fineGrained', on, vscode.ConfigurationTarget.Global)
      vscode.window.setStatusBarMessage(
        `LatexSpace: точный SyncTeX (по слову) ${on ? 'включён' : 'выключен'}`,
        4000
      )
    }),
    // тот же переключатель под другим id — для пункта с «✓» в меню панели
    cmd('latexspace.fineGrained.toggleOff', () =>
      vscode.commands.executeCommand('latexspace.fineGrained.toggle')
    ),
    cmd('latexspace.trackChanges.toggle', () => {
      const s = needSession()
      if (!s.realtime || !s.realtime.isLive()) {
        throw new Error(
          'Рецензирование доступно только при live-подключении к серверу.'
        )
      }
      s.realtime.trackChangesEnabled = !s.realtime.trackChangesEnabled
      s.updateTrackChangesUi()
    }),
    // тот же переключатель под другим id — для «зажатого» значка в панели
    cmd('latexspace.trackChanges.toggleOff', () =>
      vscode.commands.executeCommand('latexspace.trackChanges.toggle')
    ),
    cmd('latexspace.changes.open', async node => {
      if (!(node instanceof ChangeNode)) return
      const s = needSession()
      const abs = s.state.localPath(node.rel)
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs))
      const p = Math.min(node.display.p, doc.getText().length)
      const start = doc.positionAt(p)
      const end = doc.positionAt(
        Math.min(
          p + (node.display.ins?.op.i?.length ?? 0),
          doc.getText().length
        )
      )
      await revealDocumentSmart(
        vscode.Uri.file(abs),
        new vscode.Range(start, end)
      )
    }),
    cmd('latexspace.changes.accept', async node => {
      if (!(node instanceof ChangeNode)) return
      const s = needSession()
      const what = node.display.kind === 'replace' ? 'замену' : 'правку'
      const pick = await vscode.window.showWarningMessage(
        `Принять ${what} в «${node.rel}»?`,
        { modal: true },
        'Принять'
      )
      if (pick !== 'Принять') return
      await s.client.acceptChanges(
        s.meta.projectId,
        node.docId,
        node.display.ids
      )
      s.realtime?.applyAcceptedChanges(node.docId, node.display.ids)
    }),
    cmd('latexspace.changes.reject', async node => {
      if (!(node instanceof ChangeNode)) return
      const s = needSession()
      const what = node.display.kind === 'replace' ? 'замену' : 'правку'
      const pick = await vscode.window.showWarningMessage(
        `Отклонить ${what} в «${node.rel}»? Текст вернётся к исходному состоянию.`,
        { modal: true },
        'Отклонить'
      )
      if (pick !== 'Отклонить') return
      await s.realtime?.rejectChanges(node.docId, node.display.ids)
    })
  )

  // Ctrl/Cmd+Click в .tex → показать место в PDF (SyncTeX).
  // ВАЖНО: definition-провайдер вызывается и при Ctrl+НАВЕДЕНИИ (подсветка
  // ссылки) — без фильтра PDF прокручивался бы сам по себе. Поэтому
  // синхронизацию запускаем только когда за вызовом провайдера следует
  // реальный клик мышью в то же место (перемещение курсора).
  let pendingSyncClick:
    | { uri: string; pos: vscode.Position; ts: number }
    | undefined
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      [
        { language: 'latex', scheme: 'file' },
        { language: 'tex', scheme: 'file' },
      ],
      {
        provideDefinition(doc, pos) {
          if (!session || !session.preview.isOpen) return undefined
          pendingSyncClick = {
            uri: doc.uri.toString(),
            pos,
            ts: Date.now(),
          }
          return undefined
        },
      }
    ),
    vscode.window.onDidChangeTextEditorSelection(e => {
      const p = pendingSyncClick
      if (!p) return
      if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse) return
      if (Date.now() - p.ts > 400) {
        pendingSyncClick = undefined
        return
      }
      const active = e.selections[0]?.active
      if (
        !active ||
        e.textEditor.document.uri.toString() !== p.uri ||
        active.line !== p.pos.line ||
        Math.abs(active.character - p.pos.character) > 2
      ) {
        return
      }
      pendingSyncClick = undefined
      const fakeEditor = {
        document: e.textEditor.document,
        selection: new vscode.Selection(p.pos, p.pos),
      } as vscode.TextEditor
      void session?.synctex.forward(fakeEditor)
    })
  )

  // deep links со страницы LatexSpace: vscode://peer-review.latexspace/open
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri: uri => void handleIncomingUri(uri),
    })
  )

  // context key для горячей клавиши Ctrl/Cmd+S → компиляция
  const updateCompileOnSaveCtx = () =>
    void vscode.commands.executeCommand(
      'setContext',
      'latexspace.compileOnSave',
      getConfig().compileOnSave
    )
  updateCompileOnSaveCtx()
  // context key для «галочки» точного SyncTeX в меню «…» панели
  const updateFineGrainedCtx = () =>
    void vscode.commands.executeCommand(
      'setContext',
      'latexspace.fineGrained',
      getConfig().syncFineGrained
    )
  updateFineGrainedCtx()
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('latexspace.compile.onSave')) {
        updateCompileOnSaveCtx()
      }
      if (e.affectsConfiguration('latexspace.synctex.fineGrained')) {
        updateFineGrainedCtx()
      }
    })
  )

  await initAppClient()
  await tryActivateProject()
}

// ---------- конфликтующие функции других расширений ----------

/** Настройки-триггеры автосборки/автодействий при сохранении. */
const AUTO_TRIGGER_PATTERNS = [
  /auto ?build/i,
  /auto ?compile/i,
  /(build|compile)\.?on ?save/i,
  /on ?save.*(build|compile)/i,
  /auto.*preview|preview.*auto/i,
]

interface ConflictSetting {
  fullKey: string
  disableValue: unknown
  extName: string
}

/**
 * Найти у УСТАНОВЛЕННЫХ расширений включённые настройки автокомпиляции
 * и подобных триггеров (по манифестам, а не по зашитому списку — покрывает
 * LaTeX Workshop, mathematic.vscode-latex и будущие). Отключаются только
 * эти функции; подсветка, сниппеты и прочее не затрагиваются.
 */
function findConflictingAutoTriggers(scope?: vscode.Uri): ConflictSetting[] {
  const found: ConflictSetting[] = []
  const cfg = vscode.workspace.getConfiguration(undefined, scope)
  for (const ext of vscode.extensions.all) {
    if (ext.id.startsWith('vscode.') || ext.id === 'peer-review.latexspace') {
      continue
    }
    const pkg = ext.packageJSON as {
      displayName?: string
      contributes?: { configuration?: unknown }
    }
    const conf = pkg?.contributes?.configuration
    const blocks = (Array.isArray(conf) ? conf : conf ? [conf] : []) as Array<{
      properties?: Record<string, { type?: string; enum?: unknown[]; default?: unknown }>
    }>
    for (const block of blocks) {
      for (const [fullKey, schema] of Object.entries(block?.properties ?? {})) {
        if (!AUTO_TRIGGER_PATTERNS.some(p => p.test(fullKey))) continue
        let disableValue: unknown
        if (schema?.type === 'boolean') disableValue = false
        else if (Array.isArray(schema?.enum) && schema.enum.includes('never')) {
          disableValue = 'never'
        } else continue
        const effective = cfg.get(fullKey) ?? schema?.default
        if (effective === disableValue || effective === undefined) continue
        if (schema?.type === 'boolean' && effective === false) continue
        found.push({
          fullKey,
          disableValue,
          extName: pkg.displayName || ext.id,
        })
      }
    }
  }
  return found
}

async function suggestDisablingConflicts(
  state: ProjectState,
  force = false
): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(state.rootDir)
  )
  const found = findConflictingAutoTriggers(folder?.uri)
  if (found.length === 0) {
    if (force) {
      void vscode.window.showInformationMessage(
        'LatexSpace: включённых конфликтующих автофункций у других расширений не найдено.'
      )
    }
    return
  }
  const signature = found.map(f => f.fullKey).sort().join(',')
  const PROMPT_KEY = 'latexspace.conflictPrompted'
  if (!force && extContext.workspaceState.get<string>(PROMPT_KEY) === signature)
    return
  const names = [...new Set(found.map(f => f.extName))].join(', ')
  output.appendLine(
    `Конфликтующие автотриггеры: ${found.map(f => f.fullKey).join(', ')}`
  )
  const pick = await vscode.window.showWarningMessage(
    `LatexSpace: у расширений «${names}» включена автокомпиляция/автодействия при сохранении — они создают лишние файлы и мешают синхронизации. Отключить только эти функции в настройках рабочей области? Подсветка синтаксиса и остальные возможности расширений сохранятся.`,
    `Отключить (${found.length})`,
    'Не отключать'
  )
  await extContext.workspaceState.update(PROMPT_KEY, signature)
  if (pick !== `Отключить (${found.length})`) return
  const cfg = vscode.workspace.getConfiguration(undefined, folder?.uri)
  for (const f of found) {
    try {
      await cfg.update(
        f.fullKey,
        f.disableValue,
        vscode.ConfigurationTarget.Workspace
      )
      output.appendLine(`  ${f.fullKey} → ${JSON.stringify(f.disableValue)}`)
    } catch (err) {
      output.appendLine(
        `  не удалось изменить ${f.fullKey}: ${err instanceof Error ? err.message : err}`
      )
    }
  }
  void vscode.window.showInformationMessage(
    'LatexSpace: конфликтующие автофункции отключены (настройки рабочей области).'
  )
}

/**
 * Обработка vscode:// (cursor://) ссылок:
 *   …/open?server=<url>              — вход и выбор проекта
 *   …/open?server=<url>&projectId=…&name=… — открыть конкретный проект
 */
async function handleIncomingUri(uri: vscode.Uri): Promise<void> {
  try {
    const params = new URLSearchParams(uri.query)
    const server = params.get('server')?.trim().replace(/\/+$/, '')
    await vscode.commands.executeCommand('workbench.view.extension.latexspace')
    if (!appClient) {
      const ok = await setCredentialsFlow(extContext, server || undefined)
      if (!ok) return
      await initAppClient()
      if (!appClient) return
    }
    const projectId = params.get('projectId')
    if (projectId) {
      await openProjectById(projectId, params.get('name') || 'project')
    } else if (!session) {
      await pickAndOpenProject()
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    output.appendLine(`[error] uri handler: ${msg}`)
    void vscode.window.showErrorMessage(`LatexSpace: ${msg}`)
  }
}

export function deactivate(): void {
  session?.dispose()
  session = undefined
}

async function initAppClient(): Promise<void> {
  appClient = await buildClientSilent(extContext)
  if (appClient) attachAuthRejectedHandler(appClient)
  projectsTree.setClient(appClient)
  await vscode.commands.executeCommand(
    'setContext',
    'latexspace.signedIn',
    !!appClient
  )
}

// ---------- отклонённый вход (пароль сменился / учётка отключена) ----------

let authPromptVisible = false

/**
 * Сервер отклонил учётные данные: клиент уже остановил автоповторы
 * (защита от rate limiter логина) — предлагаем войти заново.
 */
function attachAuthRejectedHandler(client: LatexSpaceClient): void {
  client.onAuthRejected = () => {
    if (authPromptVisible) return
    authPromptVisible = true
    void vscode.window
      .showWarningMessage(
        'LatexSpace: сервер отклонил вход — возможно, пароль изменился. Фоновая синхронизация остановлена до повторного входа.',
        'Войти…'
      )
      .then(pick => {
        authPromptVisible = false
        if (pick === 'Войти…') {
          void vscode.commands.executeCommand('latexspace.signIn')
        }
      })
  }
}

// ---------- активация проекта в открытой папке ----------

async function tryActivateProject(): Promise<void> {
  if (session) return
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme !== 'file') continue
    await migrateLegacyStateDir(folder.uri.fsPath)
    const loaded = await ProjectState.load(folder.uri.fsPath)
    if (!loaded) continue
    await activateProjectFolder(loaded.state, loaded.meta)
    return
  }
}

/** Миграция со старой версии плагина: .overleaf → .latexspace. */
async function migrateLegacyStateDir(rootDir: string): Promise<void> {
  const legacy = path.join(rootDir, '.overleaf')
  const current = path.join(rootDir, LATEXSPACE_DIR)
  try {
    await fs.access(path.join(legacy, 'project.json'))
    await fs.access(current).then(
      () => undefined,
      async () => {
        await fs.rename(legacy, current)
        output.appendLine('Служебная папка .overleaf переименована в .latexspace')
      }
    )
  } catch {
    /* старой папки нет */
  }
}

async function activateProjectFolder(
  state: ProjectState,
  meta: ProjectMeta
): Promise<void> {
  // запомнить папку проекта
  const memory = extContext.globalState.get<Record<string, string>>(
    FOLDER_MEMORY_KEY,
    {}
  )
  if (memory[meta.projectId] !== state.rootDir) {
    memory[meta.projectId] = state.rootDir
    await extContext.globalState.update(FOLDER_MEMORY_KEY, memory)
  }

  const client = await buildClient(extContext, meta)
  if (!client) {
    output.appendLine(
      'Проект найден, но вход не выполнен — работа приостановлена.'
    )
    return
  }
  attachAuthRejectedHandler(client)

  const wasOffline = extContext.workspaceState.get<boolean>(OFFLINE_KEY, false)
  let offline = wasOffline
  if (!wasOffline) {
    offline = !(await startupReconcile(client, state, meta))
    await extContext.workspaceState.update(OFFLINE_KEY, offline)
  }

  session = new ProjectSession(extContext, client, state, meta, offline)
  extContext.subscriptions.push(session)
  session.start()
  await vscode.commands.executeCommand('setContext', 'latexspace.active', true)
  output.appendLine(
    `Проект «${meta.projectName}» на ${meta.serverUrl}${offline ? ' [оффлайн]' : ''}`
  )

  await applyHiddenFilePatterns(state)
  void suggestDisablingConflicts(state)
  // установили/включили новое расширение — перепроверить автотриггеры
  extContext.subscriptions.push(
    vscode.extensions.onDidChange(() => void suggestDisablingConflicts(state))
  )

  // первый запуск после открытия проекта — открыть главный файл
  if (meta.openMainOnActivate) {
    meta.openMainOnActivate = false
    await state.saveMeta(meta)
    const root = await session.compiler.findRootFile()
    if (root) {
      try {
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.file(state.localPath(root))
        )
        await vscode.window.showTextDocument(doc, { preview: false })
      } catch {
        /* нет главного файла — не страшно */
      }
    }
  }
}

/**
 * Стартовая сверка «локальная папка ↔ база ↔ сервер».
 * Возвращает true = работать онлайн, false = оффлайн-режим.
 */
async function startupReconcile(
  client: LatexSpaceClient,
  state: ProjectState,
  meta: ProjectMeta
): Promise<boolean> {
  const matcher = new IgnoreMatcher([
    `${LATEXSPACE_DIR}/**`,
    ...getConfig().ignore,
  ])

  // локальные изменения относительно базы
  const localList = await walkDir(state.rootDir, matcher)
  const baseList = await state.listBase()
  const changedLocal: string[] = []
  for (const rel of new Set([...localList, ...baseList])) {
    const L = await readFileOrNull(state.localPath(rel))
    const B = await state.readBase(rel)
    if (!contentsEqual(L, B)) changedLocal.push(rel)
  }
  if (changedLocal.length === 0) return true // штатный запуск, pull всё сделает

  // есть локальные изменения — узнаём состояние сервера
  let serverChanged = -1
  try {
    const zipBuf = await client.downloadZip(meta.projectId)
    const server = new Map<string, Buffer>()
    for (const entry of new AdmZip(zipBuf).getEntries()) {
      if (entry.isDirectory) continue
      const rel = sanitizeZipEntryName(entry.entryName)
      if (!rel || matcher.ignoresFile(rel)) continue
      server.set(rel, entry.getData())
    }
    serverChanged = 0
    for (const rel of new Set([...server.keys(), ...baseList])) {
      const S = server.get(rel) ?? null
      const B = await state.readBase(rel)
      if (!contentsEqual(S, B)) serverChanged++
    }
  } catch {
    const pick = await vscode.window.showWarningMessage(
      'LatexSpace: есть неотправленные локальные изменения, а сервер недоступен. Проект будет открыт в оффлайн-режиме.',
      { modal: true },
      'Оффлайн-режим'
    )
    return pick === undefined ? false : false
  }

  const details =
    serverChanged > 0
      ? `Сервер тоже изменился (${serverChanged} файл(ов)) — расхождения будут показаны как конфликты и не перезапишутся автоматически.`
      : 'На сервере изменений нет — локальные правки будут отправлены.'
  const pick = await vscode.window.showWarningMessage(
    `LatexSpace: в папке есть изменения, не синхронизированные с сервером (${changedLocal.length} файл(ов)). ${details}`,
    { modal: true },
    'Синхронизировать',
    'Показать изменения…',
    'Оффлайн-режим'
  )
  if (pick === 'Показать изменения…') {
    await showLocalChangesUi(state, changedLocal)
    return startupReconcile(client, state, meta) // спросить заново
  }
  if (pick === 'Синхронизировать') return true
  // «Оффлайн-режим» или диалог закрыт — не трогаем сервер
  return false
}

async function showLocalChangesUi(
  state: ProjectState,
  changed: string[]
): Promise<void> {
  const pick = await vscode.window.showQuickPick(
    changed.map(rel => ({ label: rel })),
    { title: 'Локальные изменения (относительно последней синхронизации)' }
  )
  if (!pick) return
  const base = state.basePath(pick.label)
  const local = state.localPath(pick.label)
  await vscode.commands.executeCommand(
    'vscode.diff',
    vscode.Uri.file(base),
    vscode.Uri.file(local),
    `${pick.label}: синхронизировано ↔ локально`
  )
  await showLocalChangesUi(state, changed)
}

async function goOnline(): Promise<void> {
  if (!session) return
  if (!session.offline) {
    void vscode.window.showInformationMessage('LatexSpace: проект уже онлайн.')
    return
  }
  await extContext.workspaceState.update(OFFLINE_KEY, false)
  const { state, meta } = session
  session.dispose()
  session = undefined
  await activateProjectFolder(state, meta)
}

/** Скрыть служебные файлы журнала из проводника (files.exclude). */
async function applyHiddenFilePatterns(state: ProjectState): Promise<void> {
  const patterns = getConfig().hiddenFilePatterns
  const folder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(state.rootDir)
  )
  if (!folder) return
  const filesCfg = vscode.workspace.getConfiguration('files', folder.uri)
  const current = {
    ...(filesCfg.get<Record<string, boolean>>('exclude') ?? {}),
  }
  let changed = false
  for (const p of [...patterns, LATEXSPACE_DIR]) {
    if (!(p in current)) {
      current[p] = true
      changed = true
    }
  }
  if (changed) {
    try {
      await filesCfg.update(
        'exclude',
        current,
        vscode.ConfigurationTarget.WorkspaceFolder
      )
    } catch {
      /* нет прав на запись настроек — не критично */
    }
  }
}

// ---------- открытие проекта ----------

function sanitizeName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'project'
}

async function pickAndOpenProject(): Promise<void> {
  if (!appClient) {
    const ok = await setCredentialsFlow(extContext)
    if (!ok) return
    await initAppClient()
    if (!appClient) return
  }
  const projects = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'LatexSpace: список проектов…',
    },
    () => appClient!.listProjects()
  )
  if (projects.length === 0) {
    void vscode.window.showInformationMessage('Проектов на сервере нет.')
    return
  }
  const pick = await vscode.window.showQuickPick(
    projects.map(p => ({
      label: p.name,
      description: p.lastUpdated
        ? new Date(p.lastUpdated).toLocaleDateString()
        : undefined,
      id: p.id,
    })),
    { title: 'Выберите проект LatexSpace' }
  )
  if (pick) await openProjectById(pick.id, pick.label)
}

async function openProjectById(
  projectId: string,
  projectName: string
): Promise<void> {
  if (!appClient) {
    void vscode.window.showWarningMessage('LatexSpace: сначала войдите.')
    return
  }
  if (session?.meta.projectId === projectId) {
    void vscode.window.showInformationMessage(
      `Проект «${projectName}» уже открыт.`
    )
    return
  }
  // вспомнить прежнюю папку
  const memory = extContext.globalState.get<Record<string, string>>(
    FOLDER_MEMORY_KEY,
    {}
  )
  const remembered = memory[projectId]
  if (remembered) {
    const loaded = await ProjectState.load(remembered)
    if (loaded && loaded.meta.projectId === projectId) {
      await vscode.commands.executeCommand(
        'vscode.openFolder',
        vscode.Uri.file(remembered),
        { forceNewWindow: !!vscode.workspace.workspaceFolders?.length }
      )
      return
    }
    delete memory[projectId]
    await extContext.globalState.update(FOLDER_MEMORY_KEY, memory)
  }

  const parent = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Сохранить проект сюда',
    title: `Папка для проекта «${projectName}»`,
  })
  if (!parent || parent.length === 0) return

  const targetDir = path.join(parent[0].fsPath, sanitizeName(projectName))
  try {
    const existing = await fs.readdir(targetDir)
    if (existing.length > 0) {
      void vscode.window.showErrorMessage(
        `Папка «${targetDir}» уже существует и не пуста.`
      )
      return
    }
  } catch {
    /* папки нет — отлично */
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `LatexSpace: скачивание «${projectName}»…`,
    },
    async () => {
      const [zipBuf, version] = await Promise.all([
        appClient!.downloadZip(projectId),
        appClient!.getLatestVersion(projectId),
      ])
      const state = new ProjectState(targetDir)
      const files = new Map<string, Buffer>()
      for (const entry of new AdmZip(zipBuf).getEntries()) {
        if (entry.isDirectory) continue
        const rel = sanitizeZipEntryName(entry.entryName)
        if (!rel) continue
        files.set(rel, entry.getData())
      }
      for (const [rel, buf] of files) {
        await fs.mkdir(path.dirname(path.join(targetDir, rel)), {
          recursive: true,
        })
        await fs.writeFile(path.join(targetDir, rel), buf)
      }
      // в базовую копию — только синхронизируемые файлы
      const matcher = new IgnoreMatcher([
        `${LATEXSPACE_DIR}/**`,
        ...getConfig().ignore,
      ])
      const baseFiles = new Map(
        [...files].filter(([rel]) => !matcher.ignoresFile(rel))
      )
      await state.resetBase(baseFiles)
      const cfg = getConfig()
      const meta: ProjectMeta = {
        serverUrl: cfg.serverUrl,
        projectId,
        projectName,
        lastSyncedVersion: version,
        userEmail: cfg.userEmail || undefined,
        openMainOnActivate: true,
      }
      await state.saveMeta(meta)
      const mem = extContext.globalState.get<Record<string, string>>(
        FOLDER_MEMORY_KEY,
        {}
      )
      mem[projectId] = targetDir
      await extContext.globalState.update(FOLDER_MEMORY_KEY, mem)
    }
  )

  const openHere = !vscode.workspace.workspaceFolders?.length
  await vscode.commands.executeCommand(
    'vscode.openFolder',
    vscode.Uri.file(targetDir),
    { forceNewWindow: !openHere }
  )
}

// ---------- добавление комментария ----------

/**
 * Создание треда из инлайн-виджета Comments API («+» на gutter'е):
 * цитата — выделенный диапазон треда (или строка целиком), текст — из
 * поля ввода виджета. Временный тред VSCode закрывается — управляемый
 * появится из модели после refresh.
 */
async function createCommentFromWidget(
  s: ProjectSession,
  reply: vscode.CommentReply
): Promise<void> {
  const thread = reply.thread
  try {
    if (!s.realtime?.isLive()) {
      throw new Error('Добавление комментариев доступно только при live-подключении.')
    }
    const doc = await vscode.workspace.openTextDocument(thread.uri)
    const rel = s.sync.relOf(thread.uri)
    if (!rel) throw new Error('Файл вне папки проекта')
    let range = thread.range ?? new vscode.Range(0, 0, 0, 0)
    if (range.isEmpty) {
      // «+» нажали без выделения — комментируем строку целиком
      range = doc.lineAt(range.start.line).range
    }
    const quoted = doc.getText(range)
    const threadId = genObjectId()
    await s.comments.createThread(threadId, reply.text)
    const anchored = s.realtime.addCommentAnchor(
      rel,
      doc.offsetAt(range.start),
      quoted,
      threadId
    )
    if (!anchored) {
      throw new Error('Не удалось поставить якорь: документ не подключён live.')
    }
    await s.comments.refresh(true)
  } finally {
    thread.dispose()
  }
}

function genObjectId(): string {
  return [...Array(24)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('')
}

async function addCommentCommand(s: ProjectSession): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.selection.isEmpty) {
    void vscode.window.showInformationMessage(
      'Выделите текст, к которому относится комментарий.'
    )
    return
  }
  if (!s.realtime?.isLive()) {
    throw new Error(
      'Добавление комментариев доступно только при live-подключении.'
    )
  }
  const rel = s.sync.relOf(editor.document.uri)
  if (!rel) return
  const quoted = editor.document.getText(editor.selection)
  const pos = editor.document.offsetAt(editor.selection.start)
  const content = await vscode.window.showInputBox({
    title: 'Новый комментарий',
    prompt: `К фрагменту: «${quoted.slice(0, 60)}»`,
    ignoreFocusOut: true,
  })
  if (!content) return
  const threadId = genObjectId()
  // как в вебе: сначала текст треда (REST), затем якорь (OT-операция)
  await s.comments.createThread(threadId, content)
  const anchored = s.realtime.addCommentAnchor(rel, pos, quoted, threadId)
  if (!anchored) {
    throw new Error('Не удалось поставить якорь: документ не подключён live.')
  }
  await s.comments.refresh(true)
}

// ---------- меню синхронизации и конфликты ----------

async function syncMenuUi(s: ProjectSession): Promise<void> {
  const info = s.sync.getStatusInfo()
  interface Item extends vscode.QuickPickItem {
    action: () => Promise<unknown> | unknown
  }
  const items: Item[] = []
  const live = s.realtime?.isLive() ?? false
  if (s.offline) {
    items.push({
      label: '$(plug) Выйти из оффлайн-режима…',
      action: () => goOnline(),
    })
  } else if (live) {
    items.push({
      label: '$(broadcast) Реальное время активно',
      description: 'правки синхронизируются по мере набора',
      action: () => undefined,
    })
    items.push({
      label: `$(comment-draft) Рецензирование (track changes): ${s.realtime?.trackChangesEnabled ? 'вкл' : 'выкл'}`,
      description: 'переключить',
      action: () =>
        vscode.commands.executeCommand('latexspace.trackChanges.toggle'),
    })
    items.push({
      label: '$(cloud-upload) Полная отправка на сервер (с удалениями)…',
      description: 'файловая синхронизация: новые файлы и удаления',
      action: () => s.sync.pushFullSync(),
    })
  } else {
    items.push(
      {
        label: '$(sync) Синхронизировать сейчас',
        description: `версия ${info.lastSyncedVersion}`,
        action: () => s.sync.pull(),
      },
      {
        label: '$(cloud-upload) Полная отправка на сервер (с удалениями)…',
        action: () => s.sync.pushFullSync(),
      }
    )
  }
  if (!s.offline && s.sync.getUntrackedCount() > 0) {
    items.unshift({
      label: `$(new-file) Новые файлы (${s.sync.getUntrackedCount()}) — отправить на сервер…`,
      action: () => s.sync.pickAndSendUntracked(),
    })
  }
  if (!s.offline && info.conflicts > 0) {
    items.unshift({
      label: `$(warning) Конфликты (${info.conflicts})…`,
      action: () => showConflictsUi(s),
    })
  }
  // выключатель точного SyncTeX (он же — галочка в меню «…» панели)
  const fine = getConfig().syncFineGrained
  items.push({
    label: `$(target) Точный SyncTeX (по слову): ${fine ? 'вкл' : 'выкл'}`,
    description: 'переключить',
    action: () =>
      vscode.commands.executeCommand('latexspace.fineGrained.toggle'),
  })
  items.push(
    {
      label: '$(file-pdf) Показать PDF',
      action: async () =>
        s.preview.showFile(s.compiler.pdfPath, await s.compiler.previewTitle()),
    },
    {
      label: '$(output) Журнал',
      action: () => output.show(true),
    },
    {
      label: '$(account) Сменить учётные данные…',
      action: () => vscode.commands.executeCommand('latexspace.signIn'),
    }
  )
  const pick = await vscode.window.showQuickPick(items, {
    title: 'LatexSpace: синхронизация',
  })
  if (pick) await pick.action()
}

async function showConflictsUi(s: ProjectSession): Promise<void> {
  const conflicts = s.sync.getConflicts()
  if (conflicts.length === 0) {
    void vscode.window.showInformationMessage('Конфликтов нет.')
    return
  }
  interface Item extends vscode.QuickPickItem {
    conflict: Conflict
  }
  const pick = await vscode.window.showQuickPick<Item>(
    conflicts.map(c => ({
      label: `$(warning) ${c.rel}`,
      description:
        c.kind === 'deletedOnServer'
          ? 'удалён на сервере, изменён локально'
          : c.kind === 'deletedLocally'
            ? 'удалён локально, изменён на сервере'
            : 'изменён и на сервере, и локально',
      conflict: c,
    })),
    { title: 'Конфликты синхронизации' }
  )
  if (!pick) return
  const c = pick.conflict

  const actions: Array<vscode.QuickPickItem & { act: () => Promise<void> }> = [
    {
      label: '$(diff) Сравнить (сервер ↔ локально)',
      act: async () => {
        await s.sync.showConflictDiff(c)
        await showConflictsUi(s)
      },
    },
    {
      label: '$(cloud-download) Взять серверную версию',
      description:
        c.kind === 'deletedOnServer'
          ? 'удалить локальный файл (копия останется в .latexspace/trash)'
          : c.kind === 'deletedLocally'
            ? 'вернуть удалённый файл с сервера'
            : 'перезаписать локальный файл (локальные правки будут потеряны!)',
      act: () => s.sync.resolveTakeServer(c),
    },
    {
      label: '$(cloud-upload) Оставить локальную версию',
      description:
        c.kind === 'deletedLocally'
          ? 'файла нет локально — удалить его и на сервере'
          : 'отправить локальный файл на сервер',
      act: () => s.sync.resolveKeepLocal(c),
    },
  ]
  const action = await vscode.window.showQuickPick(actions, {
    title: `Конфликт: ${c.rel}`,
  })
  if (action) await action.act()
}
