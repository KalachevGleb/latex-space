import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'

/**
 * Восстановленные после перезагрузки окна PDF-вкладки бесполезны
 * (расширение о них не знает) — закрываем их прямо в момент
 * восстановления. Регистрируется один раз в activate().
 */
export function registerPdfPanelSerializer(): vscode.Disposable {
  return vscode.window.registerWebviewPanelSerializer('latexspacePdf', {
    deserializeWebviewPanel: async panel => {
      panel.dispose()
    },
  })
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
    // метка времени — чтобы webview не взял закэшированную версию
    this.post({ type: 'load', url: `${uri.toString()}?ts=${Date.now()}` })
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

  private async ensurePanel(title: string): Promise<vscode.WebviewPanel> {
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Beside, true)
      return this.panel
    }
    const mediaRoot = vscode.Uri.file(
      path.join(this.context.extensionPath, 'media')
    )
    // создаём активной, чтобы закрепить вкладку, затем возвращаем фокус
    const panel = vscode.window.createWebviewPanel(
      'latexspacePdf',
      title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [mediaRoot, vscode.Uri.file(this.rootDir)],
      }
    )
    panel.onDidDispose(() => {
      this.panel = undefined
      this.ready = false
      this.queue = []
    })
    panel.webview.onDidReceiveMessage(msg => {
      if (msg?.type === 'ready') {
        this.ready = true
        const pending = this.queue
        this.queue = []
        for (const m of pending) void panel.webview.postMessage(m)
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
    })
    const webview = panel.webview
    const uri = (...parts: string[]) =>
      webview.asWebviewUri(
        vscode.Uri.file(
          path.join(this.context.extensionPath, 'media', ...parts)
        )
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
    webview.html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${uri('viewer.css')}">
<title>PDF</title>
</head>
<body data-worker-src="${uri('pdfjs', 'pdf.worker.min.js')}">
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
<script src="${uri('pdfjs', 'pdf.min.js')}"></script>
<script src="${uri('viewer.js')}"></script>
</body>
</html>`
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
