import * as path from 'path'
import * as vscode from 'vscode'
import type { LiveRanges } from '../realtime/realtimeManager'

function trimText(s: string, n = 30): string {
  const one = s.replace(/\s+/g, ' ')
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

/**
 * Подсветка tracked changes в редакторе:
 * вставки — зелёная подложка + подчёркивание, удаления — красный маркер
 * с зачёркнутым удалённым текстом (как в review panel веба).
 */
export class ChangesDecorations implements vscode.Disposable {
  private insertDecoration: vscode.TextEditorDecorationType
  private deleteDecoration: vscode.TextEditorDecorationType
  private subs: vscode.Disposable[] = []

  liveProvider?: () => LiveRanges[]

  constructor(private rootDir: string) {
    this.insertDecoration = vscode.window.createTextEditorDecorationType({
      light: { backgroundColor: 'rgba(46, 160, 67, 0.18)' },
      dark: { backgroundColor: 'rgba(46, 160, 67, 0.14)' },
      textDecoration: 'underline solid rgba(46,160,67,0.8) 1px',
      overviewRulerColor: 'rgba(46, 160, 67, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    })
    this.deleteDecoration = vscode.window.createTextEditorDecorationType({
      before: {
        color: 'rgba(248, 81, 73, 0.9)',
        textDecoration: 'line-through',
        margin: '0 2px 0 2px',
      },
      overviewRulerColor: 'rgba(248, 81, 73, 0.8)',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    })
    this.subs.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.redrawAll())
    )
  }

  dispose(): void {
    this.insertDecoration.dispose()
    this.deleteDecoration.dispose()
    for (const s of this.subs) s.dispose()
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
    const live = this.liveProvider?.() ?? []
    for (const editor of vscode.window.visibleTextEditors) {
      const rel = this.relOf(editor.document.uri)
      const doc = live.find(l => l.rel === rel)
      if (!doc || doc.changes.length === 0) {
        editor.setDecorations(this.insertDecoration, [])
        editor.setDecorations(this.deleteDecoration, [])
        continue
      }
      const inserts: vscode.DecorationOptions[] = []
      const deletes: vscode.DecorationOptions[] = []
      const maxOffset = editor.document.getText().length
      for (const c of doc.changes) {
        const p = Math.min(c.op.p, maxOffset)
        if (c.op.i !== undefined) {
          const end = Math.min(p + c.op.i.length, maxOffset)
          inserts.push({
            range: new vscode.Range(
              editor.document.positionAt(p),
              editor.document.positionAt(end)
            ),
            hoverMessage: new vscode.MarkdownString('Tracked: вставка'),
          })
        } else if (c.op.d !== undefined) {
          const pos = editor.document.positionAt(p)
          deletes.push({
            range: new vscode.Range(pos, pos),
            renderOptions: {
              before: { contentText: trimText(c.op.d) },
            },
            hoverMessage: new vscode.MarkdownString(
              `Tracked: удалено\n\n\`\`\`\n${c.op.d.slice(0, 300)}\n\`\`\``
            ),
          })
        }
      }
      editor.setDecorations(this.insertDecoration, inserts)
      editor.setDecorations(this.deleteDecoration, deletes)
    }
  }
}
