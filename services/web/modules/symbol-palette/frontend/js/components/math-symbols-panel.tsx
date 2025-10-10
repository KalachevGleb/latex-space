import { useState } from 'react'
import { SYMBOL_GROUPS } from '../symbols-config'

function dispatchInsert(command: string) {
  window.dispatchEvent(
    new CustomEvent('editor:insert-symbol', { detail: { command } })
  )
}

export default function MathSymbolsPanel() {
  console.log('MathSymbolsPanel loaded with', SYMBOL_GROUPS.length, 'groups')

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const group of SYMBOL_GROUPS) initial[group.id] = true
    return initial
  })

  return (
    <div className="ol-symbols-panel">
      {SYMBOL_GROUPS.map(group => (
        <div key={group.id} className="ol-symbols-group">
          <button
            type="button"
            className="ol-symbols-group-header"
            onClick={() =>
              setCollapsed(prev => ({ ...prev, [group.id]: !prev[group.id] }))
            }
            aria-expanded={!collapsed[group.id]}
          >
            <span className="ol-symbols-group-title">{group.title}</span>
            <span className="ol-symbols-group-toggle">
              {collapsed[group.id] ? '▸' : '▾'}
            </span>
          </button>
          {!collapsed[group.id] && (
            <div className="ol-symbols-grid">
              {group.symbols.map(sym => (
                <button
                  key={sym.id}
                  type="button"
                  className="ol-symbols-item"
                  title={sym.command}
                  onClick={() => dispatchInsert(sym.command)}
                >
                  {sym.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}


