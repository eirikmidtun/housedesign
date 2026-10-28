import { useEffect } from 'react'
import { FloorPlanEditor } from './components/FloorPlanEditor'
import { Sidebar } from './components/Sidebar'
import { useStore } from './store'

export default function App() {
  useKeyboardShortcuts()
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
            <p>Let's get the floor plan right first</p>
          </div>
        </div>
        <nav className="view-tabs" aria-label="View">
          <button className="active">Floor plan</button>
          <button disabled title="Coming once the floor plan is right">3D room</button>
        </nav>
      </header>
      <main className="workspace">
        <FloorPlanEditor />
        <Sidebar />
      </main>
    </div>
  )
}

function useKeyboardShortcuts() {
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
      } else if (!mod) {
        const tool = ({ v: 'select', r: 'room', d: 'door', w: 'window' } as const)[e.key.toLowerCase() as 'v']
        if (tool) s.setTool(tool)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
