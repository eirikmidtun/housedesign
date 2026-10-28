import { create } from 'zustand'
import { initialPlan } from './initialPlan'
import type { BackgroundImage, FurnitureItem, Home, Opening, Plan, Point, Room } from './types'
import { nearestEdge, openingGeometry, uid } from './geometry'
import { copyRooms, newLevelName, toHome } from './levels'

const STORAGE_KEY = 'husdesign.home.v2'
const OLD_STORAGE_KEY = 'husdesign.plan.v1'
const HISTORY_LIMIT = 100

export type Selection =
  | { type: 'room'; id: string }
  | { type: 'opening'; id: string }
  | { type: 'furniture'; id: string }
  | null

export type Tool = 'select' | 'room' | 'door' | 'window' | 'calibrate' | 'move-background'

/** The home as it was at one point, with the floor that was being edited. */
interface Snapshot {
  home: Home
  levelId: string
}

interface State {
  home: Home
  /** The floor being edited. */
  levelId: string
  /** The floor being edited (a level of `home`). Everything that edits rooms works on this. */
  plan: Plan
  past: Snapshot[]
  future: Snapshot[]
  selection: Selection
  tool: Tool
  snapStep: number
  cutaway: boolean
  /** Bumped to ask the floor plan view to fit everything on screen. */
  fitRequest: number
  /** The browser refused to store the plan, usually because the images are too large. */
  saveFailed: boolean

  /** Replaces the current floor and records an undo step. */
  commit: (update: (plan: Plan) => Plan) => void
  /** Replaces the whole home and records an undo step. */
  commitHome: (update: (home: Home) => Home, levelId?: string) => void
  /** Replaces the current floor without an undo step (used while dragging). */
  preview: (update: (plan: Plan) => Plan) => void
  /** Records the floor as it was before a drag so the drag can be undone in one step. */
  checkpoint: (before: Plan) => void
  undo: () => void
  redo: () => void
  select: (selection: Selection) => void
  setTool: (tool: Tool) => void
  setSnapStep: (step: number) => void
  setCutaway: (cutaway: boolean) => void
  requestFit: () => void
  resetPlan: () => void
  loadPlan: (data: unknown) => void

  setLevel: (id: string) => void
  addLevel: (basement: boolean) => void
  renameLevel: (id: string, name: string) => void
  moveLevel: (id: string, direction: -1 | 1) => void
  deleteLevel: (id: string) => void
  copyRoomsFrom: (fromId: string) => void

  updateRoom: (id: string, patch: Partial<Room>) => void
  addRoom: (points: Point[]) => void
  deleteSelected: () => void
  addOpening: (opening: Omit<Opening, 'id'>) => void
  updateOpening: (id: string, patch: Partial<Opening>) => void
  setBackground: (background: BackgroundImage | undefined) => void
  addFurniture: (item: Omit<FurnitureItem, 'id'>) => void
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void
}

const ROOM_COLORS = ['#F3D9B1', '#DCE3C4', '#EBD3C6', '#CFE0DC', '#E8D5E4', '#F1E3B5', '#D9D4EA']

function draftHome(): Home {
  return { levels: [structuredClone(initialPlan)] }
}

function loadStoredHome(): Home {
  for (const key of [STORAGE_KEY, OLD_STORAGE_KEY]) {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return toHome(JSON.parse(raw))
    } catch {
      // Storage can be unavailable (private mode) or hold something broken; try the next one.
    }
  }
  return draftHome()
}

// Saving the whole home on every pointer move is slow once it holds images, so wait for a pause.
let saveTimer: ReturnType<typeof setTimeout> | undefined
function saveHome(home: Home) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    let ok = true
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(home))
      localStorage.removeItem(OLD_STORAGE_KEY)
    } catch {
      ok = false
    }
    if (useStore.getState().saveFailed === ok) useStore.setState({ saveFailed: !ok })
  }, 250)
}

/** The state that follows from showing `levelId` of `home` (falling back to the first floor). */
function showing(home: Home, levelId: string) {
  const plan = home.levels.find((l) => l.id === levelId) ?? home.levels[0]
  return { home, levelId: plan.id, plan }
}

function withLevel(home: Home, level: Plan): Home {
  return { ...home, levels: home.levels.map((l) => (l.id === level.id ? level : l)) }
}

const initialHome = loadStoredHome()

