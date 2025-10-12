import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import getMeta from '@/utils/meta'
import CopyProjectMenuItem from '../menu-items/copy-project-menu-item'
import RenameProjectMenuItem from '../menu-items/rename-project-menu-item'
import {
  Dropdown,
  DropdownMenu,
  DropdownToggle,
} from '@/shared/components/dropdown/dropdown-menu'

function ProjectToolsMoreDropdownButton() {
  const { peerReviewMode } = getMeta('ol-ExposedSettings')
  const { t } = useTranslation()
  
  // Hide "More" dropdown if peer-review mode is on (since copy is hidden)
  if (peerReviewMode) return null

  return (
    <Dropdown align="end">
      <DropdownToggle id="project-tools-more-dropdown" variant="secondary">
        {t('more')}
      </DropdownToggle>
      <DropdownMenu flip={false} data-testid="project-tools-more-dropdown-menu">
        <RenameProjectMenuItem />
        <CopyProjectMenuItem />
      </DropdownMenu>
    </Dropdown>
  )
}

export default memo(ProjectToolsMoreDropdownButton)
