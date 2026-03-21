import { FC, memo } from 'react'
import classnames from 'classnames'
import MaterialIcon from '@/shared/components/material-icon'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import { useTranslation } from 'react-i18next'
import {
  FilterMode,
  useReviewPanelFilterActionsContext,
  useReviewPanelFilterContext,
} from '../context/review-panel-filter-context'

const filterOptions: { mode: FilterMode; icon: string; labelKey: string }[] = [
  { mode: 'comments', icon: 'comment', labelKey: 'filter_comments' },
  { mode: 'changes', icon: 'border_color', labelKey: 'filter_changes' },
  { mode: 'both', icon: 'rate_review', labelKey: 'filter_all' },
]

const ReviewPanelFilterToolbar: FC = () => {
  const { filterMode, hideMine } = useReviewPanelFilterContext()
  const { setFilterMode, toggleHideMine } =
    useReviewPanelFilterActionsContext()
  const { t } = useTranslation()

  const hideLabel = hideMine
    ? t('show_my_changes')
    : t('hide_my_changes')

  return (
    <div className="review-panel-filter-toolbar">
      <div className="review-panel-filter-group">
        {filterOptions.map(({ mode, icon, labelKey }) => (
          <OLTooltip
            key={mode}
            id={`review-filter-${mode}`}
            overlayProps={{ placement: 'bottom' }}
            description={t(labelKey)}
            tooltipProps={{ className: 'review-panel-tooltip' }}
          >
            <button
              type="button"
              className={classnames('review-panel-filter-btn', {
                'review-panel-filter-btn-active': filterMode === mode,
              })}
              onClick={() => setFilterMode(mode)}
              aria-pressed={filterMode === mode}
              aria-label={t(labelKey)}
            >
              <MaterialIcon type={icon} />
            </button>
          </OLTooltip>
        ))}
      </div>

      <OLTooltip
        id="review-filter-hide-mine"
        overlayProps={{ placement: 'bottom' }}
        description={hideLabel}
        tooltipProps={{ className: 'review-panel-tooltip' }}
      >
        <button
          type="button"
          className={classnames('review-panel-filter-btn', {
            'review-panel-filter-btn-active': hideMine,
          })}
          onClick={toggleHideMine}
          aria-pressed={hideMine}
          aria-label={hideLabel}
        >
          <MaterialIcon type={hideMine ? 'person_off' : 'person'} />
        </button>
      </OLTooltip>
    </div>
  )
}

export default memo(ReviewPanelFilterToolbar)
