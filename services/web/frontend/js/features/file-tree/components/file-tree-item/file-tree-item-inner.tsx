import { ReactNode, useEffect, useRef, useMemo } from 'react'
import classNames from 'classnames'
import scrollIntoViewIfNeeded from 'scroll-into-view-if-needed'

import { useFileTreeData } from '@/shared/context/file-tree-data-context'
import { useFileTreeMainContext } from '../../contexts/file-tree-main'
import { useDraggable } from '../../contexts/file-tree-draggable'

import FileTreeItemName from './file-tree-item-name'
import FileTreeItemMenu from './file-tree-item-menu'
import { useFileTreeSelectable } from '../../contexts/file-tree-selectable'
import { useFileTreeActionable } from '../../contexts/file-tree-actionable'
import { useDragDropManager } from 'react-dnd'
import { useIsNewEditorEnabled } from '@/features/ide-redesign/utils/new-editor-utils'
import { useProjectContext } from '@/shared/context/project-context'
import { pathInFolder } from '../../util/path'
import MaterialIcon from '@/shared/components/material-icon'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import { useTranslation } from 'react-i18next'

function FileTreeItemInner({
  id,
  name,
  type,
  isSelected,
  icons,
  onClick,
}: {
  id: string
  name: string
  type: string
  isSelected: boolean
  icons?: ReactNode
  onClick?: () => void
}) {
  const { fileTreeReadOnly, fileTreeData } = useFileTreeData()
  const { setContextMenuCoords } = useFileTreeMainContext()
  const { isRenaming } = useFileTreeActionable()
  const { project } = useProjectContext()
  const { t } = useTranslation()

  const { selectedEntityIds } = useFileTreeSelectable()

  // Check if this entity is protected
  const isProtected = useMemo(() => {
    if (!project?.protectedFiles || !fileTreeData) {
      return false
    }
    const protectedFiles = project.protectedFiles
    if (protectedFiles.length === 0) {
      return false
    }
    const path = pathInFolder(fileTreeData, id)
    return path ? protectedFiles.includes(`/${path}`) : false
  }, [id, project, fileTreeData])

  const hasMenu =
    !fileTreeReadOnly && isSelected && selectedEntityIds.size === 1 && !isProtected

  const { dragRef, setIsDraggable } = useDraggable(id)

  const dragDropItem = useDragDropManager().getMonitor().getItem()

  const itemRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const item = itemRef.current
    if (isSelected && item) {
      // we're delaying scrolling due to a race condition with other elements,
      // mainly the Outline, being resized inside the same panel, causing the
      // FileTree to have its viewport shrinked after the selected item is
      // scrolled into the view, hiding it again.
      // See `left-pane-resize-all` in `file-tree-controller` for more information.
      setTimeout(() => {
        if (item) {
          scrollIntoViewIfNeeded(item, {
            scrollMode: 'if-needed',
          })
        }
      }, 100)
    }
  }, [isSelected, itemRef])

  function handleContextMenu(ev: React.MouseEvent<HTMLDivElement>) {
    ev.preventDefault()

    setContextMenuCoords({
      top: ev.pageY,
      left: ev.pageX,
    })
  }

  return (
    <div
      className={classNames('entity', {
        'file-tree-entity-dragging': dragDropItem?.draggedEntityIds?.has(id),
      })}
      role="presentation"
      ref={dragRef}
      draggable={!isRenaming}
      onContextMenu={handleContextMenu}
      data-file-id={id}
      data-file-type={type}
    >
      <div
        className="entity-name entity-name-react"
        role="presentation"
        ref={itemRef}
      >
        <FileTreeItemIconsAndName
          name={name}
          isSelected={isSelected}
          icons={icons}
          onClick={onClick}
          setIsDraggable={setIsDraggable}
        />
        {hasMenu ? <FileTreeItemMenu id={id} name={name} /> : null}
        {isProtected && isSelected ? (
          <OLTooltip
            id={`protected-file-${id}`}
            description={t('protected_file')}
            overlayProps={{ placement: 'bottom' }}
          >
            <div className="file-tree-item-protected-icon">
              <MaterialIcon
                type="lock"
                className="file-tree-item-lock-icon"
                accessibilityLabel={t('protected_file')}
              />
            </div>
          </OLTooltip>
        ) : null}
      </div>
    </div>
  )
}

const FileTreeItemIconsAndName = ({
  name,
  isSelected,
  icons,
  onClick,
  setIsDraggable,
}: {
  name: string
  isSelected: boolean
  icons?: ReactNode
  onClick?: () => void
  setIsDraggable: (isDraggable: boolean) => void
}) => {
  const newEditor = useIsNewEditorEnabled()

  if (newEditor) {
    return onClick ? (
      <button className="file-tree-entity-button" onClick={onClick}>
        {icons}
        <FileTreeItemName
          name={name}
          isSelected={isSelected}
          setIsDraggable={setIsDraggable}
        />
      </button>
    ) : (
      <div className="file-tree-entity-details">
        {icons}
        <FileTreeItemName
          name={name}
          isSelected={isSelected}
          setIsDraggable={setIsDraggable}
        />
      </div>
    )
  }

  return (
    <>
      {icons}
      <FileTreeItemName
        name={name}
        isSelected={isSelected}
        setIsDraggable={setIsDraggable}
      />
    </>
  )
}

export default FileTreeItemInner
