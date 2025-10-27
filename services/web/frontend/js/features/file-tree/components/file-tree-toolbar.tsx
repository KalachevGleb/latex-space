import { useTranslation } from 'react-i18next'
import * as eventTracking from '../../../infrastructure/event-tracking'
import { useFileTreeActionable } from '../contexts/file-tree-actionable'
import { useFileTreeData } from '@/shared/context/file-tree-data-context'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import MaterialIcon from '@/shared/components/material-icon'
import OLButtonToolbar from '@/shared/components/ol/ol-button-toolbar'
import importOverleafModules from '../../../../macros/import-overleaf-module.macro'
import React, { ElementType } from 'react'
import { useProjectContext } from '@/shared/context/project-context'
import usePersistedState from '@/shared/hooks/use-persisted-state'

const fileTreeToolbarComponents = importOverleafModules(
  'fileTreeToolbarComponents'
) as { import: { default: ElementType }; path: string }[]

function FileTreeToolbar() {
  const { fileTreeReadOnly } = useFileTreeData()
  const { t } = useTranslation()

  if (fileTreeReadOnly) return null

  return (
    <OLButtonToolbar
      className="toolbar toolbar-filetree"
      aria-label={t('project_files')}
    >
      <FileTreeToolbarLeft />
      <FileTreeToolbarRight />
    </OLButtonToolbar>
  )
}

function FileTreeToolbarLeft() {
  const { t } = useTranslation()
  const {
    canCreate,
    startCreatingFolder,
    startCreatingDocOrFile,
    startUploadingDocOrFile,
  } = useFileTreeActionable()

  const createWithAnalytics = () => {
    eventTracking.sendMB('new-file-click', { location: 'toolbar' })
    startCreatingDocOrFile()
  }

  const uploadWithAnalytics = () => {
    eventTracking.sendMB('upload-click', { location: 'toolbar' })
    startUploadingDocOrFile()
  }

  if (!canCreate) return null

  return (
    <div className="toolbar-left">
      <OLTooltip
        id="new-file"
        description={t('new_file')}
        overlayProps={{ placement: 'bottom' }}
      >
        <button className="btn" onClick={createWithAnalytics}>
          <MaterialIcon type="description" accessibilityLabel={t('new_file')} />
        </button>
      </OLTooltip>
      <OLTooltip
        id="new-folder"
        description={t('new_folder')}
        overlayProps={{ placement: 'bottom' }}
      >
        <button className="btn" onClick={startCreatingFolder} tabIndex={-1}>
          <MaterialIcon type="folder" accessibilityLabel={t('new_folder')} />
        </button>
      </OLTooltip>
      <OLTooltip
        id="upload"
        description={t('upload')}
        overlayProps={{ placement: 'bottom' }}
      >
        <button className="btn" onClick={uploadWithAnalytics} tabIndex={-1}>
          <MaterialIcon type="upload" accessibilityLabel={t('upload')} />
        </button>
      </OLTooltip>
    </div>
  )
}

function FileTreeToolbarRight() {
  const { t } = useTranslation()
  const { canRename, canDelete, startRenaming, startDeleting } =
    useFileTreeActionable()
  const { project } = useProjectContext()
  const [hideProtectedFiles, setHideProtectedFiles] = usePersistedState(
    'hide-protected-files',
    false
  )

  // Show toggle button only if there are protected files
  const hasProtectedFiles =
    project?.protectedFiles && project.protectedFiles.length > 0

  return (
    <div className="toolbar-right">
      {fileTreeToolbarComponents.map(
        ({ import: { default: Component }, path }) => (
          <Component key={path} />
        )
      )}

      {hasProtectedFiles ? (
        <OLTooltip
          id="toggle-protected-files"
          description={
            hideProtectedFiles
              ? t('show_protected_files')
              : t('hide_protected_files')
          }
          overlayProps={{ placement: 'bottom' }}
        >
          <button
            className="btn"
            onClick={() => {
              setHideProtectedFiles(!hideProtectedFiles)
              // Dispatch custom event to notify other components
              window.dispatchEvent(new Event('hide-protected-files-changed'))
            }}
            tabIndex={-1}
          >
            <MaterialIcon
              type={hideProtectedFiles ? 'visibility_off' : 'visibility'}
              accessibilityLabel={
                hideProtectedFiles
                  ? t('show_protected_files')
                  : t('hide_protected_files')
              }
            />
          </button>
        </OLTooltip>
      ) : null}

      {canRename ? (
        <OLTooltip
          id="rename"
          description={t('rename')}
          overlayProps={{ placement: 'bottom' }}
        >
          <button className="btn" onClick={startRenaming} tabIndex={-1}>
            <MaterialIcon type="edit" accessibilityLabel={t('rename')} />
          </button>
        </OLTooltip>
      ) : null}

      {canDelete ? (
        <OLTooltip
          id="delete"
          description={t('delete')}
          overlayProps={{ placement: 'bottom' }}
        >
          <button className="btn" onClick={startDeleting} tabIndex={-1}>
            <MaterialIcon type="delete" accessibilityLabel={t('delete')} />
          </button>
        </OLTooltip>
      ) : null}
    </div>
  )
}

export default FileTreeToolbar
