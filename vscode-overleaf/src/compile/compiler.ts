import { ChildProcess, spawn } from 'child_process'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'
import { LatexSpaceClient } from '../api/client'
import { getConfig } from '../config'
import { ProjectMeta, ProjectState } from '../sync/state'
import { SyncManager } from '../sync/syncManager'
import { issuesToDiagnostics, parseLatexLog } from './logParser'
import { PdfPreview } from './pdfPreview'

export type CompileState = 'idle' | 'compiling'

/** Расширения артефактов LaTeX для уборки из корня проекта. */
const ARTIFACT_EXTS = [
  'aux', 'log', 'out', 'toc', 'lof', 'lot', 'fls', 'fdb_latexmk',
  'bbl', 'blg', 'nav', 'snm', 'vrb', 'synctex.gz', 'synctex(busy)',
  'bcf', 'run.xml', 'idx', 'ilg', 'ind', 'xdv',
]

export class CompileManager implements vscode.Disposable {
  private stateEmitter = new vscode.EventEmitter<CompileState>()
  readonly onDidChangeState = this.stateEmitter.event
  private compiling = false
  private localProcess?: ChildProcess
  private diagnostics: vscode.DiagnosticCollection
  /** clsiServerId последней серверной компиляции — нужен для SyncTeX */
  lastClsiServerId?: string
  /** buildId последней серверной компиляции — нужен для SyncTeX */
  lastBuildId?: string
  /** идентификатор «редактора» для серверных compile/sync запросов */
  readonly editorId: string = randomUUID()
  /** главный файл последней локальной компиляции (для synctex CLI) */
  lastLocalRoot?: string
  /** вызывается перед серверной компиляцией (например, flush real-time) */
  beforeServerCompile?: () => Promise<void>

  constructor(
    private client: LatexSpaceClient,
    private sync: SyncManager,
    private state: ProjectState,
    private meta: ProjectMeta,
    private preview: PdfPreview,
    private output: vscode.OutputChannel
  ) {
    this.diagnostics = vscode.languages.createDiagnosticCollection(
      'latexspace-latex'
    )
  }

  dispose(): void {
    this.diagnostics.dispose()
    this.stateEmitter.dispose()
  }

  get isCompiling(): boolean {
    return this.compiling
  }

  get pdfPath(): string {
    return path.join(this.state.outDir, 'output.pdf')
  }

  get logPath(): string {
    return path.join(this.state.outDir, 'output.log')
  }

  async compile(): Promise<void> {
    if (this.compiling) {
      void vscode.window.showInformationMessage(
        'Компиляция уже идёт. Остановить — командой «LatexSpace: Остановить компиляцию».'
      )
      return
    }
    this.compiling = true
    this.stateEmitter.fire('compiling')
    const startedAt = Date.now()
    try {
      // 1. сохранить все буферы и дождаться отправки изменений
      await vscode.workspace.saveAll(false)
      const cfg = getConfig()
      if (cfg.compileMode === 'server') {
        await this.beforeServerCompile?.()
        await this.sync.pushAllDirty()
        await this.sync.flushPending()
        await this.compileOnServer()
      } else {
        await this.compileLocally()
      }
      const secs = ((Date.now() - startedAt) / 1000).toFixed(1)
      this.output.appendLine(`[compile] завершено за ${secs} c`)
    } finally {
      this.compiling = false
      this.stateEmitter.fire('idle')
    }
  }

  async stop(): Promise<void> {
    if (getConfig().compileMode === 'server') {
      await this.client.stopCompile(this.meta.projectId).catch(() => undefined)
    }
    if (this.localProcess && !this.localProcess.killed) {
      this.localProcess.kill('SIGTERM')
    }
  }

  // ---------- серверная компиляция ----------