export const useStore = create<State>((set, get) => ({
  ...showing(initialHome, initialHome.levels.find((l) => !l.belowGround)?.id ?? ''),
  past: [],
  future: [],
  selection: null,
  tool: 'select',
  snapStep: 0.05,
  cutaway: false,
  fitRequest: 0,
  saveFailed: false,

  commit: (update) => {
    const { plan } = get()
    const next = update(plan)
    if (next === plan) return
    get().commitHome((home) => withLevel(home, next))
  },
  commitHome: (update, levelId) => {
    const { home, past } = get()
    const next = update(home)
    if (next === home || !next.levels.length) return
    set({
      ...showing(next, levelId ?? get().levelId),
      past: [...past, { home, levelId: get().levelId }].slice(-HISTORY_LIMIT),
      future: [],
    })
    saveHome(next)
  },
  preview: (update) => {
    const next = update(get().plan)
    const home = withLevel(get().home, next)
    set({ home, plan: next })
    saveHome(home)
  },
  checkpoint: (before) => {
    if (before === get().plan) return
    const { home, levelId, past } = get()
    set({ past: [...past, { home: withLevel(home, before), levelId }].slice(-HISTORY_LIMIT), future: [] })
  },
  undo: () => {
    const { past, home, levelId, future } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({ ...showing(prev.home, prev.levelId), past: past.slice(0, -1), future: [{ home, levelId }, ...future], selection: null })
    saveHome(prev.home)
  },
  redo: () => {
    const { past, home, levelId, future } = get()
    if (!future.length) return
    const next = future[0]
    set({ ...showing(next.home, next.levelId), past: [...past, { home, levelId }], future: future.slice(1), selection: null })
    saveHome(next.home)
  },
  select: (selection) => set({ selection }),
  setTool: (tool) => set({ tool }),
  setSnapStep: (snapStep) => set({ snapStep }),
  setCutaway: (cutaway) => set({ cutaway }),
  requestFit: () => set({ fitRequest: get().fitRequest + 1 }),
  resetPlan: () => {
    // Back to the first draft of the apartment, keeping the drawing traced on the ground floor.
    const background = get().home.levels.find((l) => !l.belowGround)?.background
    get().commitHome(() => {
      const draft = draftHome()
      draft.levels[0].background = background
      return draft
    }, initialPlan.id)
    set({ selection: null })
    get().requestFit()
  },
  loadPlan: (data) => {
    const home = toHome(data)
    get().commitHome(() => home, home.levels.find((l) => !l.belowGround)?.id)
    set({ selection: null })
    get().requestFit()
  },

  setLevel: (id) => {
    if (id === get().levelId) return
    set({ ...showing(get().home, id), selection: null, tool: 'select' })
  },
  addLevel: (basement) => {
    const id = uid()
    const { plan } = get()
    get().commitHome((home) => {
      const level: Plan = { id, name: newLevelName(home, basement), rooms: [], openings: [], wallHeight: plan.wallHeight }
      if (basement) level.belowGround = true
      return { ...home, levels: basement ? [level, ...home.levels] : [...home.levels, level] }
    }, id)
    set({ selection: null, tool: 'select' })
  },
  renameLevel: (id, name) =>
    get().commitHome((home) => ({ ...home, levels: home.levels.map((l) => (l.id === id ? { ...l, name } : l)) })),
  moveLevel: (id, direction) =>
    get().commitHome((home) => {
      const i = home.levels.findIndex((l) => l.id === id)
      const j = i + direction
      if (i < 0 || j < 0 || j >= home.levels.length) return home
      const levels = [...home.levels]
      ;[levels[i], levels[j]] = [levels[j], levels[i]]
      // The bottom floors stay basements, so a floor moved down past the ground floor becomes one.
      const basements = home.levels.filter((l) => l.belowGround).length
      return {
        ...home,
        levels: levels.map((l, k) => (!!l.belowGround === k < basements ? l : { ...l, belowGround: k < basements || undefined })),
      }
    }),
  deleteLevel: (id) => {
    const { home } = get()
    if (home.levels.length < 2) return
    const i = home.levels.findIndex((l) => l.id === id)
    const neighbour = home.levels[i + 1] ?? home.levels[i - 1]
    get().commitHome((h) => ({ ...h, levels: h.levels.filter((l) => l.id !== id) }), neighbour.id)
    set({ selection: null })
  },
  copyRoomsFrom: (fromId) => {
    const from = get().home.levels.find((l) => l.id === fromId)
    if (!from) return
    get().commit((p) => ({ ...p, ...copyRooms(from) }))
    get().requestFit()
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
      sel.type === 'furniture'
        ? { ...p, furniture: (p.furniture ?? []).filter((f) => f.id !== sel.id) }
        : sel.type === 'room'
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
  addFurniture: (item) => {
    const id = uid()
    get().commit((p) => ({ ...p, furniture: [...(p.furniture ?? []), { ...item, id }] }))
    set({ selection: { type: 'furniture', id } })
  },
  updateFurniture: (id, patch) =>
    get().commit((p) => ({
      ...p,
      furniture: (p.furniture ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),
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
