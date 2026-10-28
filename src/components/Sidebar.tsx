import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '../store'
import type { Tool } from '../store'
import type { Plan, Room } from '../types'
import { dist, edgePoints, polygonArea } from '../geometry'

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

      {room && <RoomPanel room={room} plan={plan} />}
      {opening && <OpeningPanel id={opening.id} />}

      <Section title={`Rooms · ${totalArea.toFixed(1).replace('.', ',')} m²`}>
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

      <BackgroundPanel />
      <PlanPanel />
    </aside>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
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

function LengthInput({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value.toFixed(2).replace('.', ',')
  const commitDraft = () => {
    if (draft === null) return
    const v = parseFloat(draft.replace(',', '.'))
    setDraft(null)
    if (v > 0 && Math.abs(v - value) > 0.0005) onCommit(v)
  }
  return (
    <label className="length-input">
      <span className="wall-no">{label}</span>
      <input
        inputMode="decimal"
        value={shown}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(null)
        }}
      />
      <span className="unit">m</span>
    </label>
  )
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

function BackgroundPanel() {
  const background = useStore((s) => s.plan.background)
  const { setBackground, setTool, preview, checkpoint } = useStore.getState()
  const fileRef = useRef<HTMLInputElement>(null)
  const opacityStart = useRef<Plan | null>(null)

  const onFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        // Start with the image about 8 m wide; calibrate to make it exact.
        const metersPerPixel = 8 / img.naturalWidth
        const pts = useStore.getState().plan.rooms.flatMap((r) => r.points)
        setBackground({
          dataUrl,
          x: pts.length ? Math.min(...pts.map((p) => p.x)) : 0,
          y: pts.length ? Math.min(...pts.map((p) => p.y)) : 0,
          metersPerPixel,
          opacity: 0.5,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        })
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  return (
    <Section title="Trace a sketch">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      {!background ? (
        <>
          <p className="help">Put a floor plan or sketch behind the rooms and trace over it.</p>
          <button onClick={() => fileRef.current?.click()}>Upload image…</button>
        </>
      ) : (
        <>
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
          <p className="help">Shift-drag the image to move it. Use “Set scale” and click two points you know the distance between.</p>
          <div className="row">
            <button onClick={() => setTool('calibrate')}>Set scale</button>
            <button onClick={() => fileRef.current?.click()}>Replace</button>
            <button className="danger" onClick={() => setBackground(undefined)}>
              Remove
            </button>
          </div>
        </>
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
    // Leave out the traced image: it is large and only useful in this browser.
    const { background: _bg, ...plan } = useStore.getState().plan
    const text = JSON.stringify(plan)
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
    const blob = new Blob([JSON.stringify(useStore.getState().plan, null, 2)], { type: 'application/json' })
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
            const plan = JSON.parse(await f.text())
            if (!Array.isArray(plan.rooms)) throw new Error('not a plan')
            setImportError(false)
            loadPlan(plan)
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
  const cutaway = useStore((s) => s.cutaway)
  const { commit, setCutaway } = useStore.getState()
  return (
    <aside className="sidebar">
      <Section title="Your home">
        <p className="help">
          {rooms.length} rooms · {rooms.reduce((s, r) => s + polygonArea(r.points), 0).toFixed(1).replace('.', ',')} m²
        </p>
        <div className="field">
          <span>Ceiling height</span>
          <LengthInput label="↕" value={wallHeight} onCommit={(v) => commit((p) => ({ ...p, wallHeight: Math.min(5, Math.max(2, v)) }))} />
        </div>
        <div className="field">
          <span>Walls</span>
          <div className="segmented">
            <button className={!cutaway ? 'active' : ''} onClick={() => setCutaway(false)}>
              Full height
            </button>
            <button className={cutaway ? 'active' : ''} onClick={() => setCutaway(true)}>
              Cut away
            </button>
          </div>
        </div>
        <button onClick={onEditPlan}>Edit floor plan</button>
      </Section>
      <Section title="Furniture">
        <p className="help">
          Soon you can paste a link or upload a photo of a piece of furniture, get a 3D model of it, and place it in
          your rooms.
        </p>
      </Section>
    </aside>
  )
}
