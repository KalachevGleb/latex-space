import React, { FC, useMemo } from 'react'
import { useThreadsContext } from '../context/threads-context'
import { useRangesContext } from '../context/ranges-context'
import { useTranslation } from 'react-i18next'
import { ReviewPanelResolvedThread } from './review-panel-resolved-thread'
import useProjectRanges from '../hooks/use-project-ranges'
import { useFileTreeData } from '@/shared/context/file-tree-data-context'
import { ThreadId } from '../../../../../types/review-panel/review-panel'
import LoadingSpinner from '@/shared/components/loading-spinner'
import OLBadge from '@/shared/components/ol/ol-badge'
import getMeta from '@/utils/meta'
import {
  buildCommentsMap,
  selectResolvedThreads,
} from '../utils/resolved-comments'

export const ReviewPanelResolvedThreadsMenu: FC = () => {
  const { t } = useTranslation()
  const threads = useThreadsContext()
  const { docs } = useFileTreeData()
  // The currently-open document's live ranges. Its comments may not yet be
  // flushed to the docstore-backed project ranges, so merge them in to make
  // sure resolved comments in the open file are not missing from this menu.
  const docRanges = useRangesContext()

  const { projectRanges, loading } = useProjectRanges()

  const docNameForThread = useMemo(() => {
    const docNameForThread = new Map<string, string>()
    const otMigrationStage = getMeta('ol-otMigrationStage')

    for (const [docId, ranges] of projectRanges?.entries() ?? []) {
      const docName = docs?.find(
        doc => (otMigrationStage === 1 ? doc.path : doc.doc.id) === docId
      )?.doc.name
      if (docName !== undefined) {
        for (const comment of ranges.comments) {
          docNameForThread.set(comment.op.t, docName)
        }
      }
    }

    // Current document last, so its (live) name wins over the snapshot.
    if (docRanges) {
      const docName = docs?.find(
        doc => doc.doc.id === docRanges.docId
      )?.doc.name
      if (docName !== undefined) {
        for (const comment of docRanges.comments) {
          docNameForThread.set(comment.op.t, docName)
        }
      }
    }

    return docNameForThread
  }, [docs, projectRanges, docRanges])

  const allComments = useMemo(
    () => buildCommentsMap([...(projectRanges?.values() ?? []), docRanges]),
    [projectRanges, docRanges]
  )

  const resolvedThreads = useMemo(
    () => selectResolvedThreads(threads, allComments),
    [threads, allComments]
  )

  if (loading) {
    return <LoadingSpinner className="ms-auto me-auto" />
  }

  if (!resolvedThreads.length) {
    return (
      <div className="review-panel-resolved-comments-empty">
        {t('no_resolved_comments')}
      </div>
    )
  }

  return (
    <>
      <div className="review-panel-resolved-comments-header">
        <div className="review-panel-resolved-comments-label">
          {t('resolved_comments')}
        </div>
        <OLBadge
          bg="light"
          text="dark"
          className="review-panel-resolved-comments-count"
        >
          {resolvedThreads.length}
        </OLBadge>
      </div>
      {resolvedThreads.map(thread => {
        const comment = allComments.get(thread.id)
        if (!comment) {
          return null
        }

        return (
          <ReviewPanelResolvedThread
            key={thread.id}
            id={thread.id as ThreadId}
            comment={comment}
            docName={docNameForThread.get(thread.id) ?? t('unknown')}
          />
        )
      })}
    </>
  )
}
