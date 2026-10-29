import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Tool } from '../store'
import { rotateDrawing, showPdfPage, uploadDrawing, useDrawing } from '../drawing'
import type { Plan, Room } from '../types'
import { dist, edgePoints, polygonArea } from '../geometry'
import { LengthInput, Section } from './ui'
import { WINDOW_SILL, WINDOW_TOP } from '../walls'
import { FurniturePanel, SelectedFurniturePanel } from './FurniturePanel'
import { OutdoorPanel, SelectedAreaPanel } from './OutdoorPanel'

const SWATCHES = ['#F3D9B1', '#DCE3C4', '#EBD3C6', '#CFE0DC', '#E8D5E4', '#F1E3B5', '#D9D4EA', '#E6DED3']

const TOOLS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: 'select', label: 'Select', icon: '↖', key: 'V' },
  { id: 'room', label: 'Room', icon: '▭', key: 'R' },
  { id: 'door', label: 'Door', icon: '◜', key: 'D' },
  { id: 'window', label: 'Window', icon: '▤', key: 'W' },
]

export function Sidebar() {
  const plan = useStore((s) => s.plan)
  const selection = useStore((s) => s.selection)
  const tool = useStore((s) => s.tool)
  const { setTool, select } = useStore.getState()

  const room = selection?.type === 'room' ? plan.rooms.find((r) => r.id === selection.id) : undefined
  const opening = selection?.type === 'opening' ? plan.openings.find((o) => o.id === selection.id) : undefined
  const totalArea = plan.rooms.reduce((s, r) => s + polygonArea(r.points), 0)

  return (
    <aside className="sidebar">
      <Section title="Tools">
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`tool-btn ${tool === t.id ? 'active' : ''}`}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.key})`}
            >
              <span className="tool-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </Section>

      {!plan.rooms.length && <BackgroundPanel />}
      {room && <RoomPanel room={room} plan={plan} />}
      {opening && <OpeningPanel id={opening.id} />}
      {selection?.type === 'furniture' && <SelectedFurniturePanel id={selection.id} />}
      {selection?.type === 'area' && <SelectedAreaPanel id={selection.id} />}

      <OutdoorPanel />

      <FloorsPanel />

      <Section title={`Rooms on ${plan.name} · ${totalArea.toFixed(1).replace('.', ',')} m²`}>
        {!plan.rooms.length && <p className="help">No rooms yet. Use the Room tool to draw one.</p>}
        <ul className="room-list">
          {plan.rooms.map((r) => (
            <li key={r.id}>
              <button
                className={`room-row ${room?.id === r.id ? 'active' : ''}`}
                onClick={() => {
                  setTool('select')
                  select({ type: 'room', id: r.id })
                }}
              >
                <span className="swatch" style={{ background: r.color }} />
                <span className="room-row-name">{r.name}</span>
                <span className="room-row-area">{polygonArea(r.points).toFixed(1).replace('.', ',')} m²</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {plan.rooms.length > 0 && <BackgroundPanel />}
      <PlanPanel />
    </aside>
  )
}


function RoomPanel({ room, plan }: { room: Room; plan: Plan }) {
  const { updateRoom, deleteSelected, commit } = useStore.getState()

  const setEdgeLength = (edge: number, length: number) => {
    if (!(length > 0)) return
    commit((p) => stretchEdge(p, room.id, edge, length))
  }

  return (
    <Section title="Selected room">
      <label className="field">
        <span>Name</span>
        <input value={room.name} onChange={(e) => updateRoom(room.id, { name: e.target.value })} />
      </label>
      <div className="field">
        <span>Floor colour</span>
        <div className="swatches">
          {SWATCHES.map((c) => (
            <button
              key={c}
              className={`swatch-btn ${room.color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => updateRoom(room.id, { color: c })}
              aria-label={`Colour ${c}`}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <span>Walls · {polygonArea(room.points).toFixed(2).replace('.', ',')} m²</span>
        <div className="wall-list">
          {room.points.map((_, i) => {
            const [a, b] = edgePoints(room, i)
            return (
              <LengthInput key={`${room.id}-${i}`} label={`${i + 1}`} value={dist(a, b)} onCommit={(v) => setEdgeLength(i, v)} />
            )
          })}
        </div>
        <p className="help">
          Type a length to stretch that wall. Corners lined up with its end move with it, and so do the
          touching corners of neighbouring rooms.
        </p>
      </div>
      <div className="row">
        <span className="muted">{plan.openings.filter((o) => o.roomId === room.id).length} doors/windows</span>
        <button className="danger" onClick={deleteSelected}>
          Delete room
        </button>
      </div>
    </Section>
  )
}

