import {
  createContext,
  useContext,
  useEffect,
  FC,
  useCallback,
  useMemo,
  useState,
  useRef,
} from 'react'
import { useIdeReactContext } from '@/features/ide-react/context/ide-react-context'
import { useConnectionContext } from '@/features/ide-react/context/connection-context'
import { useEditorOpenDocContext } from '@/features/ide-react/context/editor-open-doc-context'
import { getJSON, postJSON } from '@/infrastructure/fetch-json'
import { useOnlineUsersContext } from '@/features/ide-react/context/online-users-context'
import useSocketListener from '@/features/ide-react/hooks/use-socket-listener'
import useEventListener from '@/shared/hooks/use-event-listener'
import { useModalsContext } from '@/features/ide-react/context/modals-context'
import { usePermissionsContext } from '@/features/ide-react/context/permissions-context'
import { useTranslation } from 'react-i18next'
import { IdeEvents } from '@/features/ide-react/create-ide-event-emitter'
import { useCompilationUpdates } from '@/features/ide-react/hooks/use-compilation-updates'

export type Command = {
  caption: string
  snippet: string
  meta: string
  score: number
}

export type DocumentMetadata = {
  labels: string[]
  packages: Record<string, Command[]>
  packageNames: string[]
  bibitems?: string[]
  macros?: string[]
  environments?: string[]
}

type DocumentsMetadata = Record<string, DocumentMetadata>

type DocMetadataResponse = { docId: string; meta: DocumentMetadata }

export const MetadataContext = createContext<
  | {
      commands: Command[]
      labels: Set<string>
      packageNames: Set<string>
      bibitems: Set<string>
      macros: Set<string>
      environments: Set<string>
    }
  | undefined
>(undefined)

