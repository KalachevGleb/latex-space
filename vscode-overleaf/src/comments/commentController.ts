import * as path from 'path'
import * as vscode from 'vscode'
import { authorName, CommentsService, ThreadModel } from './commentsService'

/** Тред VSCode с привязкой к нашему threadId. */
type LsThread = vscode.CommentThread & { lsThreadId?: string }

/**
 * Комментарии через нативный Comments API VSCode: значок «+» у строки
 * (при наведении на gutter), ввод текста прямо в редакторе (Esc — отмена),
 * ответы и «решено» — в том же инлайн-виджете. Треды строятся из той же
 * модели, что и панель комментариев.
 */
export class LiveCommentController implements vscode.Disposable {
  private controller: vscode.CommentController
  private byThreadId = new Map<string, LsThread>()
  private subs: vscode.Disposable[] = []
  private refreshing = false
  private refreshQueued = false

  /** какие файлы доступны для комментирования (live-документы) */
  managesRel?: (rel: string) => boolean

  constructor(
    private comments: CommentsService,
    private rootDir: string
  ) {
    this.controller = vscode.comments.createCommentController(
      'latexspace',
      'Комментарии LatexSpace'
    )
    this.controller.options = {
      prompt: 'Комментарий к фрагменту',
      placeHolder: 'Текст комментария… (Esc — отмена)',
    }
    this.setCommentingRangeProvider()
    this.subs.push(this.comments.onDidUpdate(() => void this.refresh()))
  }

  private setCommentingRangeProvider(): void {
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: doc => {
        const rel = this.relOf(doc.uri)
        if (!rel || !this.managesRel?.(rel)) return []
        return [new vscode.Range(0, 0, Math.max(0, doc.lineCount - 1), 1e6)]
      },
    }
  }

  /**
   * Заставить VSCode заново запросить комментируемые диапазоны. Нужно,
   * когда документ стал live уже после открытия: VSCode кэширует пустой
   * результат провайдера и сам не переспрашивает, из-за чего значок «+» на
   * полях не появляется (остаётся только контекстное меню). Переустановка
   * провайдера сбрасывает кэш.
   */
  pokeCommentingRanges(): void {
    this.setCommentingRangeProvider()
  }

  dispose(): void {
    for (const t of this.byThreadId.values()) t.dispose()
    this.byThreadId.clear()
    this.controller.dispose()
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

  /** Наш threadId для треда, созданного этим контроллером. */
  threadIdOf(thread: vscode.CommentThread): string | undefined {
    return (thread as LsThread).lsThreadId
  }

  /** Пересобрать инлайн-треды из модели комментариев. */
  async refresh(): Promise<void> {
    if (this.refreshing) {
      this.refreshQueued = true
      return
    }
    this.refreshing = true
    try {
      // решённые треды в редакторе не показываем (как в Overleaf)
      const models = this.comments
        .getThreads()
        .filter(m => m.filePath && !m.resolved && m.messages.length > 0)
      const seen = new Set<string>()
      for (const m of models) {
        seen.add(m.threadId)
        await this.upsertThread(m).catch(() => undefined)
      }
      for (const [id, thread] of this.byThreadId) {
        if (!seen.has(id)) {
          thread.dispose()
          this.byThreadId.delete(id)
        }
      }
    } finally {
      this.refreshing = false
      if (this.refreshQueued) {
        this.refreshQueued = false
        void this.refresh()
      }
    }
  }

  private async upsertThread(m: ThreadModel): Promise<void> {
    const uri = vscode.Uri.file(path.join(this.rootDir, m.filePath))
    let doc: vscode.TextDocument
    try {
      doc = await vscode.workspace.openTextDocument(uri)
    } catch {
      return
    }
    const max = doc.getText().length
    const start = Math.min(Math.max(0, m.start), max)
    const end = Math.min(Math.max(m.end, start), max)
    const range = new vscode.Range(doc.positionAt(start), doc.positionAt(end))

    let thread = this.byThreadId.get(m.threadId)
    if (!thread) {
      thread = this.controller.createCommentThread(uri, range, []) as LsThread
      thread.lsThreadId = m.threadId
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed
      this.byThreadId.set(m.threadId, thread)
    } else if (!thread.range?.isEqual(range)) {
      thread.range = range
    }
    // цитату в заголовок не выносим — комментируемый текст и так виден
    // прямо над виджетом
    thread.label = ''
    thread.contextValue = 'lsOpen'
    thread.canReply = true
    thread.comments = m.messages.map(msg => ({
      body: new vscode.MarkdownString(msg.text ?? ''),
      mode: vscode.CommentMode.Preview,
      author: { name: authorName(msg) },
      timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined,
    }))
  }
}
