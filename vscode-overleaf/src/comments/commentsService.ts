import * as vscode from 'vscode'
import { LatexSpaceClient } from '../api/client'
import { CommentMessage } from '../api/types'
import type { LiveRanges } from '../realtime/realtimeManager'
import { ProjectMeta } from '../sync/state'

export interface ThreadModel {
  threadId: string
  /** относительный путь файла; '' — тред без привязки к тексту */
  filePath: string
  docId?: string
  start: number
  end: number
  quoted: string
  resolved: boolean
  messages: CommentMessage[]
  /** позиция получена из live-модели (точная) */
  live: boolean
}

export function authorName(m: CommentMessage): string {
  const a = m.author
  if (!a) return 'Неизвестный автор'
  if (a.alias) return a.alias
  const name = [a.first_name, a.last_name].filter(Boolean).join(' ')
  return name || a.email || a.id
}

/**
 * Модель комментариев. Позиции берутся из двух источников:
 *  - live-диапазоны привязанных документов (realtime, мгновенно и точно);
 *  - REST /api/project/:id/comments для остальных файлов (может отставать).
 * Тексты тредов — из /project/:id/threads (MongoDB, без задержек).
 */
export class CommentsService implements vscode.Disposable {
  private threads: ThreadModel[] = []
  private timer?: NodeJS.Timeout
  private updateEmitter = new vscode.EventEmitter<void>()
  readonly onDidUpdate = this.updateEmitter.event
  private lastError?: string
  private refreshing = false
  private refreshQueued = false

  /** поставщик live-диапазонов (RealtimeManager) */
  liveProvider?: () => LiveRanges[]

  constructor(
    private client: LatexSpaceClient,
    private meta: ProjectMeta,
    private output: vscode.OutputChannel
  ) {}

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.updateEmitter.dispose()
  }

  startPolling(intervalSeconds: number): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(
      () => void this.refresh(true),
      Math.max(5, intervalSeconds) * 1000
    )
    void this.refresh(true)
  }

  getThreads(): ThreadModel[] {
    return this.threads
  }

  threadById(threadId: string): ThreadModel | undefined {
    return this.threads.find(t => t.threadId === threadId)
  }

  async refresh(silent = false): Promise<void> {
    if (this.refreshing) {
      this.refreshQueued = true
      return
    }
    this.refreshing = true
    try {
      const [threadsMap, restComments] = await Promise.all([
        this.client.getThreads(this.meta.projectId),
        this.client.getComments(this.meta.projectId).catch(() => []),
      ])
      const messagesOf = (threadId: string): CommentMessage[] =>
        (threadsMap[threadId]?.messages ?? []).map(m => ({
          author: m.user,
          text: m.content,
          timestamp: m.timestamp,
        }))
      const resolvedOf = (threadId: string): boolean =>
        !!threadsMap[threadId]?.resolved

      const models: ThreadModel[] = []
      const covered = new Set<string>()

      // 1) точные live-позиции из realtime-модели
      const live = this.liveProvider?.() ?? []
      const liveRels = new Set(live.map(l => l.rel))
      for (const doc of live) {
        for (const c of doc.comments) {
          const threadId = c.op.t
          if (!threadId || covered.has(threadId)) continue
          covered.add(threadId)
          models.push({
            threadId,
            filePath: doc.rel,
            docId: doc.docId,
            start: c.op.p,
            end: c.op.p + (c.op.c?.length ?? 0),
            quoted: c.op.c ?? '',
            resolved: resolvedOf(threadId),
            messages: messagesOf(threadId),
            live: true,
          })
        }
      }

      // 2) REST-позиции для файлов вне live-модели
      for (const c of restComments) {
        const rel = c.file.replace(/^\/+/, '')
        if (liveRels.has(rel) || covered.has(c.thread_id)) continue
        covered.add(c.thread_id)
        models.push({
          threadId: c.thread_id,
          filePath: rel,
          docId: undefined,
          start: c.position?.start ?? 0,
          end: c.position?.end ?? 0,
          quoted: c.text ?? '',
          resolved: resolvedOf(c.thread_id) || !!c.resolved,
          messages: messagesOf(c.thread_id).length
            ? messagesOf(c.thread_id)
            : (c.messages ?? []),
          live: false,
        })
      }

      // 3) треды без привязки к тексту
      for (const [threadId] of Object.entries(threadsMap)) {
        if (covered.has(threadId)) continue
        const msgs = messagesOf(threadId)
        if (msgs.length === 0) continue
        models.push({
          threadId,
          filePath: '',
          start: 0,
          end: 0,
          quoted: '',
          resolved: resolvedOf(threadId),
          messages: msgs,
          live: false,
        })
      }

      // docId для REST-тредов (нужен для resolve) — из /ranges
      if (models.some(m => !m.live && m.filePath && !m.docId)) {
        try {
          const ranges = await this.client.getRanges(this.meta.projectId)
          const threadToDoc = new Map<string, string>()
          for (const doc of ranges) {
            for (const c of doc.ranges?.comments ?? []) {
              if (c.op?.t) threadToDoc.set(c.op.t, doc.id)
            }
          }
          for (const m of models) {
            if (!m.docId) m.docId = threadToDoc.get(m.threadId)
          }
        } catch {
          /* не критично */
        }
      }

      this.threads = models
      this.lastError = undefined
      this.updateEmitter.fire()
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      this.output.appendLine(`[comments] ошибка обновления: ${this.lastError}`)
      if (!silent) {
        void vscode.window.showErrorMessage(
          `LatexSpace: не удалось получить комментарии: ${this.lastError}`
        )
      }
    } finally {
      this.refreshing = false
      if (this.refreshQueued) {
        this.refreshQueued = false
        void this.refresh(true)
      }
    }
  }

  async reply(threadId: string, content: string): Promise<void> {
    await this.client.replyToThread(this.meta.projectId, threadId, content)
    await this.refresh(true)
  }

  /** Создать тред (первое сообщение); якорь ставится отдельно через OT. */
  async createThread(threadId: string, content: string): Promise<void> {
    await this.client.replyToThread(this.meta.projectId, threadId, content)
  }

  async resolve(thread: ThreadModel): Promise<void> {
    if (!thread.docId) {
      throw new Error(
        'Не удалось определить документ комментария (позиции ещё не сохранены на сервере)'
      )
    }
    await this.client.resolveThread(
      this.meta.projectId,
      thread.docId,
      thread.threadId
    )
    await this.refresh(true)
  }

  async reopen(thread: ThreadModel): Promise<void> {
    if (!thread.docId) {
      throw new Error('Не удалось определить документ комментария')
    }
    await this.client.reopenThread(
      this.meta.projectId,
      thread.docId,
      thread.threadId
    )
    await this.refresh(true)
  }
}

/**
 * Найти диапазон процитированного текста в актуальном содержимом документа.
 * Для live-тредов позиции точные; для остальных ищем ближайшее
 * вхождение цитаты к сохранённой позиции.
 */
export function locateQuote(
  text: string,
  quoted: string,
  serverStart: number
): { start: number; end: number } | null {
  if (!quoted) return null
  if (text.startsWith(quoted, serverStart)) {
    return { start: serverStart, end: serverStart + quoted.length }
  }
  let best = -1
  let bestDist = Number.POSITIVE_INFINITY
  let idx = text.indexOf(quoted)
  while (idx !== -1) {
    const d = Math.abs(idx - serverStart)
    if (d < bestDist) {
      best = idx
      bestDist = d
    }
    idx = text.indexOf(quoted, idx + 1)
  }
  if (best === -1) return null
  return { start: best, end: best + quoted.length }
}
