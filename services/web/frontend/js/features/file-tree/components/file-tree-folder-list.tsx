import classNames from 'classnames'

import FileTreeDoc from './file-tree-doc'
import FileTreeFolder from './file-tree-folder'
import { fileCollator } from '../util/file-collator'
import { Folder } from '../../../../../types/folder'
import { Doc } from '../../../../../types/doc'
import { FileRef } from '../../../../../types/file-ref'
import { ConnectDropTarget } from 'react-dnd'
import { useProjectContext } from '@/shared/context/project-context'
import { useFileTreeData } from '@/shared/context/file-tree-data-context'
import { pathInFolder } from '../util/path'
import { useMemo, useState, useEffect } from 'react'

type ExtendedFileRef = FileRef & { isFile: true }

function FileTreeFolderList({
  folders,
  docs,
  files,
  classes = {},
  dropRef = null,
  children,
  dataTestId,
}: {
  folders: Folder[]
  docs: Doc[]
  files: FileRef[]
  classes?: { root?: string }
  dropRef?: ConnectDropTarget | null
  children?: React.ReactNode
  dataTestId?: string
}) {
  const { project } = useProjectContext()
  const { fileTreeData } = useFileTreeData()

  // Check localStorage for hideProtectedFiles setting with state
  const [hideProtectedFiles, setHideProtectedFiles] = useState(() => {
    try {
      const stored = localStorage.getItem('hide-protected-files')
      return stored === 'true'
    } catch {
      return false
    }
  })

  // Listen for storage changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'hide-protected-files') {
        setHideProtectedFiles(e.newValue === 'true')
      }
    }
    // Also listen for custom events in same window
    const handleCustomChange = () => {
      try {
        const stored = localStorage.getItem('hide-protected-files')
        setHideProtectedFiles(stored === 'true')
      } catch {
        setHideProtectedFiles(false)
      }
    }
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('hide-protected-files-changed', handleCustomChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('hide-protected-files-changed', handleCustomChange)
    }
  }, [])

  // Helper function to check if entity is protected
  const isEntityProtected = useMemo(() => {
    const protectedFiles = project?.protectedFiles || []
    if (protectedFiles.length === 0) {
      return () => false
    }
    return (entityId: string) => {
      const path = pathInFolder(fileTreeData, entityId)
      return path ? protectedFiles.includes(path) : false
    }
  }, [project, fileTreeData])

  files = files.map(file => ({ ...file, isFile: true }))
  let docsAndFiles: (Doc | ExtendedFileRef)[] = [...docs, ...files]

  // Filter out protected files if hideProtectedFiles is enabled
  if (hideProtectedFiles) {
    docsAndFiles = docsAndFiles.filter(doc => !isEntityProtected(doc._id))
  }

  return (
    <ul
      className={classNames(
        'list-unstyled',
        'file-tree-folder-list',
        classes.root
      )}
      role="tree"
      ref={dropRef}
      data-testid={dataTestId}
    >
      <div className="file-tree-folder-list-inner">
        {folders.sort(compareFunction).map(folder => {
          return (
            <FileTreeFolder
              key={folder._id}
              name={folder.name}
              id={folder._id}
              folders={folder.folders}
              docs={folder.docs}
              files={folder.fileRefs}
            />
          )
        })}
        {docsAndFiles.sort(compareFunction).map(doc => {
          if ('isFile' in doc) {
            return (
              <FileTreeDoc
                key={doc._id}
                name={doc.name}
                id={doc._id}
                isFile={doc.isFile}
                isLinkedFile={
                  doc.linkedFileData && !!doc.linkedFileData.provider
                }
              />
            )
          }

          return <FileTreeDoc key={doc._id} name={doc.name} id={doc._id} />
        })}
        {children}
      </div>
    </ul>
  )
}

function compareFunction(one: { name: string }, two: { name: string }) {
  return fileCollator.compare(one.name, two.name)
}

export default FileTreeFolderList
