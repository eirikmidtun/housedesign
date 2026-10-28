import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, PointerEvent as ReactPointerEvent } from 'react'
import { reattachOpenings, useStore } from '../store'
import type { FurnitureItem, Opening, Plan, Point, Room } from '../types'
import {
  centroid,
  dist,
  edgePoints,
  formatMeters,
  lerp,
  nearestEdge,
  openingGeometry,
  polygonArea,
  projectOnSegment,
  snap,
} from '../geometry'

interface View {
  scale: number // pixels per meter
  x: number // screen offset of world origin
  y: number
}

type Drag =
  | { kind: 'pan'; startScreen: Point; startView: View }
  | { kind: 'room'; roomId: string; start: Point; before: Plan }
  | { kind: 'vertex'; links: { roomId: string; index: number }[]; before: Plan }
  | { kind: 'opening'; id: string; before: Plan }
  | { kind: 'new-room'; start: Point; current: Point }
  | { kind: 'background'; start: Point; origin: Point; before: Plan }
  | { kind: 'furniture'; id: string; start: Point; origin: Point; before: Plan }

const WALL = 0.12 // drawn wall thickness in meters
const LINK_EPS = 0.015 // corners closer than this move together
const VERTEX_MAGNET_PX = 10

export function FloorPlanEditor() {
  const plan = useStore((s) => s.plan)
  const selection = useStore((s) => s.selection)
  const tool = useStore((s) => s.tool)
  const snapStep = useStore((s) => s.snapStep)
  const { select, preview, checkpoint, addRoom, addOpening, commit, setTool } = useStore.getState()

  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState<View>({ scale: 70, x: 260, y: 90 })
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<Point | null>(null)
  const [calibration, setCalibration] = useState<Point[]>([])
  const [spaceDown, setSpaceDown] = useState(false)

  // Fit the plan into view once the canvas size is known.
  const fitted = useRef(false)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: width, h: height })
      if (!fitted.current && width > 0) {
        fitted.current = true
        setView(fitView(useStore.getState().plan, width, height))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space') setSpaceDown(true)
      if (e.key === 'Escape') {
        setTool('select')
        setCalibration([])
        select(null)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [select, setTool])

  useEffect(() => {
    if (tool !== 'calibrate') setCalibration([])
  }, [tool])

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = svgRef.current!.getBoundingClientRect()
      return { x: (e.clientX - rect.left - view.x) / view.scale, y: (e.clientY - rect.top - view.y) / view.scale }
    },
    [view],
  )

  // Zoom around the cursor. Registered natively so preventDefault works on wheel.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setView((v) => {
        const factor = Math.exp(-e.deltaY * 0.0015)
        const scale = Math.min(400, Math.max(15, v.scale * factor))
        const k = scale / v.scale
        return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const snapPoint = useCallback(
    (p: Point, e: { altKey: boolean }, ignore: { roomId: string; index: number }[] = []): Point => {
      if (e.altKey) return p
      // Magnet to other rooms' corners first, then to the grid.
      const magnet = VERTEX_MAGNET_PX / view.scale
      let best: Point | null = null
      let bestD = magnet
      for (const room of useStore.getState().plan.rooms) {
        room.points.forEach((q, index) => {
          if (ignore.some((l) => l.roomId === room.id && l.index === index)) return
          const d = dist(p, q)
          if (d < bestD) {
            bestD = d
            best = q
          }
        })
      }
      if (best) return { ...(best as Point) }
      return { x: snap(p.x, snapStep), y: snap(p.y, snapStep) }
    },
    [snapStep, view.scale],
  )

  const linkedCorners = (point: Point) => {
    const links: { roomId: string; index: number }[] = []
    for (const room of plan.rooms) {
      room.points.forEach((q, index) => {
        if (dist(point, q) < LINK_EPS) links.push({ roomId: room.id, index })
      })
    }
    return links
  }

  // ---- pointer handling -------------------------------------------------

  const startPan = (e: ReactPointerEvent) => {
    setDrag({ kind: 'pan', startScreen: { x: e.clientX, y: e.clientY }, startView: view })
  }

  const onBackgroundDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId)
    const p = toWorld(e)
    if (e.button === 1 || spaceDown) return startPan(e)
    if (tool === 'room') {
      const s = snapPoint(p, e)
      setDrag({ kind: 'new-room', start: s, current: s })
      return
    }
    if (tool === 'door' || tool === 'window') {
      const hit = nearestEdge(plan.rooms, p, 0.4)
      if (hit) addOpening({ kind: tool, roomId: hit.roomId, edge: hit.edge, t: hit.t, width: tool === 'door' ? 0.8 : 1.0 })
      return
    }
    if (tool === 'calibrate') {
      if (calibration.length < 2) setCalibration([...calibration, p])
      return
    }
    select(null)
    startPan(e)
  }

  const calibrate = (a: Point, b: Point, real: number) => {
    const bg = plan.background
    const measured = dist(a, b)
    if (!bg || !(real > 0) || measured === 0) return
    const k = real / measured
    // Scale the image around the first clicked point so that point stays put.
    commit((p) => ({
      ...p,
      background: {
        ...bg,
        metersPerPixel: bg.metersPerPixel * k,
        x: a.x - (a.x - bg.x) * k,
        y: a.y - (a.y - bg.y) * k,
      },
    }))
    setTool('select')
  }

  const onRoomDown = (e: ReactPointerEvent, room: Room) => {
    if (tool !== 'select' || e.button !== 0 || spaceDown) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    select({ type: 'room', id: room.id })
    setDrag({ kind: 'room', roomId: room.id, start: toWorld(e), before: plan })
  }

  const onVertexDown = (e: ReactPointerEvent, room: Room, index: number) => {
    if (e.button !== 0) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    // Shift detaches the corner from corners of neighbouring rooms.
    const links = e.shiftKey ? [{ roomId: room.id, index }] : linkedCorners(room.points[index])
    setDrag({ kind: 'vertex', links, before: plan })
  }

  const onVertexDoubleClick = (room: Room, index: number) => {
    if (room.points.length <= 3) return
    commit((p) => {
      const before = p.rooms.find((r) => r.id === room.id)!
      const after = { ...before, points: before.points.filter((_, i) => i !== index) }
      return {
        ...p,
        rooms: p.rooms.map((r) => (r.id === room.id ? after : r)),
        openings: reattachOpenings(p.openings, before, after),
      }
    })
  }

  const onMidpointDown = (e: ReactPointerEvent, room: Room, edge: number) => {
    if (e.button !== 0) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    const [a, b] = edgePoints(room, edge)
    const mid = lerp(a, b, 0.5)
    const before = plan
    const after: Room = { ...room, points: [...room.points.slice(0, edge + 1), mid, ...room.points.slice(edge + 1)] }
    preview((p) => ({
      ...p,
      rooms: p.rooms.map((r) => (r.id === room.id ? after : r)),
      openings: reattachOpenings(p.openings, room, after),
    }))
    setDrag({ kind: 'vertex', links: [{ roomId: room.id, index: edge + 1 }], before })
  }

  const onOpeningDown = (e: ReactPointerEvent, o: Opening) => {
    if (tool !== 'select' || e.button !== 0) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    select({ type: 'opening', id: o.id })
    setDrag({ kind: 'opening', id: o.id, before: plan })
  }

  const onFurnitureDown = (e: ReactPointerEvent, item: FurnitureItem) => {
    if (tool !== 'select' || e.button !== 0 || spaceDown) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    select({ type: 'furniture', id: item.id })
    setDrag({ kind: 'furniture', id: item.id, start: toWorld(e), origin: { x: item.x, y: item.y }, before: plan })
  }

  const onBackgroundImageDown = (e: ReactPointerEvent) => {
    if (tool !== 'select' || e.button !== 0 || !plan.background || !e.shiftKey) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    setDrag({ kind: 'background', start: toWorld(e), origin: { x: plan.background.x, y: plan.background.y }, before: plan })
  }

  const onMove = (e: ReactPointerEvent) => {
    const p = toWorld(e)
    setHover(p)
    if (!drag) return
    switch (drag.kind) {
      case 'pan':
        setView({
          ...drag.startView,
          x: drag.startView.x + e.clientX - drag.startScreen.x,
          y: drag.startView.y + e.clientY - drag.startScreen.y,
        })
        break
      case 'new-room':
        setDrag({ ...drag, current: snapPoint(p, e) })
        break
      case 'room': {
        const step = e.altKey ? 0 : snapStep
        const dx = snap(p.x - drag.start.x, step)
        const dy = snap(p.y - drag.start.y, step)
        const original = drag.before.rooms.find((r) => r.id === drag.roomId)!
        preview((pl) => ({
          ...pl,
          rooms: pl.rooms.map((r) =>
            r.id === drag.roomId ? { ...r, points: original.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : r,
          ),
        }))
        break
      }
      case 'vertex': {
        const target = snapPoint(p, e, drag.links)
        preview((pl) => ({
          ...pl,
          rooms: pl.rooms.map((r) => {
            const mine = drag.links.filter((l) => l.roomId === r.id)
            if (!mine.length) return r
            return { ...r, points: r.points.map((q, i) => (mine.some((l) => l.index === i) ? target : q)) }
          }),
        }))
        break
      }
      case 'opening': {
        preview((pl) => {
          const o = pl.openings.find((x) => x.id === drag.id)
          if (!o) return pl
          const room = pl.rooms.find((r) => r.id === o.roomId)
          if (!room) return pl
          // Slide along the current wall, or jump to another wall of the same room if closer.
          const hit = nearestEdge([room], p, Infinity)
          if (!hit) return pl
          const [a, b] = edgePoints(room, hit.edge)
          const len = dist(a, b)
          const margin = Math.min(0.5, o.width / 2 / (len || 1))
          let t = Math.max(margin, Math.min(1 - margin, hit.t))
          if (!e.altKey && len > 0) t = snap(t * len, snapStep) / len
          return { ...pl, openings: pl.openings.map((x) => (x.id === o.id ? { ...x, edge: hit.edge, t } : x)) }
        })
        break
      }
      case 'furniture': {
        const step = e.altKey ? 0 : snapStep
        const x = drag.origin.x + snap(p.x - drag.start.x, step)
        const y = drag.origin.y + snap(p.y - drag.start.y, step)
        preview((pl) => ({
          ...pl,
          furniture: (pl.furniture ?? []).map((f) => (f.id === drag.id ? { ...f, x, y } : f)),
        }))
        break
      }
      case 'background': {
        const bg = useStore.getState().plan.background
        if (!bg) break
        preview((pl) => ({
          ...pl,
          background: { ...bg, x: drag.origin.x + p.x - drag.start.x, y: drag.origin.y + p.y - drag.start.y },
        }))
        break
      }
    }
  }

  const onUp = () => {
    if (!drag) return
    if (drag.kind === 'new-room') {
      const { start, current } = drag
      const w = Math.abs(current.x - start.x)
      const h = Math.abs(current.y - start.y)
      if (w > 0.2 && h > 0.2) {
        const x0 = Math.min(start.x, current.x)
        const y0 = Math.min(start.y, current.y)
        addRoom([
          { x: x0, y: y0 },
          { x: x0 + w, y: y0 },
          { x: x0 + w, y: y0 + h },
          { x: x0, y: y0 + h },
        ])
      }
    } else if (drag.kind !== 'pan') {
      checkpoint(drag.before)
    }
    setDrag(null)
  }

  // ---- rendering --------------------------------------------------------

  const selectedRoom = selection?.type === 'room' ? plan.rooms.find((r) => r.id === selection.id) : undefined
  const hoverEdge = useMemo(() => {
    if ((tool !== 'door' && tool !== 'window') || !hover) return null
    return nearestEdge(plan.rooms, hover, 0.4)
  }, [tool, hover, plan.rooms])

  const cursor =
    drag?.kind === 'pan'
      ? 'grabbing'
      : spaceDown
        ? 'grab'
        : tool === 'room' || tool === 'calibrate'
          ? 'crosshair'
          : tool === 'door' || tool === 'window'
            ? hoverEdge
              ? 'copy'
              : 'not-allowed'
            : 'default'

  const px = 1 / view.scale // one screen pixel in meters

  return (
    <div className="editor">
      <svg
        ref={svgRef}
        className="editor-svg"
        style={{ cursor }}
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Grid view={view} size={size} />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {plan.background && (
            <image
              href={plan.background.dataUrl}
              x={plan.background.x}
              y={plan.background.y}
              width={plan.background.naturalWidth * plan.background.metersPerPixel}
              height={plan.background.naturalHeight * plan.background.metersPerPixel}
              opacity={plan.background.opacity}
              preserveAspectRatio="none"
              onPointerDown={onBackgroundImageDown}
              style={{ pointerEvents: tool === 'select' ? 'auto' : 'none' }}
            />
          )}

          {/* Floors */}
          {plan.rooms.map((room) => (
            <polygon
              key={room.id}
              className="room-floor"
              points={room.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={room.color}
              fillOpacity={plan.background ? 0.75 : 1}
              onPointerDown={(e) => onRoomDown(e, room)}
              style={{ cursor: tool === 'select' && !spaceDown ? 'move' : undefined }}
            />
          ))}

          {/* Walls */}
          {plan.rooms.map((room) => (
            <polygon
              key={room.id}
              points={room.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="var(--wall)"
              strokeWidth={WALL}
              strokeLinejoin="miter"
              pointerEvents="none"
            />
          ))}

          {/* Doors and windows */}
          {plan.openings.map((o) => {
            const room = plan.rooms.find((r) => r.id === o.roomId)
            if (!room || o.edge >= room.points.length) return null
            return (
              <OpeningShape
                key={o.id}
                room={room}
                opening={o}
                selected={selection?.type === 'opening' && selection.id === o.id}
                onPointerDown={(e) => onOpeningDown(e, o)}
              />
            )
          })}

          {/* Labels */}
          {plan.rooms.map((room) => {
            const c = centroid(room.points)
            const fs = Math.max(0.16, Math.min(0.32, 13 * px))
            return (
              <g key={room.id} pointerEvents="none" className="room-label">
                <text x={c.x} y={c.y - fs * 0.15} fontSize={fs} textAnchor="middle">
                  {room.name}
                </text>
                <text x={c.x} y={c.y + fs * 1.05} fontSize={fs * 0.8} textAnchor="middle" className="room-area">
                  {polygonArea(room.points).toFixed(1).replace('.', ',')} m²
                </text>
              </g>
            )
          })}

          {/* Furniture */}
          {(plan.furniture ?? []).map((item) => (
            <FurnitureShape
              key={item.id}
              item={item}
              px={px}
              selected={selection?.type === 'furniture' && selection.id === item.id}
              onPointerDown={(e) => onFurnitureDown(e, item)}
            />
          ))}

          {selectedRoom && tool === 'select' && (
            <RoomHandles
              room={selectedRoom}
              px={px}
              onVertexDown={onVertexDown}
              onVertexDoubleClick={onVertexDoubleClick}
              onMidpointDown={onMidpointDown}
            />
          )}

          {hoverEdge && (() => {
            const room = plan.rooms.find((r) => r.id === hoverEdge.roomId)!
            const ghost: Opening = {
              id: 'ghost',
              kind: tool as 'door' | 'window',
              roomId: room.id,
              edge: hoverEdge.edge,
              t: hoverEdge.t,
              width: tool === 'door' ? 0.8 : 1.0,
            }
            return (
              <g opacity={0.55} pointerEvents="none">
                <OpeningShape room={room} opening={ghost} selected />
              </g>
            )
          })()}

          {drag?.kind === 'new-room' && (
            <NewRoomPreview start={drag.start} current={drag.current} px={px} />
          )}

          {tool === 'calibrate' && calibration.length > 0 && (calibration[1] ?? hover) && (
            <g pointerEvents="none">
              <line
                x1={calibration[0].x}
                y1={calibration[0].y}
                x2={(calibration[1] ?? hover)!.x}
                y2={(calibration[1] ?? hover)!.y}
                stroke="var(--accent)"
                strokeWidth={2 * px}
                strokeDasharray={`${6 * px} ${4 * px}`}
              />
              <circle cx={calibration[0].x} cy={calibration[0].y} r={5 * px} fill="var(--accent)" />
            </g>
          )}
        </g>
        <ScaleBar view={view} size={size} />
      </svg>
      {calibration.length === 2 ? (
        <CalibrationForm
          measured={dist(calibration[0], calibration[1])}
          onApply={(real) => calibrate(calibration[0], calibration[1], real)}
          onCancel={() => setTool('select')}
        />
      ) : (
        <ToolHint tool={tool} calibrationStep={calibration.length} hasBackground={!!plan.background} />
      )}
      <div className="zoom-controls">
        <button onClick={() => setView((v) => zoomAround(v, size, 1.25))} title="Zoom in">+</button>
        <button onClick={() => setView((v) => zoomAround(v, size, 0.8))} title="Zoom out">−</button>
        <button onClick={() => setView(fitView(plan, size.w, size.h))} title="Fit plan to screen">⤢</button>
      </div>
    </div>
  )
}

function zoomAround(v: View, size: { w: number; h: number }, k: number): View {
  const scale = Math.min(400, Math.max(15, v.scale * k))
  const f = scale / v.scale
  const cx = size.w / 2
  const cy = size.h / 2
  return { scale, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }
}

function fitView(plan: Plan, w: number, h: number): View {
  const pts = plan.rooms.flatMap((r) => r.points)
  if (!pts.length) return { scale: 70, x: w / 2, y: h / 2 }
  const minX = Math.min(...pts.map((p) => p.x))
  const maxX = Math.max(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y))
  const maxY = Math.max(...pts.map((p) => p.y))
  const pad = 70
  const scale = Math.min(250, Math.max(15, Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1))))
  return { scale, x: w / 2 - ((minX + maxX) / 2) * scale, y: h / 2 - ((minY + maxY) / 2) * scale }
}

