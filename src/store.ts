import { create } from 'zustand'
import { initialPlan } from './initialPlan'
import type { BackgroundImage, Opening, Plan, Point, Room } from './types'
import { nearestEdge, openingGeometry, uid } from './geometry'

const STORAGE_KEY = 'husdesign.plan.v1'
const HISTORY_LIMIT = 100

export type Selection =
  | { type: 'room'; id: string }
  | { type: 'opening'; id: string }
  | null

export type Tool = 'select' | 'room' | 'door' | 'window' | 'calibrate'

interface State {
  plan: Plan
  past: Plan[]
  future: Plan[]
  selection: Selection
  tool: Tool
  snapStep: number

  /** Replaces the plan and records an undo step. */
  commit: (update: (plan: Plan) => Plan) => void
  /** Replaces the plan without an undo step (used while dragging). */
  preview: (update: (plan: Plan) => Plan) => void
  /** Records the plan as it was before a drag so the drag can be undone in one step. */
  checkpoint: (before: Plan) => void
  undo: () => void
  redo: () => void
  select: (selection: Selection) => void
  setTool: (tool: Tool) => void
  setSnapStep: (step: number) => void
  resetPlan: () => void
  loadPlan: (plan: Plan) => void

  updateRoom: (id: string, patch: Partial<Room>) => void
  addRoom: (points: Point[]) => void
  deleteSelected: () => void
  addOpening: (opening: Omit<Opening, 'id'>) => void
  updateOpening: (id: string, patch: Partial<Opening>) => void
  setBackground: (background: BackgroundImage | undefined) => void
}

const ROOM_COLORS = ['#F3D9B1', '#DCE3C4', '#EBD3C6', '#CFE0DC', '#E8D5E4', '#F1E3B5', '#D9D4EA']

function loadStoredPlan(): Plan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Plan
  } catch {
    // Storage can be unavailable (private mode); fall back to the draft plan.
  }
  return structuredClone(initialPlan)
}

function savePlan(plan: Plan) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
  } catch {
    // Ignore quota or availability errors; the plan still lives in memory.
  }
}

export const useStore = create<State>((set, get) => ({
  plan: loadStoredPlan(),
  past: [],
  future: [],
  selection: null,
  tool: 'select',
  snapStep: 0.05,

  commit: (update) => {
    const { plan, past } = get()
    const next = update(plan)
    if (next === plan) return
    set({ plan: next, past: [...past, plan].slice(-HISTORY_LIMIT), future: [] })
    savePlan(next)
  },
  preview: (update) => {
    const next = update(get().plan)
    set({ plan: next })
    savePlan(next)
  },
  checkpoint: (before) => {
    if (before === get().plan) return
    set({ past: [...get().past, before].slice(-HISTORY_LIMIT), future: [] })
  },
  undo: () => {
    const { past, plan, future } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({ plan: prev, past: past.slice(0, -1), future: [plan, ...future], selection: null })
    savePlan(prev)
  },
  redo: () => {
    const { past, plan, future } = get()
    if (!future.length) return
    const next = future[0]
    set({ plan: next, past: [...past, plan], future: future.slice(1), selection: null })
    savePlan(next)
  },
  select: (selection) => set({ selection }),
  setTool: (tool) => set({ tool }),
  setSnapStep: (snapStep) => set({ snapStep }),
  resetPlan: () => {
    get().commit((p) => ({ ...structuredClone(initialPlan), background: p.background }))
    set({ selection: null })
  },
  loadPlan: (plan) => {
    get().commit(() => plan)
    set({ selection: null })
  },

  updateRoom: (id, patch) =>
    get().commit((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
  addRoom: (points) => {
    const id = uid()
    get().commit((p) => ({
      ...p,
      rooms: [
        ...p.rooms,
        { id, name: `Room ${p.rooms.length + 1}`, color: ROOM_COLORS[p.rooms.length % ROOM_COLORS.length], points },
      ],
    }))
    set({ selection: { type: 'room', id }, tool: 'select' })
  },
  deleteSelected: () => {
    const sel = get().selection
    if (!sel) return
    get().commit((p) =>
      sel.type === 'room'
        ? {
            ...p,
            rooms: p.rooms.filter((r) => r.id !== sel.id),
            openings: p.openings.filter((o) => o.roomId !== sel.id),
          }
        : { ...p, openings: p.openings.filter((o) => o.id !== sel.id) },
    )
    set({ selection: null })
  },
  addOpening: (opening) => {
    const id = uid()
    get().commit((p) => ({ ...p, openings: [...p.openings, { ...opening, id }] }))
    set({ selection: { type: 'opening', id } })
  },
  updateOpening: (id, patch) =>
    get().commit((p) => ({
      ...p,
      openings: p.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),
  setBackground: (background) => get().commit((p) => ({ ...p, background })),
}))

/**
 * After a room gains or loses a corner its edge numbering changes. Re-attach each of its
 * doors and windows to whichever new edge is closest to where the opening used to be.
 */
export function reattachOpenings(openings: Opening[], before: Room, after: Room): Opening[] {
  return openings.map((o) => {
    if (o.roomId !== before.id) return o
    const center = openingGeometry(before, o).center
    const hit = nearestEdge([after], center, Infinity)
    return hit ? { ...o, edge: hit.edge, t: hit.t } : o
  })
}
