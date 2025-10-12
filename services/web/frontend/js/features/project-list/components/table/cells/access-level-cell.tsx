import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Project } from '../../../../../../../types/project/dashboard/api'

type AccessLevelCellProps = {
  project: Project
}

function AccessLevelCell({ project }: AccessLevelCellProps) {
  const { t } = useTranslation()
  
  const getAccessLevelLabel = (accessLevel: string) => {
    switch (accessLevel) {
      case 'owner':
        return t('owner')
      case 'readWrite':
        return t('editor')
      case 'readOnly':
        return t('read_only')
      case 'review':
        return t('reviewer')
      default:
        return accessLevel
    }
  }

  return (
    <span className="access-level-label">
      {getAccessLevelLabel(project.accessLevel)}
    </span>
  )
}

export default memo(AccessLevelCell)

