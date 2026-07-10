import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'

/** Состояние, которое viewer.js сохраняет через vscode.setState. */
interface PersistedPdfState {
  pdfPath: string
  rootDir: string
  title?: string
}

interface RestoredPanel {
  panel: vscode.WebviewPanel
  state: PersistedPdfState
  ready: boolean
  adopted: boolean
}

/** Вкладка, восстановленная VSCode после перезагрузки окна. */
let restored: RestoredPanel | undefined

/**
 * Восстановленная после перезагрузки окна PDF-вкладка сразу снова
 * показывает последний PDF (он лежит на диске), а когда открывается
 * проект — PdfPreview усыновляет её через takeRestoredPanel() и дальше
 * работает с ней как со своей. Без состояния или без PDF на диске
 * вкладка закрывается. Регистрируется один раз в activate().
 */
export function registerPdfPanelSerializer(
  context: vscode.ExtensionContext
): vscode.Disposable {
  return vscode.window.registerWebviewPanelSerializer('latexspacePdf', {
    deserializeWebviewPanel: async (panel, state: unknown) => {
      const s = state as PersistedPdfState | undefined
      let exists = false
      if (s?.pdfPath && s?.rootDir) {
        try {
          await fs.access(s.pdfPath)
          exists = true
        } catch {
          /* PDF уже удалён */
        }
      }
      if (!exists) {
        panel.dispose()
        return
      }
      const rec: RestoredPanel = { panel, state: s!, ready: false, adopted: false }
      restored = rec
      panel.onDidDispose(() => {
        if (restored === rec) restored = undefined
      })
      panel.webview.onDidReceiveMessage(msg => {
        if (rec.adopted) return // дальше сообщениями занимается PdfPreview
        if (msg?.type === 'ready') {
          rec.ready = true
          const uri = panel.webview.asWebviewUri(vscode.Uri.file(rec.state.pdfPath))
          void panel.webview.postMessage({
            type: 'load',
            url: `${uri.toString()}?ts=${Date.now()}`,
            state: rec.state,
          })
        } else if (msg?.type === 'compile') {
          void vscode.commands.executeCommand('latexspace.compile')
        }
      })
      initViewerWebview(panel.webview, context, rec.state.rootDir)
      if (rec.state.title) panel.title = rec.state.title
    },
  })
}

/**
 * Забрать восстановленную вкладку для переиспользования. Вкладка от
 * другого проекта (другой rootDir — другие права на ресурсы) закрывается.
 */
function takeRestoredPanel(rootDir: string): RestoredPanel | undefined {
  const rec = restored
  if (!rec) return undefined
  restored = undefined
  if (rec.state.rootDir !== rootDir) {
    rec.panel.dispose()
    return undefined
  }
  rec.adopted = true
  return rec
}

/** Настроить webview панели: права на ресурсы и HTML со скриптами. */
function initViewerWebview(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  rootDir: string
): void {
  const mediaRoot = vscode.Uri.file(path.join(context.extensionPath, 'media'))
  webview.options = {
    enableScripts: true,
    localResourceRoots: [mediaRoot, vscode.Uri.file(rootDir)],
  }
  const uri = (...parts: string[]) =>
    webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, 'media', ...parts))
    )
  const csp = [
    `default-src 'none'`,
    `script-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `img-src ${webview.cspSource} blob: data:`,
    `font-src ${webview.cspSource}`,
    `worker-src ${webview.cspSource} blob:`,
    `connect-src ${webview.cspSource} blob: data:`,
  ].join('; ')
  // pdf.worker.min.js подключается обычным <script> и работает на главном
  // потоке: реальный Worker в webview делает запросы мимо service
  // worker'а VSCode и зависает до сетевого таймаута (~30 секунд)
  webview.html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${uri('viewer.css')}">
<title>PDF</title>
</head>
<body>
<div id="toolbar">
  <button id="zoom-out" title="Уменьшить">−</button>
  <span id="zoom-label">100%</span>
  <button id="zoom-in" title="Увеличить">+</button>
  <button id="fit-width" title="По ширине">⇔</button>
  <span id="page-info"></span>
  <span id="hint">Ctrl/Cmd+Click — перейти к исходнику</span>
  <span id="status"></span>
</div>
<div id="pages"></div>
<script src="${uri('pdfjs', 'pdf.worker.min.js')}"></script>
<script src="${uri('pdfjs', 'pdf.min.js')}"></script>
<script src="${uri('viewer.js')}"></script>
</body>
</html>`
}

export interface PdfSyncClick {
  page: number
  h: number
  v: number
  /** слово под курсором мыши (из текстового слоя PDF) — для доводки */
  word?: string
}

export interface PdfHighlight {
  page: number
  h: number
  v: number
  width: number
  height: number
}

