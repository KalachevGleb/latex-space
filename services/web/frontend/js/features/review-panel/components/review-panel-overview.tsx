import { FC, useMemo } from 'react'
import { useFileTreeData } from '@/shared/context/file-tree-data-context'
import { useRangesContext } from '../context/ranges-context'
import { useTranslation } from 'react-i18next'
import { ReviewPanelOverviewFile } from './review-panel-overview-file'
import ReviewPanelEmptyState from './review-panel-empty-state'
import useProjectRanges from '../hooks/use-project-ranges'
import getMeta from '@/utils/meta'
import { buildRangesForDocs } from '../utils/build-ranges-for-docs'

export const ReviewPanelOverview: FC = () => {
  const { t } = useTranslation()
  const { docs } = useFileTreeData()
  const docRanges = useRangesContext()

  const { projectRanges, error } = useProjectRanges()

  const rangesForDocs = useMemo(
    () =>
      buildRangesForDocs(
        docs,
        docRanges,
        projectRanges,
        getMeta('ol-otMigrationStage')
      ),
    [docRanges, docs, projectRanges]
  )

  const showEmptyState = useMemo((): boolean => {
    if (!rangesForDocs) {
      // data isn't loaded yet
      return false
    }

    for (const ranges of rangesForDocs.values()) {
      if (ranges.changes.length > 0 || ranges.comments.length > 0) {
        return false
      }
    }

    return true
  }, [rangesForDocs])

  return (
    <div
      className="review-panel-overview"
      id="review-panel-overview"
      aria-labelledby="review-panel-tab-button-overview"
    >
      {error && <div>{t('something_went_wrong')}</div>}

      {showEmptyState && <ReviewPanelEmptyState />}

      {docs && rangesForDocs && (
        <div>
          {docs.map(doc => {
            const ranges = rangesForDocs.get(doc.doc.id)
            return (
              ranges && <ReviewPanelOverviewFile doc={doc} ranges={ranges} />
            )
          })}
        </div>
      )}
    </div>
  )
}
