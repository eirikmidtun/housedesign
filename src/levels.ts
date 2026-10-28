import type { Home, Opening, Plan, Room } from './types'
import { uid } from './geometry'

/** Thickness of the floor between two storeys, in meters. */
export const SLAB = 0.25

/**
 * Height of each floor's floor above the ground, in the same order as `home.levels`.
 * Floors stack bottom-up; the lowest floor that isn't a basement sits at ground level.
 */
export function levelElevations(home: Home): number[] {
  const raw: number[] = []
  home.levels.forEach((_l, i) => {
    raw.push(i === 0 ? 0 : raw[i - 1] + home.levels[i - 1].wallHeight + SLAB)
  })
  const ground = Math.max(0, home.levels.findIndex((l) => !l.belowGround))
  return raw.map((e) => e - (raw[ground] ?? 0))
}

/** Accepts a home, or a single floor plan saved by an older version, and returns a home. */
export function toHome(data: unknown): Home {
  const d = data as Partial<Home> & Partial<Plan>
  if (Array.isArray(d?.levels) && d.levels.length) return { levels: d.levels.map((l, i) => toLevel(l, i)) }
  if (Array.isArray(d?.rooms)) return { levels: [toLevel(d as Plan, 0)] }
  throw new Error('not a plan')
}

function toLevel(l: Partial<Plan>, index: number): Plan {
  if (!Array.isArray(l.rooms)) throw new Error('not a plan')
  return {
    ...l,
    id: l.id || uid(),
    name: l.name || (index === 0 ? 'Ground floor' : `Floor ${index + 1}`),
    rooms: l.rooms,
    openings: Array.isArray(l.openings) ? l.openings : [],
    wallHeight: l.wallHeight && l.wallHeight > 0 ? l.wallHeight : 2.4,
  }
}

/** A name for a new floor that isn't taken yet. */
export function newLevelName(home: Home, basement: boolean) {
  const taken = new Set(home.levels.map((l) => l.name))
  if (basement && !taken.has('Basement')) return 'Basement'
  for (let n = basement ? 2 : home.levels.filter((l) => !l.belowGround).length + 1; ; n++) {
    const name = basement ? `Basement ${n}` : `Floor ${n}`
    if (!taken.has(name)) return name
  }
}

/** Copies the rooms and windows of a floor with fresh ids, so the outer walls can be reused upstairs. */
export function copyRooms(from: Plan): { rooms: Room[]; openings: Opening[] } {
  const ids = new Map(from.rooms.map((r) => [r.id, uid()]))
  return {
    rooms: from.rooms.map((r) => ({ ...r, id: ids.get(r.id)!, points: r.points.map((p) => ({ ...p })) })),
    openings: from.openings
      .filter((o) => o.kind === 'window' && ids.has(o.roomId))
      .map((o) => ({ ...o, id: uid(), roomId: ids.get(o.roomId)! })),
  }
}