export const MetadataProvider: FC<React.PropsWithChildren> = ({ children }) => {
  const { t } = useTranslation()
  const { eventEmitter, permissionsLevel, projectId } = useIdeReactContext()
  const { socket } = useConnectionContext()
  const { onlineUsersCount } = useOnlineUsersContext()
  const permissions = usePermissionsContext()
  const { currentDocument } = useEditorOpenDocContext()
  const { showGenericMessageModal } = useModalsContext()

  const [documents, setDocuments] = useState<DocumentsMetadata>({})
  const [hasProjectChanges, setHasProjectChanges] = useState(false)

  const debouncerRef = useRef<Map<string, number>>(new Map()) // DocId => Timeout
  const inactivityTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const handleEntityDeleted = ({
      detail: [entity],
    }: CustomEvent<IdeEvents['entity:deleted']>) => {
      if (entity.type === 'doc') {
        setDocuments(documents => {
          delete documents[entity.entity._id]
          return { ...documents }
        })
      }
    }

    eventEmitter.on('entity:deleted', handleEntityDeleted)

    return () => {
      eventEmitter.off('entity:deleted', handleEntityDeleted)
    }
  }, [eventEmitter])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('project:metadata', { detail: documents })
    )
  }, [documents])

  const onBroadcastDocMeta = useCallback((data: DocMetadataResponse) => {
    const { docId, meta } = data
    if (docId != null && meta != null) {
      setDocuments(documents => ({ ...documents, [docId]: meta }))
    }
  }, [])

  const loadProjectMetaFromServer = useCallback(() => {
    getJSON(`/project/${projectId}/metadata`).then(
      (response: { projectMeta: DocumentsMetadata }) => {
        const { projectMeta } = response
        if (projectMeta) {
          setDocuments(projectMeta)
        }
      }
    )
  }, [projectId])

  const loadDocMetaFromServer = useCallback(
    (docId: string) => {
      // Don't broadcast metadata when there are no other users in the
      // project.
      const broadcast = onlineUsersCount > 0
      postJSON(`/project/${projectId}/doc/${docId}/metadata`, {
        body: {
          broadcast,
        },
      }).then((response: DocMetadataResponse) => {
        if (!broadcast && response) {
          // handle the POST response like a broadcast event when there are no
          // other users in the project.
          onBroadcastDocMeta(response)
        }
      })
    },
    [onBroadcastDocMeta, onlineUsersCount, projectId]
  )

  const scheduleLoadDocMetaFromServer = useCallback(
    (docId: string) => {
      if (permissionsLevel === 'readOnly') {
        // The POST request is blocked for users without write permission.
        // The user will not be able to consume the metadata for edits anyway.
        return
      }
      // Debounce loading labels with a timeout
      const existingTimeout = debouncerRef.current.get(docId)

      if (existingTimeout != null) {
        window.clearTimeout(existingTimeout)
        debouncerRef.current.delete(docId)
      }

      debouncerRef.current.set(
        docId,
        window.setTimeout(() => {
          // TODO: wait for the document to be saved?
          loadDocMetaFromServer(docId)
          debouncerRef.current.delete(docId)
        }, 2000)
      )
    },
    [loadDocMetaFromServer, permissionsLevel]
  )

  const handleBroadcastDocMeta = useCallback(
    (data: DocMetadataResponse) => {
      onBroadcastDocMeta(data)
    },
    [onBroadcastDocMeta]
  )

  useSocketListener(socket, 'broadcastDocMeta', handleBroadcastDocMeta)

  const handleMetadataOutdated = useCallback(() => {
    if (currentDocument) {
      scheduleLoadDocMetaFromServer(currentDocument.doc_id)
    }
  }, [currentDocument, scheduleLoadDocMetaFromServer])

  useEventListener('editor:metadata-outdated', handleMetadataOutdated)

  // Trigger 1: Refresh metadata when switching to a different document
  const previousDocIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (currentDocument?.doc_id && previousDocIdRef.current !== currentDocument.doc_id) {
      if (previousDocIdRef.current !== null) {
        // This is a document switch (not initial load)
        loadProjectMetaFromServer()
      }
      previousDocIdRef.current = currentDocument.doc_id
    }
  }, [currentDocument, loadProjectMetaFromServer])

  // Trigger 2: Refresh metadata after compilation completes
  useCompilationUpdates(
    useCallback(
      update => {
        if (update.type === 'compilation-complete' && update.status === 'success') {
          loadProjectMetaFromServer()
        }
      },
      [loadProjectMetaFromServer]
    )
  )

  // Trigger 3: Refresh metadata after 1 minute of inactivity when there are changes
  useEffect(() => {
    const handleDocChanged = () => {
      setHasProjectChanges(true)

      // Clear existing inactivity timer
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current)
      }

      // Start new 1-minute inactivity timer
      inactivityTimerRef.current = window.setTimeout(() => {
        if (hasProjectChanges) {
          loadProjectMetaFromServer()
          setHasProjectChanges(false)
        }
        inactivityTimerRef.current = null
      }, 60000) // 1 minute
    }

    window.addEventListener('doc:changed', handleDocChanged)

    return () => {
      window.removeEventListener('doc:changed', handleDocChanged)
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current)
      }
    }
  }, [loadProjectMetaFromServer, hasProjectChanges])

  const permissionsRef = useRef(permissions)

  useEffect(() => {
    permissionsRef.current = permissions
  }, [permissions])

  useEffect(() => {
    const handleProjectJoined = ({
      detail: [{ project }],
    }: CustomEvent<IdeEvents['project:joined']>) => {
      if (project.deletedByExternalDataSource) {
        showGenericMessageModal(
          t('project_renamed_or_deleted'),
          t('project_renamed_or_deleted_detail')
        )
      }
      window.setTimeout(() => {
        if (
          permissionsRef.current.write ||
          permissionsRef.current.trackedWrite
        ) {
          loadProjectMetaFromServer()
        }
      }, 200)
    }

    eventEmitter.once('project:joined', handleProjectJoined)

    return () => {
      eventEmitter.off('project:joined', handleProjectJoined)
    }
  }, [eventEmitter, loadProjectMetaFromServer, showGenericMessageModal, t])

  const value = useMemo(() => {
    const docs = Object.values(documents)

    return {
      commands: docs.flatMap(doc => Object.values(doc.packages).flat()),
      labels: new Set(docs.flatMap(doc => doc.labels)),
      packageNames: new Set(docs.flatMap(doc => doc.packageNames)),
      bibitems: new Set(docs.flatMap(doc => doc.bibitems || [])),
      macros: new Set(docs.flatMap(doc => doc.macros || [])),
      environments: new Set(docs.flatMap(doc => doc.environments || [])),
    }
  }, [documents])

  return (
    <MetadataContext.Provider value={value}>
      {children}
    </MetadataContext.Provider>
  )
}

export function useMetadataContext() {
  const context = useContext(MetadataContext)

  if (!context) {
    throw new Error(
      'useMetadataContext is only available inside MetadataProvider'
    )
  }

  return context
}