/**
 * Панель предпросмотра PDF на pdf.js (webview).
 * Открывается закреплённой вкладкой во второй колонке. Содержимое
 * загружается самим webview по URI (никаких мегабайт через postMessage) —
 * сообщение несёт только адрес файла.
 * Ctrl/Cmd+Click по странице шлёт координаты для обратного SyncTeX.
 *
 * Восстановленные после перезагрузки окна вкладки закрывает сериализатор
 * (registerPdfPanelSerializer в activate) — контроль в момент
 * восстановления, без сканов и гонок.
 */
export class PdfPreview implements vscode.Disposable {
  private panel?: vscode.WebviewPanel
  private lastPdfPath?: string
  /**
   * Webview готов принимать сообщения (получен 'ready' от viewer.js).
   * postMessage сразу после создания панели теряется — скрипт ещё не
   * повесил слушатель, — поэтому до готовности сообщения копятся в очереди.
   */
  private ready = false
  private queue: unknown[] = []
  /** обработчик Ctrl/Cmd+Click по PDF (обратный SyncTeX) */
  onSyncToCode?: (click: PdfSyncClick) => void

  constructor(
    private context: vscode.ExtensionContext,
    private rootDir: string
  ) {}

  dispose(): void {
    this.panel?.dispose()
    this.panel = undefined
  }

  get isOpen(): boolean {
    return !!this.panel
  }

  private post(msg: unknown): void {
    if (this.panel && this.ready) {
      void this.panel.webview.postMessage(msg)
    } else {
      this.queue.push(msg)
    }
  }

  async showFile(pdfPath: string, title = 'PDF'): Promise<void> {
    this.lastPdfPath = pdfPath
    const panel = await this.ensurePanel(title)
    try {
      await fs.access(pdfPath)
    } catch {
      // PDF ещё не собран — пустое состояние с кнопкой прямо в панели
      this.post({ type: 'empty' })
      return
    }
    panel.title = title
    const uri = panel.webview.asWebviewUri(vscode.Uri.file(pdfPath))
    // метка времени — чтобы webview не взял закэшированную версию;
    // state сохраняется webview'ом для восстановления вкладки после
    // перезагрузки окна
    this.post({
      type: 'load',
      url: `${uri.toString()}?ts=${Date.now()}`,
      state: { pdfPath, rootDir: this.rootDir, title } as PersistedPdfState,
    })
  }

  async refresh(): Promise<void> {
    if (this.panel && this.lastPdfPath) {
      await this.showFile(this.lastPdfPath, this.panel.title)
    }
  }

  /** Подсветить позицию (forward SyncTeX) — панель должна быть открыта. */
  async highlight(pos: PdfHighlight): Promise<void> {
    if (!this.panel) {
      if (!this.lastPdfPath) return
      await this.showFile(this.lastPdfPath)
    }
    this.panel?.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Beside, true)
    this.post({ type: 'highlight', ...pos })
  }

  private handleMessage(msg: {
    type?: string
    page?: unknown
    h?: unknown
    v?: unknown
    word?: unknown
  }): void {
    if (msg?.type === 'ready') {
      this.ready = true
      const pending = this.queue
      this.queue = []
      for (const m of pending) void this.panel?.webview.postMessage(m)
    } else if (msg?.type === 'compile') {
      void vscode.commands.executeCommand('latexspace.compile')
    } else if (msg?.type === 'syncToCode' && this.onSyncToCode) {
      this.onSyncToCode({
        page: Number(msg.page),
        h: Number(msg.h),
        v: Number(msg.v),
        word: typeof msg.word === 'string' ? msg.word : undefined,
      })
    }
  }

  private async ensurePanel(title: string): Promise<vscode.WebviewPanel> {
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Beside, true)
      return this.panel
    }
    // после перезагрузки окна переиспользуем восстановленную вкладку
    const adopted = takeRestoredPanel(this.rootDir)
    if (adopted) {
      const panel = adopted.panel
      this.panel = panel
      this.ready = adopted.ready
      panel.title = title
      panel.onDidDispose(() => {
        this.panel = undefined
        this.ready = false
        this.queue = []
      })
      panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg))
      panel.reveal(panel.viewColumn ?? vscode.ViewColumn.Beside, true)
      return panel
    }
    // создаём активной, чтобы закрепить вкладку, затем возвращаем фокус
    const panel = vscode.window.createWebviewPanel(
      'latexspacePdf',
      title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true }
    )
    panel.onDidDispose(() => {
      this.panel = undefined
      this.ready = false
      this.queue = []
    })
    panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg))
    initViewerWebview(panel.webview, this.context, this.rootDir)
    this.panel = panel
    // закрепить вкладку, заблокировать группу (чтобы в неё не открывались
    // другие файлы) и вернуть фокус в редактор
    try {
      await vscode.commands.executeCommand('workbench.action.pinEditor')
      await vscode.commands.executeCommand('workbench.action.lockEditorGroup')
      await vscode.commands.executeCommand(
        'workbench.action.focusPreviousGroup'
      )
    } catch {
      /* не критично */
    }
    return panel
  }
}