function Grid({ view, size }: { view: View; size: { w: number; h: number } }) {
  const lines: ReactElement[] = []
  const minor = view.scale > 45 ? 0.1 : view.scale > 22 ? 0.5 : 1
  const x0 = Math.floor(-view.x / view.scale / minor) * minor
  const x1 = (size.w - view.x) / view.scale
  const y0 = Math.floor(-view.y / view.scale / minor) * minor
  const y1 = (size.h - view.y) / view.scale
  for (let x = x0; x <= x1; x += minor) {
    const major = Math.abs(x - Math.round(x)) < 1e-6
    const sx = view.x + x * view.scale
    lines.push(<line key={`x${x.toFixed(2)}`} x1={sx} x2={sx} y1={0} y2={size.h} className={major ? 'grid-major' : 'grid-minor'} />)
  }
  for (let y = y0; y <= y1; y += minor) {
    const major = Math.abs(y - Math.round(y)) < 1e-6
    const sy = view.y + y * view.scale
    lines.push(<line key={`y${y.toFixed(2)}`} y1={sy} y2={sy} x1={0} x2={size.w} className={major ? 'grid-major' : 'grid-minor'} />)
  }
  return <g pointerEvents="none">{lines}</g>
}

function ScaleBar({ view, size }: { view: View; size: { w: number; h: number } }) {
  const meters = view.scale > 120 ? 0.5 : view.scale > 40 ? 1 : 2
  const w = meters * view.scale
  const x = 20
  const y = size.h - 24
  return (
    <g className="scale-bar" pointerEvents="none">
      <line x1={x} x2={x + w} y1={y} y2={y} />
      <line x1={x} x2={x} y1={y - 5} y2={y + 5} />
      <line x1={x + w} x2={x + w} y1={y - 5} y2={y + 5} />
      <text x={x + w / 2} y={y - 8} textAnchor="middle">
        {meters.toString().replace('.', ',')} m
      </text>
    </g>
  )
}

