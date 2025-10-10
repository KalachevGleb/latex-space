import MemberPrivileges from './member-privileges'
import OLRow from '@/shared/components/ol/ol-row'
import OLCol from '@/shared/components/ol/ol-col'
import MaterialIcon from '@/shared/components/material-icon'
import { ProjectMember } from '@/shared/context/types/project-metadata'

export default function ViewMember({ member }: { member: ProjectMember }) {
  // Display alias if present (for anonymous reviewers), otherwise email
  const displayName = member.alias || member.email
  
  return (
    <OLRow className="project-member">
      <OLCol xs={8}>
        <div className="project-member-email-icon">
          <MaterialIcon type="person" />
          <div className="email-warning">{displayName}</div>
        </div>
      </OLCol>
      <OLCol xs={4} className="text-end">
        <MemberPrivileges privileges={member.privileges} />
      </OLCol>
    </OLRow>
  )
}
