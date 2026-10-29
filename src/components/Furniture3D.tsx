import { useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../store'
import type { FurnitureItem, OutdoorArea, Plan } from '../types'
import { standingHeight } from '../outdoor'
import { fitStairs, stairSteps } from '../stairs'

const ACCENT = new THREE.Color('#C4673F')
const NO_FURNITURE: FurnitureItem[] = []
const NO_AREAS: OutdoorArea[] = []

/** All furniture in the 3D scene, draggable across the floor. */
export function FurnitureLayer({ elevation }: { elevation: number }) {
  const furniture = useStore((s) => s.plan.furniture ?? NO_FURNITURE)
  const outdoor = useStore((s) => s.plan.outdoor ?? NO_AREAS)
  const wallHeight = useStore((s) => s.plan.wallHeight)
  const selection = useStore((s) => s.selection)
  // Items are dragged across the floor they stand on.
  const floor = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation), [elevation])
  return (
    <>
      {furniture.map((item) => (
        <DraggableItem
          key={item.id}
          item={fitStairs({ wallHeight }, item)}
          floor={floor}
          lift={standingHeight({ outdoor }, item)}
          selected={selection?.type === 'furniture' && selection.id === item.id}
        />
      ))}
    </>
  )
}

/** Furniture on floors other than the one being edited, which can't be moved from here. */
export function StaticFurniture({ plan }: { plan: Plan }) {
  return (
    <>
      {(plan.furniture ?? NO_FURNITURE).map((item) => (
        <group key={item.id} position={[item.x, standingHeight(plan, item), item.y]} rotation-y={(-item.rotation * Math.PI) / 180}>
          <FurnitureModel item={fitStairs(plan, item)} />
        </group>
      ))}
    </>
  )
}

/** `lift` raises things standing on a deck. */
function DraggableItem({ item, floor, lift, selected }: { item: FurnitureItem; floor: THREE.Plane; lift: number; selected: boolean }) {
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null
  const drag = useRef<{ before: Plan; offset: THREE.Vector3 } | null>(null)

  const hitFloor = (e: ThreeEvent<PointerEvent>) => e.ray.intersectPlane(floor, new THREE.Vector3())

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const { select, plan } = useStore.getState()
    select({ type: 'furniture', id: item.id })
    const p = hitFloor(e)
    if (!p) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { before: plan, offset: new THREE.Vector3(item.x - p.x, 0, item.y - p.z) }
    if (controls) controls.enabled = false
    document.body.style.cursor = 'grabbing'
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    e.stopPropagation()
    const p = hitFloor(e)
    if (!p) return
    const snap = (v: number) => (e.altKey ? v : Math.round(v / 0.05) * 0.05)
    const x = snap(p.x + drag.current.offset.x)
    const y = snap(p.z + drag.current.offset.z)
    useStore.getState().preview((pl) => ({
      ...pl,
      furniture: (pl.furniture ?? []).map((f) => (f.id === item.id ? { ...f, x, y } : f)),
    }))
  }

  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    useStore.getState().checkpoint(drag.current.before)
    drag.current = null
    if (controls) controls.enabled = true
    document.body.style.cursor = ''
  }

  return (
    <group
      position={[item.x, lift, item.y]}
      rotation-y={(-item.rotation * Math.PI) / 180}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerOver={(e) => {
        e.stopPropagation()
        if (!drag.current) document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        if (!drag.current) document.body.style.cursor = ''
      }}
    >
      <FurnitureModel item={item} selected={selected} />
      {selected && <SelectionRing item={item} />}
    </group>
  )
}

function SelectionRing({ item }: { item: FurnitureItem }) {
  const w = item.width + 0.12
  const d = item.depth + 0.12
  const shape = useMemo(() => {
    const outer = roundedRect(w, d, 0.08)
    outer.holes.push(roundedRect(w - 0.06, d - 0.06, 0.06))
    return outer
  }, [w, d])
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial color={ACCENT} transparent opacity={0.9} />
    </mesh>
  )
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

// ---- parametric models ------------------------------------------------------
// Local space: width along x, depth along z (front faces +z), height along y, origin on
// the floor at the item's center.

type Vec3 = [number, number, number]

function Block({ at, size, color, rough = 0.7, map }: { at: Vec3; size: Vec3; color: string; rough?: number; map?: THREE.Texture | null }) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={map ? '#ffffff' : color} roughness={rough} map={map ?? undefined} />
    </mesh>
  )
}