function OpeningShape({
  room,
  opening,
  selected,
  onPointerDown,
}: {
  room: Room
  opening: Opening
  selected: boolean
  onPointerDown?: (e: ReactPointerEvent) => void
}) {
  const g = openingGeometry(room, opening)
  const { start, end, normal, dir } = g
  const color = selected ? 'var(--accent)' : 'var(--wall)'
  const half = WALL / 2
  // A white gap cut into the wall where the opening sits.
  const gap = (
    <line
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      stroke="var(--paper)"
      strokeWidth={WALL + 0.02}
    />
  )
  if (opening.kind === 'window') {
    return (
      <g onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? 'grab' : undefined }}>
        {gap}
        {[-half, 0, half].map((off) => (
          <line
            key={off}
            x1={start.x + normal.x * off}
            y1={start.y + normal.y * off}
            x2={end.x + normal.x * off}
            y2={end.y + normal.y * off}
            stroke={color}
            strokeWidth={off === 0 ? 0.02 : 0.025}
          />
        ))}
        <HitArea start={start} end={end} />
      </g>
    )
  }
  // Door: leaf drawn open at 90° with a quarter-circle swing. The swing side is the
  // room's interior (left of the edge direction for this polygon winding) unless flipped.
  const inward = isInwardNormal(room, g.center, normal) ? 1 : -1
  const side = (opening.flip ? -1 : 1) * inward
  const hinge = start
  const leafEnd = { x: hinge.x + normal.x * side * opening.width, y: hinge.y + normal.y * side * opening.width }
  const sweep = (dir.x * normal.y - dir.y * normal.x) * side > 0 ? 1 : 0
  return (
    <g onPointerDown={onPointerDown} style={{ cursor: onPointerDown ? 'grab' : undefined }}>
      {gap}
      <line x1={hinge.x} y1={hinge.y} x2={leafEnd.x} y2={leafEnd.y} stroke={color} strokeWidth={0.035} />
      <path
        d={`M ${leafEnd.x} ${leafEnd.y} A ${opening.width} ${opening.width} 0 0 ${sweep} ${end.x} ${end.y}`}
        fill="none"
        stroke={color}
        strokeWidth={0.015}
        strokeDasharray="0.05 0.04"
      />
      <HitArea start={start} end={end} />
    </g>
  )
}

