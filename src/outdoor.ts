import type { AreaKind, OutdoorArea, Plan, Point } from './types'
import { PRESETS } from './furniture'
import type { FurniturePreset } from './furniture'
import { centroid, polygonArea } from './geometry'

export interface AreaPreset {
  kind: AreaKind
  label: string
  /** Colour used on the floor plan. */
  color: string
}

export const AREA_PRESETS: AreaPreset[] = [
  { kind: 'deck', label: 'Deck (platting)', color: '#C9A47A' },
  { kind: 'lawn', label: 'Lawn', color: '#A9C98A' },
  { kind: 'paving', label: 'Paving', color: '#CFC8BE' },
  { kind: 'gravel', label: 'Gravel', color: '#DDD3C2' },
  { kind: 'bed', label: 'Flower bed', color: '#9C7B5E' },
]

export const areaPreset = (kind: AreaKind) => AREA_PRESETS.find((p) => p.kind === kind)!

/** Decks start 15 cm above the floor they belong to, like a small platting outside a door. */
export const DEFAULT_DECK_HEIGHT = 0.15

/** Things to put outside: garden versions of ordinary furniture, then the outdoor-only kinds. */
export const OUTDOOR_PRESETS: FurniturePreset[] = [
  { kind: 'table', label: 'Garden table', size: [1.4, 0.8, 0.73], color: '#8E8A84' },
  { kind: 'chair', label: 'Garden chair', size: [0.55, 0.6, 0.85], color: '#5A5650' },
  { kind: 'sofa', label: 'Outdoor sofa', size: [1.8, 0.8, 0.7], color: '#9A8F80' },
  { kind: 'plant', label: 'Planter', size: [0.5, 0.5, 0.9], color: '#6F8A55' },
  ...PRESETS.filter((p) => p.outdoor),
]

export function pointInPolygon(p: Point, pts: Point[]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export const deckHeight = (area: OutdoorArea) => (area.kind === 'deck' ? (area.height ?? DEFAULT_DECK_HEIGHT) : 0)

/** How high something standing at p is lifted by a deck under it. */
export function standingHeight(plan: Pick<Plan, 'outdoor'>, p: Point) {
  let h = 0
  for (const a of plan.outdoor ?? []) if (a.kind === 'deck' && pointInPolygon(p, a.points)) h = Math.max(h, deckHeight(a))
  return h
}

/**
 * Where to drop a new outdoor item of the given footprint: as close as possible to the
 * biggest deck (or else the biggest outdoor area, or else the front of the house), outside
 * the rooms and clear of what is already there.
 */
export function outdoorSpot(plan: Plan, width: number, depth: number): Point {
  const areas = [...(plan.outdoor ?? [])].sort((a, b) => polygonArea(b.points) - polygonArea(a.points))
  const area = areas.find((a) => a.kind === 'deck') ?? areas[0]
  const pts = plan.rooms.flatMap((r) => r.points)
  const anchor = area
    ? centroid(area.points)
    : pts.length
      ? { x: (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2, y: Math.max(...pts.map((p) => p.y)) + 1.5 }
      : { x: 0, y: 0 }
  const r = Math.hypot(width, depth) / 2
  const free = (p: Point) =>
    !plan.rooms.some((room) => pointInPolygon(p, room.points)) &&
    (plan.furniture ?? []).every((f) => Math.hypot(f.x - p.x, f.y - p.y) > (r + Math.hypot(f.width, f.depth) / 2) * 0.75)
  const step = 0.25
  for (let ring = 0; ring <= 40; ring++) {
    // Every grid point on the square ring `ring` steps out, nearest first.
    const ringPts: Point[] = []
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) === ring) ringPts.push({ x: anchor.x + i * step, y: anchor.y + j * step })
      }
    }
    ringPts.sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y))
    const hit = ringPts.find(free)
    if (hit) return hit
  }
  return anchor
}
