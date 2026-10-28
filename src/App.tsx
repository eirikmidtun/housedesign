import { useEffect, useRef, useState } from 'react'
import { FloorPlanEditor } from './components/FloorPlanEditor'
import { Scene3D } from './components/Scene3D'
import { Sidebar, ViewSidebar } from './components/Sidebar'
import { useStore } from './store'

type View = 'plan' | '3d'

export default function App() {
  const [view, setView] = useState<View>('plan')
  // On phones the canvas fills the screen and the panels live in a sheet you open on demand.
  const [menuOpen, setMenuOpen] = useState(false)
  const hasSelection = useStore((s) => s.selection !== null)
  const furnitureCount = useStore((s) => s.plan.furniture?.length ?? 0)
  // Close the sheet after placing furniture so the new item is visible.
  const lastCount = useRef(furnitureCount)
  useEffect(() => {
    if (furnitureCount > lastCount.current) setMenuOpen(false)
    lastCount.current = furnitureCount
  }, [furnitureCount])
  useKeyboardShortcuts(view === 'plan')
  // Plan drawing tools only make sense on the floor plan.
  useEffect(() => {
    if (view === '3d') useStore.getState().setTool('select')
  }, [view])
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 32 32" width="28" height="28">
              <rect width="32" height="32" rx="9" fill="var(--accent)" />
              <path d="M7 16 16 8l9 8v9H7z" fill="var(--paper)" />
              <rect x="14" y="19" width="4" height="6" rx="1" fill="var(--accent)" />
            </svg>
          </span>
          <div>
            <h1>Husdesign</h1>
            <p>{view === 'plan' ? 'Draw your home, room by room' : 'Look around your home'}</p>
          </div>
        </div>
        <nav className="view-tabs" aria-label="View">
          <button className={view === 'plan' ? 'active' : ''} onClick={() => setView('plan')}>
            Floor plan
          </button>
          <button className={view === '3d' ? 'active' : ''} onClick={() => setView('3d')}>
            3D view
          </button>
        </nav>
      </header>
      <main className="workspace">
        {view === 'plan' ? <FloorPlanEditor /> : <Scene3D />}
        <div className={`sheet ${menuOpen ? 'open' : ''}`}>
          <div className="sheet-header">
            <span className="sheet-title">{view === 'plan' ? 'Floor plan' : 'Furniture & view'}</span>
            <button onClick={() => setMenuOpen(false)} aria-label="Close menu">
              Done
            </button>
          </div>
          {view === 'plan' ? (
            <Sidebar />
          ) : (
            <ViewSidebar
              onEditPlan={() => {
                setView('plan')
                setMenuOpen(false)
              }}
            />
          )}
        </div>
        {!menuOpen && (
          <button className="menu-fab" onClick={() => setMenuOpen(true)}>
            {hasSelection ? 'Edit selected' : view === 'plan' ? 'Tools & rooms' : '+ Add furniture'}
          </button>
        )}
      </main>
    </div>
  )
}

function useKeyboardShortcuts(planTools: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        s.deleteSelected()
      } else if (!mod && planTools) {
        const tool = ({ v: 'select', r: 'room', d: 'door', w: 'window' } as const)[e.key.toLowerCase() as 'v']
        if (tool) s.setTool(tool)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [planTools])
}
