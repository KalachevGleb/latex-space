import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'

export interface PdfSyncClick {
  page: number
  h: number
  v: number
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
 * Открывается закреплённой вкладкой во второй колонке; содержимое передаётся
 * сообщением (base64), поэтому обновляется после каждой перекомпиляции.
 * Ctrl/Cmd+Click по странице шлёт координаты для обратного SyncTeX.
 */
export class PdfPreview {
  private panel?: vscode.WebviewPanel
  private lastPdfPath?: string
  /** обработчик Ctrl/Cmd+Click по PDF (обратный SyncTeX) */
  onSyncToCode?: (click: PdfSyncClick) => void

  constructor(private context: vscode.ExtensionContext) {}

  get isOpen(): boolean {
    return !!this.panel
  }

  async showFile(pdfPath: string, title = 'PDF'): Promise<void> {
    this.lastPdfPath = pdfPath
    const panel = await this.ensurePanel(title)
    let data: Buffer
    try {
      data = await fs.readFile(pdfPath)
    } catch {
      void vscode.window.showWarningMessage(
        'PDF ещё не создан — скомпилируйте проект.'
      )
      return
    }
    panel.title = title
    void panel.webview.postMessage({
      type: 'load',
      data: data.toString('base64'),
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
    void this.panel?.webview.postMessage({ type: 'highlight', ...pos })
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
        localResourceRoots: [mediaRoot],
      }
    )
    panel.onDidDispose(() => {
      this.panel = undefined
    })
    panel.webview.onDidReceiveMessage(msg => {
      if (msg?.type === 'syncToCode' && this.onSyncToCode) {
        this.onSyncToCode({
          page: Number(msg.page),
          h: Number(msg.h),
          v: Number(msg.v),
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