function useImageTexture(src?: string) {
  return useMemo(() => {
    if (!src) return null
    const t = new THREE.TextureLoader().load(src)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [src])
}

export function FurnitureModel({ item }: { item: FurnitureItem; selected?: boolean }) {
  const { width: w, depth: d, height: h, color } = item
  const photo = useImageTexture(item.kind === 'rug' || item.kind === 'box' ? item.image : undefined)
  const wood = '#B98A5E'
  const leg = Math.min(0.05, w * 0.08)

  switch (item.kind) {
    case 'sofa': {
      const seatH = h * 0.5
      const arm = Math.min(0.2, w * 0.1)
      const back = Math.min(0.25, d * 0.28)
      const legH = 0.1
      return (
        <group>
          <Block at={[0, legH + (seatH - legH) / 2, 0]} size={[w, seatH - legH, d]} color={color} rough={0.95} />
          <Block at={[0, (seatH + h) / 2, -d / 2 + back / 2]} size={[w, h - seatH, back]} color={color} rough={0.95} />
          <Block at={[-w / 2 + arm / 2, (h * 0.68 + seatH) / 2, 0]} size={[arm, h * 0.68 - seatH, d]} color={color} rough={0.95} />
          <Block at={[w / 2 - arm / 2, (h * 0.68 + seatH) / 2, 0]} size={[arm, h * 0.68 - seatH, d]} color={color} rough={0.95} />
          {/* seat cushions */}
          {[-1, 1].map((s) => (
            <Block
              key={s}
              at={[(s * (w - 2 * arm)) / 4, seatH + 0.04, back / 2]}
              size={[(w - 2 * arm) / 2 - 0.02, 0.08, d - back - 0.02]}
              color={color}
              rough={1}
            />
          ))}
          {legs(w - 0.1, d - 0.1, legH, 0.04, wood)}
        </group>
      )
    }
    case 'bed': {
      const frameH = Math.min(0.3, h * 0.35)
      const mattress = 0.22
      return (
        <group>
          <Block at={[0, frameH / 2, 0]} size={[w, frameH, d]} color={wood} />
          <Block at={[0, frameH + mattress / 2, 0.03]} size={[w - 0.06, mattress, d - 0.1]} color="#FAF7F2" rough={1} />
          <Block at={[0, frameH + mattress + 0.03, d * 0.12]} size={[w - 0.04, 0.06, d * 0.7]} color={color} rough={1} />
          <Block at={[-w / 4, frameH + mattress + 0.07, -d / 2 + 0.3]} size={[w / 2 - 0.12, 0.12, 0.35]} color="#FFFFFF" rough={1} />
          <Block at={[w / 4, frameH + mattress + 0.07, -d / 2 + 0.3]} size={[w / 2 - 0.12, 0.12, 0.35]} color="#FFFFFF" rough={1} />
          <Block at={[0, h / 2, -d / 2 + 0.03]} size={[w, h, 0.06]} color={wood} />
        </group>
      )
    }
    case 'table': {
      const top = 0.04
      return (
        <group>
          <Block at={[0, h - top / 2, 0]} size={[w, top, d]} color={color} rough={0.5} />
          {legs(w - 0.12, d - 0.12, h - top, leg, color)}
        </group>
      )
    }
    case 'chair': {
      const seatH = Math.min(0.46, h * 0.55)
      return (
        <group>
          <Block at={[0, seatH, 0]} size={[w, 0.04, d]} color={color} />
          <Block at={[0, (seatH + h) / 2, -d / 2 + 0.02]} size={[w, h - seatH, 0.04]} color={color} />
          {legs(w - 0.06, d - 0.06, seatH, 0.035, color)}
        </group>
      )
    }
    case 'shelf': {
      const t = 0.025
      const n = Math.max(2, Math.round(h / 0.38))
      return (
        <group>
          <Block at={[-w / 2 + t / 2, h / 2, 0]} size={[t, h, d]} color={color} />
          <Block at={[w / 2 - t / 2, h / 2, 0]} size={[t, h, d]} color={color} />
          <Block at={[0, h / 2, -d / 2 + 0.005]} size={[w, h, 0.01]} color={color} />
          {Array.from({ length: n + 1 }, (_, i) => (
            <Block key={i} at={[0, t / 2 + (i * (h - t)) / n, 0]} size={[w - 2 * t, t, d]} color={color} />
          ))}
        </group>
      )
    }
    case 'cabinet': {
      const base = 0.08
      const doors = Math.max(1, Math.round(w / 0.45))
      return (
        <group>
          <Block at={[0, base + (h - base) / 2, 0]} size={[w, h - base, d]} color={color} rough={0.5} />
          <Block at={[0, base / 2, 0.02]} size={[w - 0.04, base, d - 0.04]} color="#3A302A" />
          {Array.from({ length: doors }, (_, i) => (
            <Block
              key={i}
              at={[-w / 2 + ((i + 0.5) * w) / doors, base + (h - base) / 2, d / 2 + 0.006]}
              size={[w / doors - 0.012, h - base - 0.02, 0.012]}
              color={color}
              rough={0.45}
            />
          ))}
        </group>
      )
    }
    case 'lamp': {
      const r = Math.min(w, d) / 2
      return (
        <group>
          <mesh position={[0, 0.015, 0]} castShadow>
            <cylinderGeometry args={[r * 0.6, r * 0.65, 0.03, 32]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, h / 2, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, h, 12]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, h - 0.12, 0]} castShadow>
            <cylinderGeometry args={[r * 0.55, r, 0.26, 32, 1, true]} />
            <meshStandardMaterial color="#F7EBD3" emissive="#FFD9A0" emissiveIntensity={0.35} side={THREE.DoubleSide} />
          </mesh>
          <pointLight position={[0, h - 0.2, 0]} intensity={0.6} distance={3} color="#FFD9A0" />
        </group>
      )
    }
    case 'plant': {
      const r = Math.min(w, d) / 2
      const pot = Math.min(0.35, h * 0.3)
      return (
        <group>
          <mesh position={[0, pot / 2, 0]} castShadow>
            <cylinderGeometry args={[r * 0.6, r * 0.45, pot, 24]} />
            <meshStandardMaterial color="#C77B57" roughness={0.9} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2
            const rr = i === 0 ? 0 : r * 0.35
            return (
              <mesh key={i} position={[Math.cos(a) * rr, pot + (h - pot) * (i === 0 ? 0.55 : 0.4), Math.sin(a) * rr]} castShadow>
                <sphereGeometry args={[i === 0 ? r * 0.75 : r * 0.55, 16, 12]} />
                <meshStandardMaterial color={color} roughness={0.9} />
              </mesh>
            )
          })}
        </group>
      )
    }
    case 'tree': {
      const r = Math.min(w, d) / 2
      const trunk = h * 0.4
      return (
        <group>
          <mesh position={[0, trunk / 2, 0]} castShadow>
            <cylinderGeometry args={[Math.max(0.05, r * 0.06), Math.max(0.07, r * 0.09), trunk, 12]} />
            <meshStandardMaterial color="#6B5038" roughness={1} />
          </mesh>
          {[
            [0, 0.62, 0, 0.75],
            [-0.35, 0.5, 0.15, 0.55],
            [0.35, 0.52, -0.1, 0.55],
            [0.05, 0.8, -0.05, 0.5],
          ].map(([x, y, z, s], i) => (
            <mesh key={i} position={[x * r, h * y, z * r]} scale={[1, 1.1, 1]} castShadow>
              <icosahedronGeometry args={[r * s, 1]} />
              <meshStandardMaterial color={color} roughness={0.95} flatShading />
            </mesh>
          ))}
        </group>
      )
    }
    case 'bush': {
      const r = Math.min(w, d) / 2
      return (
        <group scale={[w / (2 * r), h / r, d / (2 * r)]}>
          {[
            [0, 0.5, 0, 0.62],
            [-0.4, 0.4, 0.1, 0.45],
            [0.4, 0.38, -0.05, 0.45],
          ].map(([x, y, z, s], i) => (
            <mesh key={i} position={[x * r, y * r, z * r]} castShadow>
              <icosahedronGeometry args={[r * s, 1]} />
              <meshStandardMaterial color={color} roughness={0.95} flatShading />
            </mesh>
          ))}
        </group>
      )
    }
    case 'hedge':
      return (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d, Math.max(1, Math.round(w * 4)), Math.max(1, Math.round(h * 4)), 2]} />
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
      )
    case 'fence': {
      // Upright boards (spileverk) on two rails, with posts at the ends and about every metre.
      const posts = Math.max(1, Math.round(w / 1.0))
      const boards = Math.max(2, Math.round(w / 0.12))
      return (
        <group>
          {Array.from({ length: posts + 1 }, (_, i) => (
            <Block key={`p${i}`} at={[-w / 2 + (i * w) / posts, h / 2 + 0.03, -0.03]} size={[0.07, h + 0.06, 0.07]} color={color} />
          ))}
          {[0.2, h - 0.2].map((y) => (
            <Block key={`r${y}`} at={[0, y, -0.025]} size={[w, 0.07, 0.035]} color={color} />
          ))}
          {Array.from({ length: boards }, (_, i) => (
            <Block key={i} at={[-w / 2 + ((i + 0.5) * w) / boards, h / 2 + 0.02, 0.01]} size={[w / boards - 0.025, h - 0.06, 0.02]} color={color} />
          ))}
        </group>
      )
    }
    case 'parasol': {
      const r = Math.min(w, d) / 2
      return (
        <group>
          <Block at={[0, 0.04, 0]} size={[0.45, 0.08, 0.45]} color="#4A4744" />
          <mesh position={[0, h / 2, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, h, 10]} />
            <meshStandardMaterial color="#D9D4CC" roughness={0.4} metalness={0.4} />
          </mesh>
          <mesh position={[0, h - 0.2, 0]} castShadow>
            <coneGeometry args={[r, 0.4, 8, 1, true]} />
            <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )
    }
    case 'lounger': {
      // Lying surface along the depth, with the back raised at the far end.
      const seat = Math.min(0.35, h)
      const back = d * 0.32
      const flat = d - back
      return (
        <group>
          <Block at={[0, seat - 0.03, d / 2 - flat / 2]} size={[w, 0.05, flat]} color={color} />
          <group position={[0, seat, -d / 2 + back]} rotation-x={-0.7}>
            <Block at={[0, 0.02, -back / 2]} size={[w, 0.05, back]} color={color} />
          </group>
          {legs(w - 0.06, d - 0.2, seat - 0.05, 0.04, color)}
        </group>
      )
    }
    case 'grill': {
      const r = Math.min(w, d) / 2
      const bowl = h * 0.72
      return (
        <group>
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.cos(a) * r * 0.55, bowl / 2, Math.sin(a) * r * 0.55]} rotation={[Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]} castShadow>
                <cylinderGeometry args={[0.015, 0.015, bowl, 8]} />
                <meshStandardMaterial color="#8A8783" metalness={0.5} roughness={0.4} />
              </mesh>
            )
          })}
          <mesh position={[0, bowl, 0]} castShadow>
            <sphereGeometry args={[r * 0.85, 24, 16]} />
            <meshStandardMaterial color={color} roughness={0.35} metalness={0.3} />
          </mesh>
          <Block at={[0, bowl + r * 0.9, 0]} size={[0.1, 0.03, 0.03]} color="#2B2B2B" />
        </group>
      )
    }
    case 'stairs': {
      // A straight flight: the front (+z) is the bottom step, the last riser meets the floor above.
      const n = stairSteps(h)
      const rise = h / n
      const run = d / Math.max(1, n - 1)
      const t = 0.04
      const side = 0.05
      const inner = w - 2 * side
      const len = Math.hypot(h, d)
      const slope = Math.atan2(h, d)
      const rail = 0.9
      return (
        <group>
          {Array.from({ length: n }, (_, i) => (
            <group key={i}>
              {/* riser */}
              <Block at={[0, i * rise + (rise - t) / 2, d / 2 - i * run - 0.01]} size={[inner, rise - t, 0.02]} color="#F4EFE6" />
              {/* tread */}
              {i < n - 1 && <Block at={[0, (i + 1) * rise - t / 2, d / 2 - (i + 0.5) * run]} size={[inner, t, run + 0.02]} color={color} rough={0.6} />}
            </group>
          ))}
          {/* stringers along both sides */}
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[(sx * (w - side)) / 2, h / 2 - 0.05, 0]} rotation-x={slope} castShadow receiveShadow>
              <boxGeometry args={[side, 0.3, len]} />
              <meshStandardMaterial color="#F4EFE6" roughness={0.7} />
            </mesh>
          ))}
          {/* handrail on the right, with a post at each end */}
          <mesh position={[w / 2 - side / 2, h / 2 + rail, 0]} rotation-x={slope} castShadow>
            <boxGeometry args={[0.05, 0.05, len]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
          <Block at={[w / 2 - side / 2, (rise + rail) / 2, d / 2 - 0.03]} size={[0.04, rail + rise, 0.04]} color="#F4EFE6" />
          <Block at={[w / 2 - side / 2, h - rise + (rise + rail) / 2, -d / 2 + 0.03]} size={[0.04, rail + rise, 0.04]} color="#F4EFE6" />
        </group>
      )
    }
    case 'rug':
      return (
        <mesh rotation-x={-Math.PI / 2} position-y={0.006} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={photo ? '#ffffff' : color} map={photo ?? undefined} roughness={1} />
        </mesh>
      )
    default:
      return (
        <group>
          <Block at={[0, h / 2, 0]} size={[w, h, d]} color={color} />
          {photo && (
            <mesh position={[0, h / 2, d / 2 + 0.002]}>
              <planeGeometry args={[w * 0.96, h * 0.96]} />
              <meshStandardMaterial map={photo} roughness={0.8} />
            </mesh>
          )}
        </group>
      )
  }
}

function legs(w: number, d: number, h: number, size: number, color: string) {
  return [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].map(([sx, sz], i) => (
    <Block key={`leg${i}`} at={[(sx * w) / 2, h / 2, (sz * d) / 2]} size={[size, h, size]} color={color} />
  ))
}
