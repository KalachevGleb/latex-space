import { memo } from 'react'
import InlineTags from './cells/inline-tags'
import OwnerCell from './cells/owner-cell'
import AccessLevelCell from './cells/access-level-cell'
import LastUpdatedCell from './cells/last-updated-cell'
import ActionsCell from './cells/actions-cell'
import ActionsDropdown from '../dropdown/actions-dropdown'
import { getOwnerName } from '../../util/project'
import { Project } from '../../../../../../types/project/dashboard/api'
import { ProjectCheckbox } from './project-checkbox'
import { ProjectListOwnerName } from '@/features/project-list/components/table/project-list-owner-name'
import MaterialIcon from '@/shared/components/material-icon'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import { useTranslation } from 'react-i18next'

type ProjectListTableRowProps = {
  project: Project
  selected: boolean
}
function ProjectListTableRow({ project, selected }: ProjectListTableRowProps) {
  const ownerName = getOwnerName(project)
  const { t } = useTranslation()

  return (
    <tr className={selected ? 'table-active' : undefined}>
      <td className="dash-cell-checkbox d-none d-md-table-cell">
        <ProjectCheckbox projectId={project.id} projectName={project.name} />
      </td>
      <td className="dash-cell-name">
        <a href={`/project/${project.id}`} translate="no">
          {project.name}
        </a>{' '}
        {project.isProtected && (
          <OLTooltip
            id={`protected-project-${project.id}`}
            description={t('protected_project_cannot_be_deleted')}
            overlayProps={{ placement: 'top' }}
          >
            <MaterialIcon
              type="lock"
              className="align-text-bottom"
              accessibilityLabel={t('protected_project')}
            />
          </OLTooltip>
        )}
        <InlineTags className="d-none d-md-inline" projectId={project.id} />
      </td>
      <td className="dash-cell-access-level d-none d-md-table-cell">
        <AccessLevelCell project={project} />
      </td>
      <td className="dash-cell-date-owner pb-0 d-md-none">
        <LastUpdatedCell project={project} />
        {ownerName ? <ProjectListOwnerName ownerName={ownerName} /> : null}
      </td>
      <td className="dash-cell-owner d-none d-md-table-cell">
        <OwnerCell project={project} />
      </td>
      <td className="dash-cell-date d-none d-md-table-cell">
        <LastUpdatedCell project={project} />
      </td>
      <td className="dash-cell-tag pt-0 d-md-none">
        <InlineTags projectId={project.id} />
      </td>
      <td className="dash-cell-actions">
        <div className="d-none d-md-block">
          <ActionsCell project={project} />
        </div>
        <div className="d-md-none">
          <ActionsDropdown project={project} />
        </div>
      </td>
    </tr>
  )
}
export default memo(ProjectListTableRow)
