import MemberPrivileges from './member-privileges'
import OLRow from '@/shared/components/ol/ol-row'
import OLCol from '@/shared/components/ol/ol-col'
import MaterialIcon from '@/shared/components/material-icon'
import { ProjectMember } from '@/shared/context/types/project-metadata'
import { useUserContext } from '@/shared/context/user-context'
import { useTranslation } from 'react-i18next'
import { useProjectContext } from '@/shared/context/project-context'

export default function ViewMember({ member }: { member: ProjectMember }) {
  const { t } = useTranslation()
  const user = useUserContext()
  const { project } = useProjectContext()

  // Display alias if present (for anonymous reviewers), otherwise email
  const displayName = member.alias || member.email

  // Check if this member is the current user
  const isCurrentUser = user.id && member._id === user.id

  return (
    <OLRow className="project-member">
      <OLCol xs={8}>
        <div className="project-member-email-icon">
          <MaterialIcon type="person" />
          <div className="email-warning">
            {displayName}
            {isCurrentUser && <span> ({t('you')})</span>}
          </div>
        </div>
      </OLCol>
      <OLCol xs={4} className="text-end">
        <MemberPrivileges
          privileges={member.privileges}
          member={member}
          trackChangesState={project?.trackChangesState}
        />
      </OLCol>
    </OLRow>
  )
}