function HitArea({ start, end }: { start: Point; end: Point }) {
  return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="transparent" strokeWidth={0.3} />
}

function isInwardNormal(room: Room, center: Point, normal: Point) {
  // Test a point just off the wall against the polygon.
  const probe = { x: center.x + normal.x * 0.05, y: center.y + normal.y * 0.05 }
  let inside = false
  const pts = room.points
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > probe.y !== b.y > probe.y && probe.x < ((b.x - a.x) * (probe.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function RoomHandles({
  room,
  px,
  onVertexDown,
  onVertexDoubleClick,
  onMidpointDown,
}: {
  room: Room
  px: number
  onVertexDown: (e: ReactPointerEvent, room: Room, index: number) => void
  onVertexDoubleClick: (room: Room, index: number) => void
  onMidpointDown: (e: ReactPointerEvent, room: Room, edge: number) => void
}) {
  const c = centroid(room.points)
  return (
    <g>
      <polygon
        points={room.points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.5 * px}
        pointerEvents="none"
      />
      {room.points.map((a, i) => {
        const b = room.points[(i + 1) % room.points.length]
        const mid = lerp(a, b, 0.5)
        const len = dist(a, b)
        // Put the length label outside the room.
        const nx = -(b.y - a.y) / (len || 1)
        const ny = (b.x - a.x) / (len || 1)
        const outward = projectOnSegment(c, a, b).point
        const sign = (c.x - outward.x) * nx + (c.y - outward.y) * ny > 0 ? -1 : 1
        const off = (Math.abs(nx) * 42 + Math.abs(ny) * 12 + 8) * px
        const lx = mid.x + nx * off * sign
        const ly = mid.y + ny * off * sign
        return (
          <g key={`e${i}`}>
            <g className="dim-label" pointerEvents="none">
              <rect x={lx - 40 * px} y={ly - 10 * px} width={80 * px} height={20 * px} rx={10 * px} />
              <text x={lx} y={ly + 4.5 * px} fontSize={12 * px} textAnchor="middle">
                {i + 1}: {formatMeters(len)}
              </text>
            </g>
            {len > 0.4 && (
              <g
                className="midpoint-handle"
                onPointerDown={(e) => onMidpointDown(e, room, i)}
              >
                <circle cx={mid.x} cy={mid.y} r={7 * px} />
                <path
                  d={`M ${mid.x - 3.5 * px} ${mid.y} H ${mid.x + 3.5 * px} M ${mid.x} ${mid.y - 3.5 * px} V ${mid.y + 3.5 * px}`}
                  strokeWidth={1.5 * px}
                />
                <title>Drag to add a corner on this wall</title>
              </g>
            )}
          </g>
        )
      })}
      {room.points.map((p, i) => (
        <circle
          key={`v${i}`}
          className="vertex-handle"
          cx={p.x}
          cy={p.y}
          r={7 * px}
          strokeWidth={2.5 * px}
          onPointerDown={(e) => onVertexDown(e, room, i)}
          onDoubleClick={() => onVertexDoubleClick(room, i)}
        >
          <title>Drag to move this corner. Double-click to remove it. Hold Shift to move it without neighbouring rooms.</title>
        </circle>
      ))}
    </g>
  )
}

function NewRoomPreview({ start, current, px }: { start: Point; current: Point; px: number }) {
  const x = Math.min(start.x, current.x)
  const y = Math.min(start.y, current.y)
  const w = Math.abs(current.x - start.x)
  const h = Math.abs(current.y - start.y)
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} fill="var(--accent)" fillOpacity={0.12} stroke="var(--accent)" strokeWidth={2 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
      <text x={x + w / 2} y={y + h / 2} fontSize={13 * px} textAnchor="middle" className="room-label">
        {formatMeters(w)} × {formatMeters(h)}
      </text>
    </g>
  )
}

function ToolHint({ tool, calibrationStep, hasBackground }: { tool: string; calibrationStep: number; hasBackground: boolean }) {
  const hints: Record<string, string> = {
    select: hasBackground
      ? 'Click a room to edit it. Drag empty space to pan, scroll to zoom. Shift-drag the sketch to move it.'
      : 'Click a room to edit it. Drag empty space to pan, scroll to zoom.',
    room: 'Drag to draw a new rectangular room. Add corners afterwards for other shapes.',
    door: 'Click on a wall to place a door.',
    window: 'Click on a wall to place a window.',
    calibrate:
      calibrationStep === 0
        ? 'Click the start of something on the sketch whose real length you know.'
        : 'Now click its end point.',
  }
  return <div className="tool-hint">{hints[tool]}</div>
}

function CalibrationForm({
  measured,
  onApply,
  onCancel,
}: {
  measured: number
  onApply: (real: number) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(measured.toFixed(2).replace('.', ','))
  const real = parseFloat(value.replace(',', '.'))
  return (
    <form
      className="calibration-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (real > 0) onApply(real)
      }}
    >
      <label htmlFor="calibration-length">Real length of that line</label>
      <input
        id="calibration-length"
        inputMode="decimal"
        autoFocus
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setValue(e.target.value)}
      />
      <span className="unit">m</span>
      <button type="submit" className="primary" disabled={!(real > 0)}>
        Set scale
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

function FurnitureShape({
  item,
  px,
  selected,
  onPointerDown,
}: {
  item: FurnitureItem
  px: number
  selected: boolean
  onPointerDown: (e: ReactPointerEvent) => void
}) {
  const { width: w, depth: d } = item
  const round = item.kind === 'plant' || item.kind === 'lamp'
  const fs = Math.min(11 * px, w * 0.22, 0.2)
  return (
    <g
      transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}
      onPointerDown={onPointerDown}
      style={{ cursor: 'move' }}
      className="furniture-2d"
    >
      {round ? (
        <ellipse rx={w / 2} ry={d / 2} fill={item.color} stroke={selected ? 'var(--accent)' : 'var(--wall)'} strokeWidth={(selected ? 2.5 : 1.2) * px} />
      ) : (
        <rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          rx={Math.min(0.06, w / 6)}
          fill={item.color}
          fillOpacity={item.kind === 'rug' ? 0.6 : 0.92}
          stroke={selected ? 'var(--accent)' : 'var(--wall)'}
          strokeWidth={(selected ? 2.5 : 1.2) * px}
        />
      )}
      {/* front edge marker */}
      {!round && item.kind !== 'rug' && (
        <line x1={-w / 2 + 0.04} x2={w / 2 - 0.04} y1={d / 2 - 0.03} y2={d / 2 - 0.03} stroke="rgba(0,0,0,0.25)" strokeWidth={1.5 * px} />
      )}
      {fs > 4 * px && (
        <text className="furniture-label" fontSize={fs} textAnchor="middle" y={fs * 0.35} pointerEvents="none">
          {item.name.length > 18 ? item.name.slice(0, 17) + '…' : item.name}
        </text>
      )}
    </g>
  )
}
