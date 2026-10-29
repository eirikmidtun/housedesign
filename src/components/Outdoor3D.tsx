import { useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import type { OutdoorArea, Point, Room } from '../types'
import { dist, mulberry, projectOnSegment } from '../geometry'
import { deckHeight, pointInPolygon } from '../outdoor'

const ACCENT = '#C4673F'
const SLAB_DEPTH = 0.2
const RAIL_HEIGHT = 0.9

/** How far above the floor each flat surface sits, so overlapping ones don't flicker. */
const SURFACE_TOP: Record<OutdoorArea['kind'], number> = { deck: 0, lawn: 0.004, gravel: 0.008, paving: 0.012, bed: 0.06 }

/**
 * Decks, lawns and paths of one floor. On the ground floor they reach down to the ground;
 * on upper floors they rest on a slab, like a balcony or roof terrace.
 */
export function OutdoorLayer({
  areas,
  rooms,
  onGround,
  interactive,
}: {
  areas?: OutdoorArea[]
  rooms: Room[]
  onGround: boolean
  interactive: boolean
}) {
  const selection = useStore((s) => s.selection)
  if (!areas?.length) return null
  return (
    <>
      {areas.map((area) => (
        <Area
          key={area.id}
          area={area}
          rooms={rooms}
          onGround={onGround}
          selected={interactive && selection?.type === 'area' && selection.id === area.id}
          onSelect={interactive ? () => useStore.getState().select({ type: 'area', id: area.id }) : undefined}
        />
      ))}
    </>
  )
}

function Area({
  area,
  rooms,
  onGround,
  selected,
  onSelect,
}: {
  area: OutdoorArea
  rooms: Room[]
  onGround: boolean
  selected: boolean
  onSelect?: () => void
}) {
  const top = area.kind === 'deck' ? deckHeight(area) : SURFACE_TOP[area.kind]
  const bottom = onGround ? -0.02 : top - SLAB_DEPTH
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(area.points.map((p) => new THREE.Vector2(p.x, -p.y)))
    return new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.005, top - bottom), bevelEnabled: false })
  }, [area.points, top, bottom])
  const texture = surfaceTexture(area.kind)
  // Upper-floor terraces have a plain slab underneath; the textured top is all you see from above.
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ map: texture, roughness: area.kind === 'paving' ? 0.75 : 0.95 }),
      new THREE.MeshStandardMaterial({ color: area.kind === 'deck' ? '#9C7650' : onGround ? '#8B7A66' : '#FBF7F0', roughness: 0.9 }),
    ],
    [texture, area.kind, onGround],
  )
  const outline = useMemo(() => [...area.points, area.points[0]].map((p) => [p.x, top + 0.012, p.y] as [number, number, number]), [area.points, top])

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // Orbiting the camera ends with a click too; only a tap that stayed put selects.
    if (!onSelect || e.delta > 4) return
    e.stopPropagation()
    onSelect()
  }

  return (
    <group>
      <mesh
        geometry={geometry}
        material={materials}
        rotation-x={-Math.PI / 2}
        position-y={bottom}
        receiveShadow
        castShadow={area.kind === 'deck' || !onGround}
        onClick={onClick}
      />
      {area.kind === 'bed' && <BedPlants points={area.points} top={top} />}
      {area.kind === 'deck' && area.railing && <Railing points={area.points} rooms={rooms} top={top} />}
      {selected && <Line points={outline} color={ACCENT} lineWidth={3} />}
    </group>
  )
}

/** Little round shrubs and flowers scattered over a flower bed. */
function BedPlants({ points, top }: { points: Point[]; top: number }) {
  const plants = useMemo(() => {
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const rand = mulberry(Math.round(x0 * 100 + y0 * 1000))
    const out: { x: number; y: number; r: number; color: string }[] = []
    const count = Math.min(80, Math.round((x1 - x0) * (y1 - y0) * 5))
    for (let i = 0; i < count * 3 && out.length < count; i++) {
      const p = { x: x0 + rand() * (x1 - x0), y: y0 + rand() * (y1 - y0) }
      if (!pointInPolygon(p, points)) continue
      const flower = rand() > 0.7
      out.push({ ...p, r: flower ? 0.07 : 0.12 + rand() * 0.1, color: flower ? ['#E59AA0', '#F2D16B', '#B9A3E3'][Math.floor(rand() * 3)] : '#6E9450' })
    }
    return out
  }, [points])
  return (
    <>
      {plants.map((p, i) => (
        <mesh key={i} position={[p.x, top + p.r * 0.6, p.y]} scale={[1, 0.8, 1]} castShadow>
          <sphereGeometry args={[p.r, 10, 8]} />
          <meshStandardMaterial color={p.color} roughness={0.9} />
        </mesh>
      ))}
    </>
  )
}

