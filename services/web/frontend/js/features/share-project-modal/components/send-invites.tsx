import AddCollaborators from './add-collaborators'
import OLRow from '@/shared/components/ol/ol-row'

export default function SendInvites({
  canAddCollaborators,
  hasExceededCollaboratorLimit,
  haveAnyEditorsBeenDowngraded,
  somePendingEditorsResolved,
}: {
  canAddCollaborators: boolean
  hasExceededCollaboratorLimit: boolean
  haveAnyEditorsBeenDowngraded: boolean
  somePendingEditorsResolved: boolean
}) {
  return (
    <OLRow className="invite-controls">
      <AddCollaborators readOnly={!canAddCollaborators} />
    </OLRow>
  )
}
