import { memo, useCallback, useMemo, useState } from 'react'
import { useRangesActionsContext } from '../context/ranges-context'
import {
  Change,
  DeleteOperation,
  EditOperation,
} from '../../../../../types/change'
import { useTranslation } from 'react-i18next'
import classnames from 'classnames'
import { usePermissionsContext } from '@/features/ide-react/context/permissions-context'
import { FormatTimeBasedOnYear } from '@/shared/components/format-time-based-on-year'
import { useChangesUsersContext } from '../context/changes-users-context'
import { ReviewPanelChangeUser } from './review-panel-change-user'
import { ReviewPanelEntry } from './review-panel-entry'
import { useModalsContext } from '@/features/ide-react/context/modals-context'
import { ReviewPanelCommentWithMath } from './review-panel-comment-with-math'
import { ChangeAction } from '@/features/review-panel/components/review-panel-change-action'
import {
  AddIcon,
  DeleteIcon,
  EditIcon,
} from '@/features/review-panel/components/review-panel-action-icons'
import { buildName } from '../utils/build-name'
import { getBackgroundColorForUserId } from '@/shared/utils/colors'
import OLTooltip from '@/shared/components/ol/ol-tooltip'

function getInitials(name: string): string {
  //const parts = name.trim().split(/\s+/)
  //if (parts.length >= 2) {
  //  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  //}
  return name.slice(0, 1).toUpperCase()
}

function getCompactContent(
  change: Change<EditOperation>,
  aggregate: Change<DeleteOperation> | undefined
): { type: 'insert' | 'delete' | 'replace'; oldText?: string; newText?: string; text?: string } {
  const aggregateChange = aggregate && /\S/.test(aggregate.op.d)

  if ('i' in change.op) {
    if (aggregateChange) {
      return { type: 'replace', oldText: aggregate.op.d, newText: change.op.i }
    }
    return { type: 'insert', text: change.op.i }
  }

  if ('d' in change.op) {
    return { type: 'delete', text: change.op.d }
  }

  return { type: 'insert', text: '' }
}