/** Posts, balusters and a handrail along the deck edges that don't run along a wall. */
function Railing({ points, rooms, top }: { points: Point[]; rooms: Room[]; top: number }) {
  const pieces = useMemo(() => {
    const out: { at: [number, number, number]; size: [number, number, number]; angle: number }[] = []
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length]
      const len = dist(a, b)
      if (len < 0.1 || againstWall(a, b, rooms)) return
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      const at = (t: number, y: number): [number, number, number] => [a.x + (b.x - a.x) * t, y, a.y + (b.y - a.y) * t]
      out.push({ at: at(0.5, top + RAIL_HEIGHT), size: [len + 0.07, 0.04, 0.09], angle })
      out.push({ at: at(0.5, top + 0.1), size: [len, 0.04, 0.04], angle })
      const posts = Math.max(1, Math.ceil(len / 1.2))
      for (let k = 0; k <= posts; k++) out.push({ at: at(k / posts, top + RAIL_HEIGHT / 2), size: [0.07, RAIL_HEIGHT, 0.07], angle })
      const slats = Math.floor(len / 0.11)
      for (let k = 1; k < slats; k++) out.push({ at: at(k / slats, top + 0.1 + (RAIL_HEIGHT - 0.1) / 2), size: [0.022, RAIL_HEIGHT - 0.12, 0.045], angle })
    })
    return out
  }, [points, rooms, top])
  return (
    <>
      {pieces.map((p, i) => (
        <mesh key={i} position={p.at} rotation-y={-p.angle} castShadow>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color="#A88158" roughness={0.85} />
        </mesh>
      ))}
    </>
  )
}

/** True when the edge from a to b lies along a wall of the house. */
function againstWall(a: Point, b: Point, rooms: Room[]) {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  return rooms.some((r) =>
    r.points.some((p, i) => {
      const q = r.points[(i + 1) % r.points.length]
      return projectOnSegment(mid, p, q).distance < 0.12 && projectOnSegment(a, p, q).distance < 0.12 && projectOnSegment(b, p, q).distance < 0.12
    }),
  )
}

// ---- procedural textures (cached), 1 texture repeat = 1 meter ---------------

const textures = new Map<string, THREE.CanvasTexture>()

function surfaceTexture(kind: OutdoorArea['kind']) {
  let t = textures.get(kind)
  if (t) return t
  const size = 512
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const rand = mulberry(kind.length * 17)
  const speckle = (n: number, color: () => string, s: () => number) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = color()
      const r = s()
      ctx.fillRect(rand() * size, rand() * size, r, r)
    }
  }
  if (kind === 'deck') {
    // Pressure-treated boards, about 14 cm wide with a gap between them.
    const boards = 7
    const bw = size / boards
    for (let i = 0; i < boards; i++) {
      const light = 50 + rand() * 8
      ctx.fillStyle = `hsl(30, 38%, ${light}%)`
      ctx.fillRect(i * bw, 0, bw, size)
      for (let g = 0; g < 18; g++) {
        ctx.strokeStyle = `hsla(28, 40%, ${light - 12 - rand() * 8}%, ${0.15 + rand() * 0.2})`
        ctx.lineWidth = 0.8 + rand()
        ctx.beginPath()
        const x = i * bw + rand() * bw
        ctx.moveTo(x, 0)
        for (let y = 0; y <= size; y += 32) ctx.lineTo(x + Math.sin(y / 50 + g) * 2 * rand(), y)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(50, 30, 15, 0.75)'
      ctx.fillRect(i * bw, 0, 5, size)
      ctx.fillRect(i * bw, rand() * size, bw, 2)
      // screws
      ctx.fillStyle = 'rgba(40, 30, 20, 0.6)'
      for (const y of [0.25, 0.75]) {
        ctx.fillRect(i * bw + bw * 0.3, y * size, 3, 3)
        ctx.fillRect(i * bw + bw * 0.7, y * size, 3, 3)
      }
    }
  } else if (kind === 'lawn') {
    ctx.fillStyle = '#7FA65A'
    ctx.fillRect(0, 0, size, size)
    speckle(9000, () => `hsla(${85 + rand() * 25}, ${35 + rand() * 20}%, ${30 + rand() * 25}%, 0.7)`, () => 1 + rand() * 2.5)
  } else if (kind === 'gravel') {
    ctx.fillStyle = '#CFC6B6'
    ctx.fillRect(0, 0, size, size)
    speckle(12000, () => `hsla(35, ${5 + rand() * 12}%, ${50 + rand() * 35}%, 0.9)`, () => 2 + rand() * 4)
  } else if (kind === 'bed') {
    ctx.fillStyle = '#5E4433'
    ctx.fillRect(0, 0, size, size)
    speckle(6000, () => `hsla(25, 30%, ${15 + rand() * 20}%, 0.8)`, () => 1 + rand() * 3)
  } else {
    // Concrete paving stones, 50 × 50 cm, every other row offset.
    ctx.fillStyle = '#A8A097'
    ctx.fillRect(0, 0, size, size)
    const tile = size / 2
    for (let row = 0; row < 2; row++) {
      for (let col = -1; col < 3; col++) {
        const x = col * tile + (row % 2 ? tile / 2 : 0)
        ctx.fillStyle = `hsl(35, 7%, ${70 + rand() * 8}%)`
        ctx.fillRect(x + 3, row * tile + 3, tile - 6, tile - 6)
      }
    }
    speckle(3000, () => `hsla(30, 5%, ${45 + rand() * 30}%, 0.35)`, () => 1 + rand() * 2)
  }
  t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  textures.set(kind, t)
  return t
}
