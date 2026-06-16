import { Change, CommentOperation } from '../../../../../types/change'
import { Ranges } from '../context/ranges-context'
import { Threads } from '../context/threads-context'

export type ResolvedComment = Change<CommentOperation> & { resolved?: boolean }

/**
 * Build a threadId -> comment map from several documents' ranges.
 *
 * Ranges that appear later in the list override earlier ones, so the live
 * ranges of the currently-open document (which may contain comments that have
 * not yet been flushed to the docstore) can be passed last to take precedence
 * over the project-wide snapshot.
 */
export const buildCommentsMap = (
  rangesList: Array<Ranges | undefined>
): Map<string, ResolvedComment> => {
  const map = new Map<string, ResolvedComment>()
  for (const ranges of rangesList) {
    if (!ranges) {
      continue
    }
    for (const comment of ranges.comments) {
      map.set(comment.op.t, comment)
    }
  }
  return map
}

/**
 * Select the threads that are resolved AND still have a matching comment to
 * display, newest first.
 *
 * A thread is considered resolved when either the thread itself is marked
 * resolved (sharejs-text-ot) or its comment carries a resolved flag
 * (history-ot). Threads without a matching comment are dropped because the
 * resolved view needs the comment to render its quoted text and author.
 */
export const selectResolvedThreads = (
  threads: Threads | undefined,
  commentsMap: Map<string, ResolvedComment>
): Array<{ id: string; thread: Threads[keyof Threads] }> => {
  if (!threads) {
    return []
  }

  const resolved: Array<{ id: string; thread: Threads[keyof Threads] }> = []
  for (const [id, thread] of Object.entries(threads)) {
    if (thread.resolved || commentsMap.get(id)?.resolved) {
      resolved.push({ id, thread })
    }
  }

  resolved.sort((a, b) => {
    if (!a.thread.resolved_at || !b.thread.resolved_at) {
      return 0
    }
    return Date.parse(b.thread.resolved_at) - Date.parse(a.thread.resolved_at)
  })

  return resolved.filter(({ id }) => commentsMap.has(id))
}