/**
 * Changes the length of one wall by moving its end corner along the wall. Every corner of
 * the room that lies on the same "line" as that end (same position along the wall) moves too,
 * so rectangles stay rectangles, and corners of other rooms touching a moved corner follow.
 */
function stretchEdge(plan: Plan, roomId: string, edge: number, length: number): Plan {
  const room = plan.rooms.find((r) => r.id === roomId)
  if (!room) return plan
  const [a, b] = edgePoints(room, edge)
  const old = dist(a, b)
  if (old === 0) return plan
  const dir = { x: (b.x - a.x) / old, y: (b.y - a.y) / old }
  const delta = length - old
  const along = (p: { x: number; y: number }) => (p.x - a.x) * dir.x + (p.y - a.y) * dir.y
  const moved = room.points.filter((p) => Math.abs(along(p) - old) < 0.01)
  const shouldMove = (p: { x: number; y: number }) => moved.some((m) => dist(m, p) < 0.015)
  const shift = (p: { x: number; y: number }) => ({ x: p.x + dir.x * delta, y: p.y + dir.y * delta })
  return {
    ...plan,
    rooms: plan.rooms.map((r) => ({ ...r, points: r.points.map((p) => (shouldMove(p) ? shift(p) : p)) })),
  }
}


function OpeningPanel({ id }: { id: string }) {
  const opening = useStore((s) => s.plan.openings.find((o) => o.id === id))
  const { updateOpening, deleteSelected } = useStore.getState()
  if (!opening) return null
  return (
    <Section title={opening.kind === 'door' ? 'Selected door' : 'Selected window'}>
      <div className="field">
        <span>Width</span>
        <LengthInput label="↔" value={opening.width} onCommit={(width) => updateOpening(id, { width })} />
      </div>
      {opening.kind === 'window' && (
        <div className="field">
          <span>Sill height</span>
          <LengthInput label="↕" value={opening.sill ?? WINDOW_SILL} onCommit={(sill) => updateOpening(id, { sill: Math.min(sill, WINDOW_TOP - 0.2) })} />
        </div>
      )}
      <p className="help">Drag it along the wall to move it.</p>
      <div className="row">
        {opening.kind === 'door' ? (
          <button onClick={() => updateOpening(id, { flip: !opening.flip })}>Swap swing side</button>
        ) : (
          <span />
        )}
        <button className="danger" onClick={deleteSelected}>
          Delete
        </button>
      </div>
    </Section>
  )
}

