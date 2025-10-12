import { useProjectContext } from '@/shared/context/project-context'
import { useTranslation } from 'react-i18next'
import OLRow from '@/shared/components/ol/ol-row'
import OLCol from '@/shared/components/ol/ol-col'
import MaterialIcon from '@/shared/components/material-icon'
import { useUserContext } from '@/shared/context/user-context'

export default function OwnerInfo() {
  const { t } = useTranslation()
  const { project } = useProjectContext()
  const user = useUserContext()
  
  // Check if the owner is the current user
  const isCurrentUser = user.id && project?.owner._id === user.id

  return (
    <OLRow className="project-member">
      <OLCol xs={8}>
        <div className="project-member-email-icon">
          <MaterialIcon type="person" />
          <div className="email-warning">
            {project?.owner.email}
            {isCurrentUser && <span> ({t('you')})</span>}
          </div>
        </div>
      </OLCol>
      <OLCol xs={4} className="text-end">
        {t('owner')}
      </OLCol>
    </OLRow>
  )
}
