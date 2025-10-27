import { useState } from 'react'
import OLButton from '@/shared/components/ol/ol-button'
import { useTranslation } from 'react-i18next'
import DeleteProjectModal from '../../../modals/delete-project-modal'
import useIsMounted from '../../../../../../shared/hooks/use-is-mounted'
import { useProjectListContext } from '../../../../context/project-list-context'
import { deleteProject } from '../../../../util/api'
import { Project } from '../../../../../../../../types/project/dashboard/api'
import getMeta from '@/utils/meta'

function DeleteProjectsButton() {
  const { userHasFullPermissions } = getMeta('ol-ExposedSettings')
  const { t } = useTranslation()
  const {
    selectedProjects,
    removeProjectFromView,
    hasLeavableProjectsSelected,
    hasDeletableProjectsSelected,
  } = useProjectListContext()
  const [showModal, setShowModal] = useState(false)
  const isMounted = useIsMounted()

  // Hide if user has basic permissions or any selected project is protected
  const hasProtectedProject = selectedProjects.some(
    project => project.isProtected
  )
  if (!userHasFullPermissions || hasProtectedProject) {
    return null
  }

  const handleOpenModal = () => {
    setShowModal(true)
  }

  const handleCloseModal = () => {
    if (isMounted.current) {
      setShowModal(false)
    }
  }

  const handleDeleteProject = async (project: Project) => {
    await deleteProject(project.id)

    removeProjectFromView(project)
  }

  return (
    <>
      {hasDeletableProjectsSelected && !hasLeavableProjectsSelected && (
        <OLButton variant="danger" onClick={handleOpenModal}>
          {t('delete')}
        </OLButton>
      )}
      <DeleteProjectModal
        projects={selectedProjects}
        actionHandler={handleDeleteProject}
        showModal={showModal}
        handleCloseModal={handleCloseModal}
      />
    </>
  )
}

export default DeleteProjectsButton