function FloorsPanel() {
  const levels = useStore((s) => s.home.levels)
  const levelId = useStore((s) => s.levelId)
  const plan = useStore((s) => s.plan)
  const { setLevel, addLevel, renameLevel, moveLevel, deleteLevel, copyRoomsFrom, commit, addStairs } = useStore.getState()
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => setConfirmDelete(false), [levelId])
  const index = levels.findIndex((l) => l.id === levelId)
  // An empty floor can start from the walls of the floor below (or above).
  const source = !plan.rooms.length ? [levels[index - 1], levels[index + 1]].find((l) => l?.rooms.length) : undefined

  return (
    <Section title="Floors">
      <ul className="level-list">
        {[...levels].reverse().map((l) => (
          <li key={l.id}>
            <button className={`room-row ${l.id === levelId ? 'active' : ''}`} onClick={() => setLevel(l.id)}>
              <span className="room-row-name">{l.name}</span>
              <span className="room-row-area">
                {l.rooms.length} {l.rooms.length === 1 ? 'room' : 'rooms'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button onClick={() => addLevel(false)}>+ Floor above</button>
        <button onClick={() => addLevel(true)}>+ Basement</button>
      </div>
      <button className="copy-plan" onClick={addStairs} title="Add stairs from this floor up to the next">
        + Stairs up from {plan.name}
      </button>
      <div className="level-edit">
        <label className="field">
          <span>Name of this floor</span>
          <input key={levelId} defaultValue={plan.name} onBlur={(e) => {
            const name = e.target.value.trim()
            if (name && name !== plan.name) renameLevel(levelId, name)
            else e.target.value = plan.name
          }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </label>
        <div className="field">
          <span>Ceiling height</span>
          <LengthInput label="↕" value={plan.wallHeight} onCommit={(v) => commit((p) => ({ ...p, wallHeight: Math.min(5, Math.max(2, v)) }))} />
        </div>
        {source && (
          <button className="copy-plan" onClick={() => copyRoomsFrom(source.id)}>
            Copy walls from {source.name}
          </button>
        )}
        <div className="row">
          <button onClick={() => moveLevel(levelId, 1)} disabled={index === levels.length - 1} title="Move this floor up">
            ↑ Up
          </button>
          <button onClick={() => moveLevel(levelId, -1)} disabled={index === 0} title="Move this floor down">
            ↓ Down
          </button>
          <button
            className="danger"
            disabled={levels.length < 2}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true)
              setConfirmDelete(false)
              deleteLevel(levelId)
            }}
            onBlur={() => setConfirmDelete(false)}
            title="Delete this floor. You can undo this."
          >
            {confirmDelete ? 'Sure? Delete' : 'Delete'}
          </button>
        </div>
      </div>
    </Section>
  )
}

/** Hidden file input for floor plan drawings, and a function that opens it. */
export function useDrawingPicker() {
  const ref = useRef<HTMLInputElement>(null)
  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/*,application/pdf,.pdf"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) uploadDrawing(f)
      }}
    />
  )
  return { input, open: () => ref.current?.click() }
}

function BackgroundPanel() {
  const background = useStore((s) => s.plan.background)
  const levelId = useStore((s) => s.levelId)
  const tool = useStore((s) => s.tool)
  const saveFailed = useStore((s) => s.saveFailed)
  const { busy, error, pdf } = useDrawing()
  const { setBackground, setTool, preview, checkpoint } = useStore.getState()
  const picker = useDrawingPicker()
  const opacityStart = useRef<Plan | null>(null)
  const pages = pdf?.levelId === levelId && background ? pdf : null

  return (
    <Section title="Floor plan drawing">
      {picker.input}
      {!background ? (
        <>
          <p className="help">
            Upload a floor plan (plantegning) as a photo, image or PDF. It goes behind this floor so you can trace the rooms on top.
          </p>
          <button className="primary upload-btn" onClick={picker.open} disabled={busy}>
            {busy ? 'Reading the file…' : 'Upload floor plan…'}
          </button>
        </>
      ) : (
        <>
          {pages && pages.pages > 1 && (
            <div className="row page-picker">
              <button onClick={() => showPdfPage(pages.page - 1)} disabled={busy || pages.page <= 1} aria-label="Previous page">
                ‹
              </button>
              <span className="muted">
                Page {pages.page} of {pages.pages}
              </span>
              <button onClick={() => showPdfPage(pages.page + 1)} disabled={busy || pages.page >= pages.pages} aria-label="Next page">
                ›
              </button>
            </div>
          )}
          <label className="field">
            <span>Opacity</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={background.opacity}
              onPointerDown={() => (opacityStart.current = useStore.getState().plan)}
              onPointerUp={() => opacityStart.current && checkpoint(opacityStart.current)}
              onChange={(e) =>
                preview((p) => (p.background ? { ...p, background: { ...p.background, opacity: +e.target.value } } : p))
              }
            />
          </label>
          <p className="help">
            1. Move the drawing so it lines up. 2. Set the scale: tap both ends of a wall you know the length of, and type it in.
            3. Trace the rooms with the Room tool.
          </p>
          <div className="row">
            <button
              className={tool === 'move-background' ? 'active-toggle' : ''}
              onClick={() => setTool(tool === 'move-background' ? 'select' : 'move-background')}
            >
              {tool === 'move-background' ? '✓ Done moving' : 'Move'}
            </button>
            <button onClick={() => setTool('calibrate')}>Set scale</button>
            <button onClick={rotateDrawing} title="Turn a quarter turn clockwise">
              Rotate
            </button>
          </div>
          <div className="row">
            <button onClick={picker.open} disabled={busy}>
              {busy ? 'Reading…' : 'Replace'}
            </button>
            <button className="danger" onClick={() => setBackground(undefined)}>
              Remove
            </button>
          </div>
        </>
      )}
      {error && <p className="help error">{error}</p>}
      {saveFailed && (
        <p className="help error">
          The browser is out of room to save your plan, so changes will be lost when you close the page. Remove a drawing from one of the floors to make room.
        </p>
      )}
    </Section>
  )
}

function PlanPanel() {
  const snapStep = useStore((s) => s.snapStep)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const { setSnapStep, undo, redo, resetPlan, loadPlan } = useStore.getState()
  const [confirmReset, setConfirmReset] = useState(false)
  const [importError, setImportError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [copied, setCopied] = useState(false)
  const copyPlan = async () => {
    // Leave out the traced drawings: they are large and only useful in this browser.
    const home = useStore.getState().home
    const text = JSON.stringify({ levels: home.levels.map(({ background: _bg, ...level }) => level) })
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const exportPlan = () => {
    const blob = new Blob([JSON.stringify(useStore.getState().home, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'floor-plan.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Section title="Plan">
      <div className="row">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶ Undo
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷ Redo
        </button>
      </div>
      <label className="field">
        <span>Snap to grid</span>
        <select value={snapStep} onChange={(e) => setSnapStep(+e.target.value)}>
          <option value={0}>Off</option>
          <option value={0.01}>1 cm</option>
          <option value={0.05}>5 cm</option>
          <option value={0.1}>10 cm</option>
          <option value={0.25}>25 cm</option>
        </select>
      </label>
      <p className="help">Hold Alt while dragging to place freely.</p>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            loadPlan(JSON.parse(await f.text()))
            setImportError(false)
          } catch {
            setImportError(true)
          }
        }}
      />
      <div className="row">
        <button onClick={exportPlan} title="Download the plan as a file">Export</button>
        <button onClick={() => fileRef.current?.click()}>Import</button>
        <button
          className="danger"
          onClick={() => {
            if (!confirmReset) return setConfirmReset(true)
            setConfirmReset(false)
            resetPlan()
          }}
          onBlur={() => setConfirmReset(false)}
          title="Go back to the first draft of the apartment. You can undo this."
        >
          {confirmReset ? 'Sure? Reset' : 'Reset'}
        </button>
      </div>
      <button className="copy-plan" onClick={copyPlan}>
        {copied ? 'Copied! Paste it in the chat' : 'Copy plan to share with Claude'}
      </button>
      {importError && <p className="help error">That file isn't a floor plan exported from Husdesign.</p>}
    </Section>
  )
}

export function ViewSidebar({ onEditPlan }: { onEditPlan: () => void }) {
  const wallHeight = useStore((s) => s.plan.wallHeight)
  const rooms = useStore((s) => s.plan.rooms)
  const name = useStore((s) => s.plan.name)
  const selection = useStore((s) => s.selection)
  const { commit, addStairs } = useStore.getState()
  return (
    <aside className="sidebar">
      {selection?.type === 'furniture' && <SelectedFurniturePanel id={selection.id} />}
      {selection?.type === 'area' && <SelectedAreaPanel id={selection.id} />}
      <FurniturePanel />
      <OutdoorPanel onDraw={onEditPlan} />
      <Section title={name}>
        <p className="help">
          {rooms.length} rooms · {rooms.reduce((s, r) => s + polygonArea(r.points), 0).toFixed(1).replace('.', ',')} m²
        </p>
        <div className="field">
          <span>Ceiling height</span>
          <LengthInput label="↕" value={wallHeight} onCommit={(v) => commit((p) => ({ ...p, wallHeight: Math.min(5, Math.max(2, v)) }))} />
        </div>
        <div className="row">
          <button onClick={addStairs} title="Add stairs from this floor up to the next">+ Stairs up</button>
          <button onClick={onEditPlan}>Edit floor plan</button>
        </div>
      </Section>
    </aside>
  )
}
