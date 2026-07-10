import * as path from 'path'
import * as vscode from 'vscode'
import type { LiveRanges } from '../realtime/realtimeManager'
import { aggregateChanges } from './aggregate'

/**
 * Подсветка tracked changes в редакторе:
 * вставки — зелёная подложка + подчёркивание; удаления — узкий красный
 * маркер на месте удаления (как в веб-редакторе), сам удалённый текст —
 * в hover и в панели «Правки».
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
        contentText: '▎',
        color: 'rgba(248, 81, 73, 0.95)',
        fontWeight: 'bold',
        margin: '0 -2px 0 -2px',
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
      for (const dc of aggregateChanges(doc.changes)) {
        const replaceHover =
          dc.kind === 'replace'
            ? new vscode.MarkdownString(
                `Tracked: замена\n\nБыло:\n\`\`\`\n${(dc.del!.op.d ?? '').slice(0, 300)}\n\`\`\`\nСтало:\n\`\`\`\n${(dc.ins!.op.i ?? '').slice(0, 300)}\n\`\`\``
              )
            : undefined
        if (dc.ins?.op.i !== undefined) {
          const p = Math.min(dc.ins.op.p, maxOffset)
          const end = Math.min(p + dc.ins.op.i.length, maxOffset)
          inserts.push({
            range: new vscode.Range(
              editor.document.positionAt(p),
              editor.document.positionAt(end)
            ),
            hoverMessage:
              replaceHover ?? new vscode.MarkdownString('Tracked: вставка'),
          })
        }
        if (dc.del?.op.d !== undefined) {
          const p = Math.min(dc.del.op.p, maxOffset)
          const pos = editor.document.positionAt(p)
          deletes.push({
            range: new vscode.Range(pos, pos),
            hoverMessage:
              replaceHover ??
              new vscode.MarkdownString(
                `Tracked: удалено\n\n\`\`\`\n${dc.del.op.d.slice(0, 300)}\n\`\`\``
              ),
          })
        }
      }
      editor.setDecorations(this.insertDecoration, inserts)
      editor.setDecorations(this.deleteDecoration, deletes)
    }
  }
}
