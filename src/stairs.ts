import type { FurnitureItem, Plan, Point } from './types'
import { SLAB } from './levels'

/** Comfortable step sizes: about 18 cm up and 25 cm forward per step. */
const RISE = 0.18
const GOING = 0.25

/** Stairs always climb from their own floor to the floor above, through its slab. */
export const stairRise = (plan: Pick<Plan, 'wallHeight'>) => plan.wallHeight + SLAB

/** Number of steps up (risers), the last one landing on the floor above. */
export const stairSteps = (rise: number) => Math.max(2, Math.round(rise / RISE))

/** A straight flight that fits the given floor: its length follows from the number of steps. */
export function stairSize(plan: Pick<Plan, 'wallHeight'>) {
  const rise = stairRise(plan)
  return { width: 0.9, depth: Math.round((stairSteps(rise) - 1) * GOING * 100) / 100, height: rise }
}

/** The four corners of an item's footprint on the plan. */
export function footprint(item: Pick<FurnitureItem, 'x' | 'y' | 'width' | 'depth' | 'rotation'>): Point[] {
  const r = (item.rotation * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const x = (sx * item.width) / 2
    const y = (sy * item.depth) / 2
    return { x: item.x + x * cos - y * sin, y: item.y + x * sin + y * cos }
  })
}

export const stairsOf = (plan?: Plan) => (plan?.furniture ?? []).filter((f) => f.kind === 'stairs')

/** Stairs are drawn as tall as the floor they climb, whatever height they were saved with. */
export const fitStairs = (plan: Pick<Plan, 'wallHeight'>, item: FurnitureItem) =>
  item.kind === 'stairs' ? { ...item, height: stairRise(plan) } : item
