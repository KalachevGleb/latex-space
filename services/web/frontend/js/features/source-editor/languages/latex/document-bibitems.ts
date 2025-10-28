import { Bibitem, enterNode } from '../../utils/tree-operations/bibitems'
import { makeProjectionStateField } from '../../utils/projection-state-field'

export const documentBibitems = makeProjectionStateField<Bibitem>(enterNode)
