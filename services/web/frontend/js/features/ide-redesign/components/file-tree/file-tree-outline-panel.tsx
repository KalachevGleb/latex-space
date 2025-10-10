import { Panel, PanelGroup } from 'react-resizable-panels'
import { FileTree } from '@/features/ide-react/components/file-tree'
import { OutlineContainer } from '@/features/outline/components/outline-container'
import { VerticalResizeHandle } from '@/features/ide-react/components/resize/vertical-resize-handle'
import { useOutlinePane } from '@/features/ide-react/hooks/use-outline-pane'
import useCollapsibleFileTree from '../../hooks/use-collapsible-file-tree'
import classNames from 'classnames'
import SymbolPalettePane from '@/features/ide-react/components/editor/symbol-palette-pane'
import { useEditorPropertiesContext } from '@/features/ide-react/context/editor-properties-context'

function FileTreeOutlinePanel() {
  const { canShowOutline, outlinePanelRef, expandOutline, collapseOutline } =
    useOutlinePane()
  const {
    fileTreeExpanded,
    fileTreePanelRef,
    expandFileTree,
    collapseFileTree,
  } = useCollapsibleFileTree()
  const { showSymbolPalette, symbolPalettePlacement } =
    useEditorPropertiesContext()

  return (
    <PanelGroup
      className="file-tree-outline-panel-group"
      autoSaveId="ide-redesign-file-tree-outline"
      direction="vertical"
    >
      <Panel
        className={classNames('file-tree-panel', {
          'file-tree-panel-collapsed': !fileTreeExpanded,
        })}
        defaultSize={50}
        id="ide-redesign-file-tree"
        order={1}
        collapsible
        ref={fileTreePanelRef}
        onExpand={expandFileTree}
        onCollapse={collapseFileTree}
        minSize={10}
      >
        <FileTree />
      </Panel>
      <VerticalResizeHandle
        hitAreaMargins={{ coarse: 0, fine: 0 }}
        disabled={!canShowOutline}
      />
      <Panel
        className="file-outline-panel"
        defaultSize={50}
        id="ide-redesign-file-outline"
        order={2}
        collapsible
        ref={outlinePanelRef}
        onExpand={expandOutline}
        onCollapse={collapseOutline}
        minSize={10}
      >
        <OutlineContainer />
      </Panel>

      {showSymbolPalette && symbolPalettePlacement === 'sidebar' && (
        <>
          <VerticalResizeHandle hitAreaMargins={{ coarse: 0, fine: 0 }} />
          <Panel
            className="file-symbol-palette-panel"
            defaultSize={25}
            id="ide-redesign-file-symbol-palette"
            order={3}
            collapsible
            minSize={10}
          >
            <SymbolPalettePane />
          </Panel>
        </>
      )}
    </PanelGroup>
  )
}

export default FileTreeOutlinePanel
