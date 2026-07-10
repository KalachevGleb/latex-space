import * as vscode from 'vscode'
import type { LiveRanges } from '../realtime/realtimeManager'
import { aggregateChanges, DisplayChange } from './aggregate'

export type ChangesNode = ChangeFileNode | ChangeNode

export class ChangeFileNode {
  constructor(
    readonly rel: string,
    readonly docId: string,
    readonly displays: DisplayChange[]
  ) {}
}

export class ChangeNode {
  constructor(
    readonly rel: string,
    readonly docId: string,
    readonly display: DisplayChange
  ) {}
}

function trimText(s: string, n = 50): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

/**
 * Панель «Правки» (track changes): вставки/удаления из live-модели
 * (той же RangesTracker, что на сервере). Пара «вставка + удаление за ней»
 * показывается одной правкой-«заменой», как в вебе.
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
      return element.displays.map(
        d => new ChangeNode(element.rel, element.docId, d)
      )
    }
    if (element) return []
    const live = this.liveProvider?.() ?? []
    return live
      .filter(l => l.changes.length > 0)
      .sort((a, b) => a.rel.localeCompare(b.rel))
      .map(
        l => new ChangeFileNode(l.rel, l.docId, aggregateChanges(l.changes))
      )
  }

  getTreeItem(element: ChangesNode): vscode.TreeItem {
    if (element instanceof ChangeFileNode) {
      const item = new vscode.TreeItem(
        element.rel,
        vscode.TreeItemCollapsibleState.Expanded
      )
      item.iconPath = vscode.ThemeIcon.File
      item.description = String(element.displays.length)
      item.contextValue = 'lsChangeFile'
      return item
    }
    const d = element.display
    // тип правки ясен по значку — слова в подписи лишние
    let label: string
    let icon: vscode.ThemeIcon
    if (d.kind === 'replace') {
      label = `«${trimText(d.del!.op.d ?? '', 25)}» → «${trimText(d.ins!.op.i ?? '', 25)}»`
      icon = new vscode.ThemeIcon(
        'replace',
        new vscode.ThemeColor('charts.yellow')
      )
    } else if (d.kind === 'insert') {
      label = `«${trimText(d.ins!.op.i ?? '')}»`
      icon = new vscode.ThemeIcon(
        'diff-added',
        new vscode.ThemeColor('charts.green')
      )
    } else {
      label = `«${trimText(d.del!.op.d ?? '')}»`
      icon = new vscode.ThemeIcon(
        'diff-removed',
        new vscode.ThemeColor('charts.red')
      )
    }
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)
    item.iconPath = icon
    const meta = d.ins?.metadata ?? d.del?.metadata
    const ts = meta?.ts ? new Date(meta.ts as string) : undefined
    item.description = ts ? ts.toLocaleString() : undefined
    const tooltip = new vscode.MarkdownString(
      d.kind === 'replace'
        ? '**Замена**\n\nБыло:'
        : `**${d.kind === 'insert' ? 'Вставка' : 'Удаление'}**\n\n`
    )
    if (d.kind === 'replace') {
      tooltip.appendCodeblock((d.del!.op.d ?? '').slice(0, 500), 'latex')
      tooltip.appendMarkdown('Стало:')
      tooltip.appendCodeblock((d.ins!.op.i ?? '').slice(0, 500), 'latex')
    } else {
      tooltip.appendCodeblock(
        (d.ins?.op.i ?? d.del?.op.d ?? '').slice(0, 500),
        'latex'
      )
    }
    item.tooltip = tooltip
    item.contextValue = 'lsChange'
    item.id = `${element.docId}:${d.ids.join('+')}`
    item.command = {
      command: 'latexspace.changes.open',
      title: 'Перейти к правке',
      arguments: [element],
    }
    return item
  }
}
