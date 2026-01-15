import { ProjectMember, ProjectMetadata } from '@/shared/context/types/project-metadata'
import { useTranslation } from 'react-i18next'

export default function MemberPrivileges({
  privileges,
  member,
  trackChangesState,
}: {
  privileges: ProjectMember['privileges']
  member?: ProjectMember
  trackChangesState?: ProjectMetadata['trackChangesState']
}) {
  const { t } = useTranslation()

  // For review privilege, check if it's comment-only
  if (privileges === 'review' && member && trackChangesState) {
    const userId = member._id
    const userTrackChanges = typeof trackChangesState === 'object' ? trackChangesState[userId] : null

    if (userTrackChanges && typeof userTrackChanges === 'object' && 'canEdit' in userTrackChanges) {
      // New format with canEdit flag
      if (userTrackChanges.canEdit === false) {
        return t('reviewer_can_comment')
      } else {
        return t('reviewer_can_edit')
      }
    }
    // For canEdit from invite (backward compatibility)
    if (member.canEdit === false) {
      return t('reviewer_can_comment')
    } else if (member.canEdit === true) {
      return t('reviewer_can_edit')
    }
    // Default: show just "Reviewer"
    return t('reviewer')
  }

  switch (privileges) {
    case 'readAndWrite':
      return t('editor')

    case 'readOnly':
      return t('viewer')

    case 'review':
      return t('reviewer')

    default:
      return null
  }
}
