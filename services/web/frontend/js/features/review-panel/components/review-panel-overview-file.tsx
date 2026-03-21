import { FC, useMemo } from 'react'
import { MainDocument } from '../../../../../types/project-settings'
import { Ranges } from '../context/ranges-context'
import { ReviewPanelComment } from './review-panel-comment'
import { ReviewPanelChange } from './review-panel-change'
import {
  isCommentOperation,
  isDeleteChange,
  isInsertChange,
} from '@/utils/operations'
import {
  Change,
  CommentOperation,
  DeleteOperation,
  EditOperation,
} from '../../../../../types/change'
import { canAggregate } from '../utils/can-aggregate'

import useOverviewFileCollapsed from '../hooks/use-overview-file-collapsed'
import { useThreadsContext } from '../context/threads-context'
import { useReviewPanelFilterContext } from '../context/review-panel-filter-context'
import { useUserContext } from '@/shared/context/user-context'
import { CollapsibleFileHeader } from '@/shared/components/collapsible-file-header'

export const ReviewPanelOverviewFile: FC<{
  doc: MainDocument
  ranges: Ranges
}> = ({ doc, ranges }) => {
  const { collapsed, toggleCollapsed } = useOverviewFileCollapsed(doc.doc.id)
  const threads = useThreadsContext()
  const { filterMode, hideMine } = useReviewPanelFilterContext()
  const user = useUserContext()

  const { aggregates, changes } = useMemo(() => {
    const changes: Change<EditOperation>[] = []
    const aggregates: Map<string, Change<DeleteOperation>> = new Map()

    let precedingChange: Change<EditOperation> | null = null
    for (const change of ranges.changes) {
      if (
        precedingChange &&
        isInsertChange(precedingChange) &&
        isDeleteChange(change) &&
        canAggregate(change, precedingChange)
      ) {
        aggregates.set(precedingChange.id, change)
      } else {
        changes.push(change)
      }
      precedingChange = change
    }

    return { aggregates, changes }
  }, [ranges])

  const entries = useMemo(() => {
    let filteredChanges = changes
    let unresolvedComments = ranges.comments.filter(comment => {
      if (comment.resolved) {
        return false
      }
      const thread = threads?.[comment.op.t]
      return thread && thread.messages.length > 0 && !thread.resolved
    })

    // Filter by mode
    if (filterMode === 'comments') {
      filteredChanges = []
    } else if (filterMode === 'changes') {
      unresolvedComments = []
    }

    // Filter out my changes only (keep comments)
    if (hideMine) {
      filteredChanges = filteredChanges.filter(
        change => change.metadata?.user_id !== user.id
      )
    }

    return [...filteredChanges, ...unresolvedComments].sort(
      (a, b) => a.op.p - b.op.p
    )
  }, [changes, ranges.comments, threads, filterMode, hideMine, user.id])

  if (entries.length === 0) {
    return null
  }

  return (
    <>
      <div>
        <CollapsibleFileHeader
          name={doc.doc.name}
          count={entries.length}
          collapsed={collapsed}
          toggleCollapsed={toggleCollapsed}
        />

        {!collapsed && (
          <div className="review-panel-overview-file-entries">
            {entries.map(entry =>
              isCommentOperation(entry.op) ? (
                <ReviewPanelComment
                  key={entry.id}
                  comment={entry as Change<CommentOperation>}
                  docId={doc.doc.id}
                  hoverRanges={false}
                />
              ) : (
                <ReviewPanelChange
                  key={entry.id}
                  change={entry as Change<EditOperation>}
                  aggregate={aggregates.get(entry.id)}
                  editable={false}
                  docId={doc.doc.id}
                  hoverRanges={false}
                />
              )
            )}
          </div>
        )}
      </div>
      <div className="review-panel-overfile-divider" />
    </>
  )
}
