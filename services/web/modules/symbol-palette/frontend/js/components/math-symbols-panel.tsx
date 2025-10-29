import { useState } from 'react'
import { SYMBOL_GROUPS } from '../symbols-config'

function dispatchInsert(command: string) {
  window.dispatchEvent(
    new CustomEvent('editor:insert-symbol', { detail: { command } })
  )
}

export default function MathSymbolsPanel() {
  console.log('MathSymbolsPanel loaded with', SYMBOL_GROUPS.length, 'groups')

  const [activeTab, setActiveTab] = useState(SYMBOL_GROUPS[0]?.id || '')

  return (
    <div className="symbol-palette-container">
      <div className="symbol-palette">
        <div className="symbol-palette-header-outer">
          <div className="symbol-palette-header">
            <div
              className="symbol-palette-tab-list"
              role="tablist"
              aria-label="Symbol Categories"
            >
              {SYMBOL_GROUPS.map(group => (
                <button
                  key={group.id}
                  role="tab"
                  type="button"
                  className="symbol-palette-tab"
                  id={`symbol-palette-tab-${group.id}`}
                  aria-controls={`symbol-palette-panel-${group.id}`}
                  aria-selected={activeTab === group.id}
                  tabIndex={activeTab === group.id ? 0 : -1}
                  onClick={() => setActiveTab(group.id)}
                >
                  {group.title}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="symbol-palette-body">
          <div className="symbol-palette-panels">
            {SYMBOL_GROUPS.map(group => (
              <div
                key={group.id}
                role="tabpanel"
                className="symbol-palette-panel"
                aria-labelledby={`symbol-palette-tab-${group.id}`}
                tabIndex={0}
                hidden={activeTab !== group.id}
              >
                <div className="symbol-palette-items" role="listbox" aria-label="Symbols">
                  {group.symbols.map(sym => (
                    <button
                      key={sym.id}
                      className="symbol-palette-item"
                      tabIndex={0}
                      role="option"
                      aria-label={sym.command}
                      onClick={() => dispatchInsert(sym.command)}
                    >
                      {sym.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}


