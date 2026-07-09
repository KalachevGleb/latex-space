import * as path from 'path'
import * as vscode from 'vscode'
import { revealDocumentSmart } from '../util/editors'
import { CommentsService, locateQuote } from './commentsService'

/**
 * Подсветка закомментированных фрагментов в редакторе
 * (аналог жёлтой подсветки в review panel LatexSpace).
 */
export class CommentDecorations implements vscode.Disposable {
  private decoration: vscode.TextEditorDecorationType
  private subs: vscode.Disposable[] = []
  private redrawTimer?: NodeJS.Timeout

  constructor(
    private service: CommentsService,
    private rootDir: string
  ) {
    this.decoration = vscode.window.createTextEditorDecorationType({
      light: { backgroundColor: 'rgba(243, 177, 17, 0.28)' },
      dark: { backgroundColor: 'rgba(243, 177, 17, 0.16)' },
      overviewRulerColor: 'rgba(243, 177, 17, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      borderRadius: '2px',
    })
    this.subs.push(
      service.onDidUpdate(() => this.redrawAll()),
      vscode.window.onDidChangeActiveTextEditor(() => this.redrawAll()),
      vscode.workspace.onDidChangeTextDocument(e => {
        const active = vscode.window.activeTextEditor
        if (active && e.document === active.document) {
          this.scheduleRedraw()
        }
      })
    )
    this.redrawAll()
  }

  dispose(): void {
    this.decoration.dispose()
    for (const s of this.subs) s.dispose()
    if (this.redrawTimer) clearTimeout(this.redrawTimer)
  }

  private scheduleRedraw(): void {
    if (this.redrawTimer) clearTimeout(this.redrawTimer)
    this.redrawTimer = setTimeout(() => this.redrawAll(), 500)
  }

  private relOf(uri: vscode.Uri): string | null {
    if (uri.scheme !== 'file') return null
    const rel = path
      .relative(this.rootDir, uri.fsPath)
      .split(path.sep)
      .join('/')
    if (!rel || rel.startsWith('..')) return null
    return rel
  }

  redrawAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.redraw(editor)
    }
  }

  private redraw(editor: vscode.TextEditor): void {
    const rel = this.relOf(editor.document.uri)
    if (!rel) {
      editor.setDecorations(this.decoration, [])
      return
    }
    const threads = this.service
      .getThreads()
      .filter(t => t.filePath === rel && !t.resolved)
    if (threads.length === 0) {
      editor.setDecorations(this.decoration, [])
      return
    }
    const text = editor.document.getText()
    const options: vscode.DecorationOptions[] = []
    for (const t of threads) {
      const loc = locateQuote(text, t.quoted, t.start)
      if (!loc) continue
      const range = new vscode.Range(
        editor.document.positionAt(loc.start),
        editor.document.positionAt(loc.end)
      )
      const first = t.messages[0]
      const hover = new vscode.MarkdownString()
      hover.appendMarkdown(`**Комментарий LatexSpace**\n\n`)
      if (first) hover.appendText(first.text)
      if (t.messages.length > 1)
        hover.appendMarkdown(`\n\n_и ещё ${t.messages.length - 1}…_`)
      options.push({ range, hoverMessage: hover })
    }
    editor.setDecorations(this.decoration, options)
  }

  /** Перейти к комментарию в редакторе. */
  async revealThread(threadId: string): Promise<void> {
    const t = this.service.threadById(threadId)
    if (!t) return
    const abs = path.join(this.rootDir, t.filePath)
    let doc: vscode.TextDocument
    try {
      doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs))
    } catch {
      void vscode.window.showWarningMessage(
        `Файл «${t.filePath}» не найден локально. Выполните синхронизацию.`
      )
      return
    }
    const text = doc.getText()
    const loc = locateQuote(text, t.quoted, t.start) ?? {
      start: Math.min(t.start, text.length),
      end: Math.min(t.start, text.length),
    }
    const range = new vscode.Range(
      doc.positionAt(loc.start),
      doc.positionAt(loc.end)
    )
    await revealDocumentSmart(vscode.Uri.file(abs), range)
  }
}