export const ReviewPanelChange = memo<{
  change: Change<EditOperation>
  aggregate?: Change<DeleteOperation>
  top?: number
  editable?: boolean
  docId: string
  hoverRanges?: boolean
  hovered?: boolean
  expanded?: boolean
  onToggleExpand?: (changeId: string) => void
  handleEnter?: (changeId: string) => void
  handleLeave?: () => void
}>(
  ({
    change,
    aggregate,
    top,
    docId,
    hoverRanges,
    editable = true,
    hovered,
    expanded = false,
    onToggleExpand,
    handleEnter,
    handleLeave,
  }) => {
    const { t } = useTranslation()
    const { acceptChanges, rejectChanges } = useRangesActionsContext()
    const permissions = usePermissionsContext()
    const changesUsers = useChangesUsersContext()
    const { showGenericMessageModal } = useModalsContext()

    const [accepting, setAccepting] = useState(false)

    const acceptHandler = useCallback(async (e: React.MouseEvent) => {
      e.stopPropagation()
      setAccepting(true)
      try {
        if (aggregate) {
          await acceptChanges(change, aggregate)
        } else {
          await acceptChanges(change)
        }
      } catch (err) {
        showGenericMessageModal(
          t('accept_change_error_title'),
          t('accept_change_error_description')
        )
      } finally {
        setAccepting(false)
      }
    }, [acceptChanges, aggregate, change, showGenericMessageModal, t])

    const rejectHandler = useCallback(async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (aggregate) {
        await rejectChanges(change, aggregate)
      } else {
        await rejectChanges(change)
      }
    }, [aggregate, change, rejectChanges])

    const translations = useMemo(
      () => ({
        accept_change: t('accept_change'),
        reject_change: t('reject_change'),
        aggregate_changed: t('aggregate_changed'),
        aggregate_to: t('aggregate_to'),
        tracked_change_added: t('tracked_change_added'),
        tracked_change_deleted: t('tracked_change_deleted'),
      }),
      [t]
    )

    const { handleMouseEnter, handleMouseLeave } = useMemo(
      () => ({
        handleMouseEnter: handleEnter && (() => handleEnter(change.id)),
        handleMouseLeave: handleLeave && (() => handleLeave()),
      }),
      [change.id, handleEnter, handleLeave]
    )

    const handleToggle = useCallback(() => {
      onToggleExpand?.(change.id)
    }, [change.id, onToggleExpand])

    if (!changesUsers) {
      return null
    }

    const cropText = (text: string, n: number) => {
      return text.length > n ? text.slice(0, n) + '...' : text
    }

    const aggregateChange = aggregate && /\S/.test(aggregate.op.d)
    const userId = change.metadata?.user_id
    const user = userId ? changesUsers.get(userId) : undefined
    const userName = user ? buildName(user) : t('deleted_user')
    const userColor = getBackgroundColorForUserId(user?.id)
    const initials = getInitials(userName)
    const compactContent = getCompactContent(change, aggregate)

    const actionButtons = editable && (
      <div className="review-panel-entry-actions">
        {permissions.write && (
          <ChangeAction
            id="accept-change"
            label={translations.accept_change}
            type="check"
            handleClick={acceptHandler}
          />
        )}
        {(permissions.write || permissions.trackedWrite) && (
          <ChangeAction
            id="reject-change"
            label={translations.reject_change}
            type="close"
            handleClick={rejectHandler}
          />
        )}
      </div>
    )

    // Compact (collapsed) view
    if (!expanded) {
      return (
        <ReviewPanelEntry
          className={classnames('review-panel-entry-change', 'review-panel-entry-compact', {
            'review-panel-entry-insert': 'i' in change.op,
            'review-panel-entry-delete': 'd' in change.op,
            'review-panel-entry-hover': hovered,
          })}
          top={top}
          op={change.op}
          position={change.op.p}
          docId={docId}
          hoverRanges={hoverRanges}
          disabled={accepting}
          handleEnter={handleMouseEnter}
          handleLeave={handleMouseLeave}
          entryIndicator="edit"
        >
          <div
            className="review-panel-entry-compact-content"
            onClick={handleToggle}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="review-panel-entry-compact-left">
              <OLTooltip id="review-panel-entry-initials" description={userName}>
                <span
                    className="review-panel-entry-initials"
                    style={{ backgroundColor: userColor }}
                    title={userName}
                >
                {initials}
              </span>
              </OLTooltip>
              <span className="review-panel-entry-compact-change">
                {compactContent.type === 'replace' && (
                  <>
                    <del className="review-panel-content-highlight">
                      {cropText(compactContent.oldText!, 15)}
                    </del>
                    {' → '}
                    <ins className="review-panel-content-highlight">
                      {cropText(compactContent.newText!, 30)}
                    </ins>
                  </>
                )}
                {compactContent.type === 'insert' && (
                  <ins className="review-panel-content-highlight">
                    {cropText(compactContent.text!, 50)}
                  </ins>
                )}
                {compactContent.type === 'delete' && (
                  <del className="review-panel-content-highlight">
                    {cropText(compactContent.text!, 50)}
                  </del>
                )}
              </span>
            </div>
            {actionButtons}
          </div>
        </ReviewPanelEntry>
      )
    }

    // Expanded view (full, current design)
    return (
      <ReviewPanelEntry
        className={classnames('review-panel-entry-change', {
          'review-panel-entry-insert': 'i' in change.op,
          'review-panel-entry-delete': 'd' in change.op,
          'review-panel-entry-hover': hovered,
        })}
        top={top}
        op={change.op}
        position={change.op.p}
        docId={docId}
        hoverRanges={hoverRanges}
        disabled={accepting}
        handleEnter={handleMouseEnter}
        handleLeave={handleMouseLeave}
        entryIndicator="edit"
      >
        <div
          className="review-panel-entry-content"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className="review-panel-entry-compact-collapse-header"
            onClick={handleToggle}
          >
            <div className="review-panel-entry-header">
              <div>
                <ReviewPanelChangeUser change={change} />
                {change.metadata?.ts && (
                  <div className="review-panel-entry-time">
                    <FormatTimeBasedOnYear date={change.metadata.ts} />
                  </div>
                )}
              </div>
              {actionButtons}
            </div>
          </div>

          <div className="review-panel-change-body">
            {'i' in change.op && (
              <>
                {aggregateChange ? <EditIcon /> : <AddIcon />}

                {aggregateChange ? (
                  <span>
                    {translations.aggregate_changed}:{' '}
                    <del className="review-panel-content-highlight">
                      <ReviewPanelCommentWithMath
                        inline
                        content={aggregate.op.d}
                        checkNewLines={false}
                      />
                    </del>{' '}
                    {translations.aggregate_to}{' '}
                    <ReviewPanelCommentWithMath
                      inline
                      content={change.op.i}
                      checkNewLines={false}
                    />
                  </span>
                ) : (
                  <span>
                    {translations.tracked_change_added}:&nbsp;
                    <ins className="review-panel-content-highlight">
                      <ReviewPanelCommentWithMath
                        content={change.op.i}
                        checkNewLines={false}
                      />
                    </ins>
                  </span>
                )}
              </>
            )}

            {'d' in change.op && (
              <>
                <DeleteIcon />
                <span>
                  {translations.tracked_change_deleted}:&nbsp;
                  <del className="review-panel-content-highlight">
                    <ReviewPanelCommentWithMath
                      content={change.op.d}
                      checkNewLines={false}
                    />
                  </del>
                </span>
              </>
            )}
          </div>
        </div>
      </ReviewPanelEntry>
    )
  }
)
ReviewPanelChange.displayName = 'ReviewPanelChange'
