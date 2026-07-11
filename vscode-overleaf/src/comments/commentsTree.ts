import * as vscode from 'vscode'
import { CommentMessage } from '../api/types'
import { authorName, CommentsService, ThreadModel } from './commentsService'

export type CommentsNode = FileNode | ThreadNode | MessageNode

export class FileNode {
  constructor(
    readonly filePath: string,
    readonly threads: ThreadModel[]
  ) {}
}

export class ThreadNode {
  constructor(readonly thread: ThreadModel) {}
}

export class MessageNode {
  constructor(
    readonly thread: ThreadModel,
    readonly message: CommentMessage
  ) {}
}

function trimText(s: string, n = 60): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

export class CommentsTreeProvider
  implements vscode.TreeDataProvider<CommentsNode>, vscode.Disposable
{
  private changeEmitter = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changeEmitter.event
  showResolved = false
  private sub: vscode.Disposable

  constructor(
    private service: CommentsService,
    private rootDir: string
  ) {
    this.sub = service.onDidUpdate(() => this.changeEmitter.fire())
  }

  dispose(): void {
    this.sub.dispose()
    this.changeEmitter.dispose()
  }

  toggleResolved(): void {
    this.showResolved = !this.showResolved
    this.changeEmitter.fire()
  }

  refresh(): void {
    this.changeEmitter.fire()
  }

  getChildren(element?: CommentsNode): CommentsNode[] {
    if (!element) {
      const byFile = new Map<string, ThreadModel[]>()
      for (const t of this.service.getThreads()) {
        if (!this.showResolved && t.resolved) continue
        if (!byFile.has(t.filePath)) byFile.set(t.filePath, [])
        byFile.get(t.filePath)!.push(t)
      }
      return [...byFile.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(
          ([file, threads]) =>
            new FileNode(
              file,
              threads.sort((a, b) => a.start - b.start)
            )
        )
    }
    if (element instanceof FileNode) {
      return element.threads.map(t => new ThreadNode(t))
    }
    if (element instanceof ThreadNode) {
      // первый текст показан в заголовке треда — раскрываются ответы
      return element.thread.messages
        .slice(1)
        .map(m => new MessageNode(element.thread, m))
    }
    return []
  }

  getTreeItem(element: CommentsNode): vscode.TreeItem {
    if (element instanceof FileNode) {
      const item = new vscode.TreeItem(
        element.filePath || '(без привязки к тексту)',
        vscode.TreeItemCollapsibleState.Expanded
      )
      if (element.filePath) {
        item.iconPath = vscode.ThemeIcon.File
        item.resourceUri = vscode.Uri.joinPath(
          vscode.Uri.file(this.rootDir),
          element.filePath
        )
      } else {
        item.iconPath = new vscode.ThemeIcon('comment-unresolved')
      }
      item.description = String(element.threads.length)
      item.contextValue = 'lsFile'
      return item
    }
    if (element instanceof ThreadNode) {
      const t = element.thread
      // главное — текст комментария; цитата — коротко, второстепенно
      const first = t.messages[0]
      const label = trimText(first?.text ?? '(без текста)', 60)
      const item = new vscode.TreeItem(
        label,
        t.messages.length > 1
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None
      )
      // цитируемый фрагмент не показываем — он и так виден в редакторе
      const parts: string[] = []
      if (first) parts.push(authorName(first))
      if (t.messages.length > 1) parts.push(`+${t.messages.length - 1}`)
      item.description = parts.join(' · ') || undefined
      item.iconPath = new vscode.ThemeIcon(
        t.resolved ? 'pass' : 'comment-discussion',
        t.resolved ? new vscode.ThemeColor('charts.green') : undefined
      )
      item.contextValue = t.resolved
        ? 'lsThread-resolved'
        : 'lsThread-open'
      item.id = t.threadId
      item.tooltip = this.threadTooltip(t)
      item.command = {
        command: 'latexspace.comments.open',
        title: 'Перейти к комментарию',
        arguments: [t.threadId],
      }
      return item
    }
    const m = element.message
    const item = new vscode.TreeItem(
      `${authorName(m)}: ${trimText(m.text, 80)}`,
      vscode.TreeItemCollapsibleState.None
    )
    item.iconPath = new vscode.ThemeIcon('account')
    item.contextValue = 'lsMessage'
    const when = m.timestamp ? new Date(m.timestamp).toLocaleString() : ''
    item.tooltip = new vscode.MarkdownString(
      `**${authorName(m)}** ${when}\n\n${m.text}`
    )
    return item
  }

  private threadTooltip(t: ThreadModel): vscode.MarkdownString {
    const md = new vscode.MarkdownString(undefined, true)
    md.isTrusted = false
    for (const m of t.messages) {
      const when = m.timestamp
        ? ` — ${new Date(m.timestamp).toLocaleString()}`
        : ''
      md.appendMarkdown(`**${authorName(m)}**${when}\n\n`)
      md.appendText(m.text)
      md.appendMarkdown('\n\n')
    }
    if (t.resolved) md.appendMarkdown('_Решён_')
    return md
  }
}