  private async compileOnServer(): Promise<void> {
    const cfg = getConfig()
    this.output.appendLine('[compile] запрос компиляции на сервере…')
    const res = await this.client.compile(this.meta.projectId, {
      compiler: cfg.compiler,
      draft: cfg.draft,
      stopOnFirstError: cfg.stopOnFirstError,
      incrementalCompilesEnabled: true,
      editorId: this.editorId,
    })
    this.lastClsiServerId = res.clsiServerId
    this.lastBuildId =
      res.buildId || res.outputFiles?.find(f => f.build)?.build

    const outputFiles = res.outputFiles ?? []
    const pdf = outputFiles.find(f => f.path === 'output.pdf')
    const log = outputFiles.find(f => f.path === 'output.log')

    await fs.mkdir(this.state.outDir, { recursive: true })

    let logText = ''
    if (log) {
      try {
        const buf = await this.client.downloadOutputFile(
          log.url,
          res.clsiServerId
        )
        logText = buf.toString('utf8')
        await fs.writeFile(this.logPath, buf)
      } catch (err) {
        this.output.appendLine(`[compile] не удалось скачать лог: ${err}`)
      }
    }
    if (pdf) {
      const buf = await this.client.downloadOutputFile(
        pdf.url,
        res.clsiServerId
      )
      await fs.writeFile(this.pdfPath, buf)
    }

    const issueCount = logText
      ? issuesToDiagnostics(
          parseLatexLog(logText),
          this.state.rootDir,
          this.diagnostics
        )
      : 0

    if (res.status === 'success') {
      await this.preview.showFile(this.pdfPath, `PDF — ${this.meta.projectName}`)
      vscode.window.setStatusBarMessage(
        `$(check) LatexSpace: компиляция успешна${issueCount ? ` (${issueCount} замечаний в логе)` : ''}`,
        5000
      )
    } else {
      const actions = ['Открыть лог']
      if (pdf) actions.unshift('Показать PDF')
      const pick = await vscode.window.showErrorMessage(
        `LatexSpace: компиляция завершилась со статусом «${res.status}».`,
        ...actions
      )
      if (pick === 'Открыть лог') await this.showLog()
      if (pick === 'Показать PDF')
        await this.preview.showFile(this.pdfPath, `PDF — ${this.meta.projectName}`)
    }
  }

  // ---------- локальная компиляция ----------

