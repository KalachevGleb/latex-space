import * as vscode from 'vscode'
import type { LiveRanges } from '../realtime/realtimeManager'
import type { TrackedChange } from '../vendor/rangesTracker'

export type ChangesNode = ChangeFileNode | ChangeNode

export class ChangeFileNode {
  constructor(
    readonly rel: string,
    readonly docId: string,
    readonly changes: TrackedChange[]
  ) {}
}

export class ChangeNode {
  constructor(
    readonly rel: string,
    readonly docId: string,
    readonly change: TrackedChange
  ) {}
}

function trimText(s: string, n = 50): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

/**
 * Панель «Правки» (track changes): вставки/удаления из live-модели
 * (той же RangesTracker, что на сервере), с принятием по кнопке.
 */
export class ChangesTreeProvider
  implements vscode.TreeDataProvider<ChangesNode>, vscode.Disposable
{
  private changeEmitter = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changeEmitter.event

  /** поставщик live-диапазонов */
  liveProvider?: () => LiveRanges[]

  dispose(): void {
    this.changeEmitter.dispose()
  }

  refresh(): void {
    this.changeEmitter.fire()
  }

  getChildren(element?: ChangesNode): ChangesNode[] {
    if (element instanceof ChangeFileNode) {
      return element.changes
        .slice()
        .sort((a, b) => a.op.p - b.op.p)
        .map(c => new ChangeNode(element.rel, element.docId, c))
    }
    if (element) return []
    const live = this.liveProvider?.() ?? []
    return live
      .filter(l => l.changes.length > 0)
      .sort((a, b) => a.rel.localeCompare(b.rel))
      .map(l => new ChangeFileNode(l.rel, l.docId, l.changes))
  }

  getTreeItem(element: ChangesNode): vscode.TreeItem {
    if (element instanceof ChangeFileNode) {
      const item = new vscode.TreeItem(
        element.rel,
        vscode.TreeItemCollapsibleState.Expanded
      )
      item.iconPath = vscode.ThemeIcon.File
      item.description = String(element.changes.length)
      item.contextValue = 'lsChangeFile'
      return item
    }
    const c = element.change
    const isInsert = c.op.i !== undefined
    const text = isInsert ? c.op.i! : (c.op.d ?? '')
    const item = new vscode.TreeItem(
      `${isInsert ? 'Вставка' : 'Удаление'}: «${trimText(text)}»`,
      vscode.TreeItemCollapsibleState.None
    )
    item.iconPath = new vscode.ThemeIcon(
      isInsert ? 'diff-added' : 'diff-removed',
      new vscode.ThemeColor(isInsert ? 'charts.green' : 'charts.red')
    )
    const ts = c.metadata?.ts ? new Date(c.metadata.ts as string) : undefined
    item.description = ts ? ts.toLocaleString() : undefined
    item.tooltip = new vscode.MarkdownString(
      `**${isInsert ? 'Вставка' : 'Удаление'}**\n\n`
    )
    ;(item.tooltip as vscode.MarkdownString).appendCodeblock(
      text.slice(0, 500),
      'latex'
    )
    item.contextValue = 'lsChange'
    item.id = `${element.docId}:${c.id}`
    item.command = {
      command: 'latexspace.changes.open',
      title: 'Перейти к правке',
      arguments: [element],
    }
    return item
  }
}
