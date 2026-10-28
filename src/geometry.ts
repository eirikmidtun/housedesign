import type { Opening, Point, Room } from './types'

export const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

export const snap = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v)

/** Absolute polygon area in square meters (shoelace formula). */
export function polygonArea(points: Point[]) {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function centroid(points: Point[]): Point {
  // Area-weighted centroid, falling back to the vertex average for degenerate shapes.
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    const f = p.x * q.y - q.x * p.y
    a += f
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  if (Math.abs(a) < 1e-9) {
    const n = points.length || 1
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    }
  }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}

export function edgePoints(room: Room, edge: number): [Point, Point] {
  const n = room.points.length
  return [room.points[edge % n], room.points[(edge + 1) % n]]
}

/** Projects p onto segment ab, returning the clamped parameter t and the distance. */
export function projectOnSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  const proj = lerp(a, b, t)
  return { t, point: proj, distance: dist(p, proj) }
}

/** Finds the closest room edge to p, within maxDistance meters. */
export function nearestEdge(rooms: Room[], p: Point, maxDistance: number) {
  let best: { roomId: string; edge: number; t: number; distance: number } | null = null
  for (const room of rooms) {
    for (let i = 0; i < room.points.length; i++) {
      const [a, b] = edgePoints(room, i)
      const r = projectOnSegment(p, a, b)
      if (r.distance <= maxDistance && (!best || r.distance < best.distance)) {
        best = { roomId: room.id, edge: i, t: r.t, distance: r.distance }
      }
    }
  }
  return best
}

/** The two end points of an opening plus the wall's unit direction and normal. */
export function openingGeometry(room: Room, opening: Opening) {
  const [a, b] = edgePoints(room, opening.edge)
  const len = dist(a, b) || 1
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  const normal = { x: -dir.y, y: dir.x }
  const center = lerp(a, b, opening.t)
  const half = opening.width / 2
  return {
    a,
    b,
    len,
    dir,
    normal,
    center,
    start: { x: center.x - dir.x * half, y: center.y - dir.y * half },
    end: { x: center.x + dir.x * half, y: center.y + dir.y * half },
  }
}

export const formatMeters = (m: number) => `${m.toFixed(2).replace('.', ',')} m`

export const uid = () => Math.random().toString(36).slice(2, 10)