  async findRootFile(): Promise<string | undefined> {
    const cfg = getConfig()
    if (cfg.rootFile) return cfg.rootFile
    if (this.meta.rootFile) return this.meta.rootFile
    // поиск \documentclass в .tex верхнего уровня (и на 1 уровень глубже)
    const candidates: string[] = []
    const scan = async (dir: string, prefix: string, depth: number) => {
      let entries
      try {
        entries = await fs.readdir(path.join(this.state.rootDir, dir), {
          withFileTypes: true,
        })
      } catch {
        return
      }
      for (const e of entries) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name
        if (e.isFile() && e.name.endsWith('.tex')) candidates.push(rel)
        else if (e.isDirectory() && depth > 0 && !e.name.startsWith('.'))
          await scan(path.join(dir, e.name), rel, depth - 1)
      }
    }
    await scan('', '', 1)
    const withClass: string[] = []
    for (const rel of candidates) {
      try {
        const head = (
          await fs.readFile(path.join(this.state.rootDir, rel))
        ).toString('utf8', 0, 4096)
        if (/^\s*\\documentclass/m.test(head)) withClass.push(rel)
      } catch {
        /* пропустить */
      }
    }
    withClass.sort((a, b) =>
      (a === 'main.tex' ? -1 : b === 'main.tex' ? 1 : a.localeCompare(b))
    )
    const found = withClass[0]
    if (found) {
      this.meta.rootFile = found
      await this.state.saveMeta(this.meta)
    }
    return found
  }

  private async compileLocally(): Promise<void> {
    const cfg = getConfig()
    const rootFile = await this.findRootFile()
    if (!rootFile) {
      void vscode.window.showErrorMessage(
        'LatexSpace: не найден главный .tex-файл (с \\documentclass). Укажите его в настройке latexspace.compile.rootFile.'
      )
      return
    }
    await fs.mkdir(this.state.outDir, { recursive: true })
    const engineFlag =
      cfg.compiler === 'xelatex'
        ? '-pdfxe'
        : cfg.compiler === 'lualatex'
          ? '-pdflua'
          : '-pdf'
    const args = [
      engineFlag,
      '-interaction=nonstopmode',
      '-file-line-error',
      '-synctex=1',
      `-outdir=${this.state.outDir}`,
      ...cfg.localArgs,
      rootFile,
    ]
    this.output.appendLine(
      `[compile] локально: ${cfg.localCommand} ${args.join(' ')}`
    )
    this.output.show(true)

    const exitCode: number = await new Promise<number>((resolve, reject) => {
      let spawned = false
      const child = spawn(cfg.localCommand, args, {
        cwd: this.state.rootDir,
        env: process.env,
      })
      this.localProcess = child
      child.stdout.on('data', d => this.output.append(d.toString()))
      child.stderr.on('data', d => this.output.append(d.toString()))
      child.on('spawn', () => {
        spawned = true
      })
      child.on('error', err => {
        if (!spawned) {
          reject(
            new Error(
              `Не удалось запустить «${cfg.localCommand}». Установлен ли TeX Live/latexmk? (${err.message})`
            )
          )
        }
      })
      child.on('close', code => resolve(code ?? 1))
    }).finally(() => {
      this.localProcess = undefined
    })

    this.lastLocalRoot = rootFile
    const base = path.basename(rootFile, '.tex')
    // некоторые движки/пакеты пишут артефакты в cwd, игнорируя -outdir —
    // убираем их из корня проекта в каталог сборки
    await this.sweepRootArtifacts(base)
    const producedPdf = path.join(this.state.outDir, `${base}.pdf`)
    const producedLog = path.join(this.state.outDir, `${base}.log`)

    let logText = ''
    try {
      logText = (await fs.readFile(producedLog)).toString('utf8')
      await fs.copyFile(producedLog, this.logPath)
    } catch {
      /* лога может не быть */
    }
    const issueCount = logText
      ? issuesToDiagnostics(
          parseLatexLog(logText),
          this.state.rootDir,
          this.diagnostics
        )
      : 0

    let hasPdf = false
    try {
      await fs.copyFile(producedPdf, this.pdfPath)
      hasPdf = true
    } catch {
      /* pdf не создан */
    }

    if (hasPdf) {
      await this.preview.showFile(this.pdfPath, `PDF — ${this.meta.projectName}`)
    }
    if (exitCode === 0) {
      vscode.window.setStatusBarMessage(
        `$(check) LatexSpace: локальная компиляция успешна${issueCount ? ` (${issueCount} замечаний)` : ''}`,
        5000
      )
    } else {
      const pick = await vscode.window.showErrorMessage(
        `LatexSpace: локальная компиляция завершилась с ошибкой (код ${exitCode}).`,
        'Открыть лог'
      )
      if (pick === 'Открыть лог') await this.showLog()
    }
  }

  private async sweepRootArtifacts(jobname: string): Promise<void> {
    const names = [
      ...ARTIFACT_EXTS.map(ext => `${jobname}.${ext}`),
      'texput.log',
    ]
    for (const name of names) {
      const src = path.join(this.state.rootDir, name)
      try {
        await fs.access(src)
        await fs.rename(src, path.join(this.state.outDir, name))
        this.output.appendLine(`[compile] артефакт перенесён из корня: ${name}`)
      } catch {
        /* файла нет — норма */
      }
    }
  }

  async showLog(): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(this.logPath)
      )
      await vscode.window.showTextDocument(doc, { preview: true })
    } catch {
      this.output.show(true)
    }
  }
}
