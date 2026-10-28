import type { OpeningKind, Plan, Point } from './types'
import { dist, openingGeometry, projectOnSegment } from './geometry'

export const WALL_THICKNESS = 0.12
export const DOOR_HEIGHT = 2.05
export const WINDOW_SILL = 0.9
export const WINDOW_TOP = 2.1

/** A box-shaped piece of wall: runs from a to b, and from height y0 to y1. */
export interface WallPiece {
  a: Point
  b: Point
  y0: number
  y1: number
}

export interface OpeningPiece {
  kind: OpeningKind
  a: Point
  b: Point
}

const EPS = 0.01

/**
 * Turns room outlines into wall pieces. Rooms that share a wall each list that edge, often
 * with different end points, so every edge is first split at any corner that lies on it and
 * identical pieces are kept once. Doors and windows then cut gaps out of the pieces.
 */
export function buildWalls(plan: Plan): { walls: WallPiece[]; openings: OpeningPiece[] } {
  const corners = plan.rooms.flatMap((r) => r.points)
  const segments = new Map<string, [Point, Point]>()
  const key = (p: Point) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`

  for (const room of plan.rooms) {
    room.points.forEach((a, i) => {
      const b = room.points[(i + 1) % room.points.length]
      const len = dist(a, b)
      if (len < EPS) return
      const ts = [0, 1]
      for (const c of corners) {
        const hit = projectOnSegment(c, a, b)
        if (hit.distance < EPS && hit.t > EPS / len && hit.t < 1 - EPS / len) ts.push(hit.t)
      }
      ts.sort((x, y) => x - y)
      for (let k = 0; k < ts.length - 1; k++) {
        const p = lerpPt(a, b, ts[k])
        const q = lerpPt(a, b, ts[k + 1])
        if (dist(p, q) < EPS) continue
        const [ka, kb] = [key(p), key(q)].sort()
        segments.set(`${ka}|${kb}`, [p, q])
      }
    })
  }

  // Opening spans in world space.
  const openings: OpeningPiece[] = []
  for (const o of plan.openings) {
    const room = plan.rooms.find((r) => r.id === o.roomId)
    if (!room || o.edge >= room.points.length) continue
    const g = openingGeometry(room, o)
    openings.push({ kind: o.kind, a: g.start, b: g.end })
  }

  const walls: WallPiece[] = []
  const H = plan.wallHeight
  for (const [a, b] of segments.values()) {
    const len = dist(a, b)
    // Openings lying on this segment, as [from, to] distances along it.
    const cuts: { s0: number; s1: number; kind: OpeningKind }[] = []
    for (const o of openings) {
      const pa = projectOnSegment(o.a, a, b)
      const pb = projectOnSegment(o.b, a, b)
      const onLine = distToLine(o.a, a, b) < EPS * 3 && distToLine(o.b, a, b) < EPS * 3
      if (!onLine) continue
      const s0 = Math.min(pa.t, pb.t) * len
      const s1 = Math.max(pa.t, pb.t) * len
      if (s1 - s0 > EPS) cuts.push({ s0, s1, kind: o.kind })
    }
    cuts.sort((x, y) => x.s0 - y.s0)
    let s = 0
    const at = (d: number) => lerpPt(a, b, d / len)
    // Full-height pieces reach half a wall thickness past the segment ends so corners close.
    const half = WALL_THICKNESS / 2
    const from = (d: number) => at(d < EPS ? -half : d)
    for (const c of cuts) {
      if (c.s0 > s + EPS) walls.push({ a: from(s), b: at(c.s0), y0: 0, y1: H })
      const top = c.kind === 'door' ? DOOR_HEIGHT : WINDOW_TOP
      if (H > top) walls.push({ a: at(c.s0), b: at(c.s1), y0: top, y1: H })
      if (c.kind === 'window') walls.push({ a: at(c.s0), b: at(c.s1), y0: 0, y1: WINDOW_SILL })
      s = Math.max(s, c.s1)
    }
    if (len > s + EPS) walls.push({ a: from(s), b: at(len + half), y0: 0, y1: H })
  }

  return { walls, openings }
}

function lerpPt(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function distToLine(p: Point, a: Point, b: Point) {
  const len = dist(a, b) || 1
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len
}
