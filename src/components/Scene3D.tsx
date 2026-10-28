import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import type { Room } from '../types'
import { centroid } from '../geometry'
import { buildWalls, WALL_THICKNESS, WINDOW_SILL, WINDOW_TOP } from '../walls'
import type { OpeningPiece, WallPiece } from '../walls'

const WALL_COLOR = '#FBF7F0'
const FRAME_COLOR = '#FBF8F2'

export function Scene3D() {
  const fullPlan = useStore((s) => s.plan)
  const cutaway = useStore((s) => s.cutaway)
  // Cutaway mode lowers the walls so you can see into every room from above.
  const plan = useMemo(() => (cutaway ? { ...fullPlan, wallHeight: 1.0 } : fullPlan), [fullPlan, cutaway])
  const { walls, openings } = useMemo(() => buildWalls(plan), [plan])

  const center = useMemo(() => {
    const pts = plan.rooms.flatMap((r) => r.points)
    if (!pts.length) return new THREE.Vector3()
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    return new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...ys) + Math.max(...ys)) / 2)
  }, [plan.rooms])

  return (
    <div className="scene3d">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [center.x + 3, 10, center.z + 9], fov: 40, near: 0.1, far: 200 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.1 }}
      >
        <color attach="background" args={['#F6EFE4']} />
        <fog attach="fog" args={['#F6EFE4', 25, 60]} />
        <hemisphereLight args={['#FFF6E8', '#D9B994', 1.4]} />
        <directionalLight
          position={[center.x + 5, 12, center.z + 8]}
          intensity={2.2}
          color="#FFE8C8"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-bias={-0.0005}
        />
        <ambientLight intensity={0.5} />

        <Ground center={center} />
        {plan.rooms.map((room) => (
          <Floor key={room.id} room={room} />
        ))}
        {walls.map((w, i) => (
          <Wall key={i} piece={w} />
        ))}
        {!cutaway &&
          openings.map((o, i) => (o.kind === 'window' ? <Window key={i} piece={o} /> : <DoorFrame key={i} piece={o} />))}
        {plan.rooms.map((room) => (
          <RoomLabel key={room.id} room={room} />
        ))}

        <ContactShadows position={[center.x, 0.005, center.z]} opacity={0.25} scale={30} blur={2.5} far={4} />
        <OrbitControls
          target={center}
          makeDefault
          enableDamping
          maxPolarAngle={Math.PI / 2 - 0.05}
          minDistance={2}
          maxDistance={40}
        />
      </Canvas>
      <div className="tool-hint">Drag to turn around, scroll to zoom, right-drag to slide.</div>
    </div>
  )
}

function Ground({ center }: { center: THREE.Vector3 }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[center.x, -0.02, center.z]} receiveShadow>
      <circleGeometry args={[30, 64]} />
      <meshStandardMaterial color="#E8DFCF" roughness={1} />
    </mesh>
  )
}

/** Floors use pine planks, except wet rooms which get a grey vinyl look like in the photos. */
function Floor({ room }: { room: Room }) {
  const wet = /bad|bath|wc|vask|laundry/i.test(room.name)
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(room.points.map((p) => new THREE.Vector2(p.x, -p.y)))
    const g = new THREE.ShapeGeometry(shape)
    // Shape is built in the x/-z plane; texture coordinates in meters.
    const uv = g.attributes.uv as THREE.BufferAttribute
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i))
    return g
  }, [room.points])
  const texture = wet ? vinylTexture() : woodTexture()
  return (
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow>
      <meshStandardMaterial map={texture} roughness={wet ? 0.9 : 0.6} />
    </mesh>
  )
}

function Wall({ piece }: { piece: WallPiece }) {
  const { a, b, y0, y1 } = piece
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  return (
    <mesh
      position={[(a.x + b.x) / 2, (y0 + y1) / 2, (a.y + b.y) / 2]}
      rotation-y={-angle}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[len, y1 - y0, WALL_THICKNESS]} />
      <meshStandardMaterial color={WALL_COLOR} roughness={0.85} />
    </mesh>
  )
}

function Window({ piece }: { piece: OpeningPiece }) {
  const { a, b } = piece
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  const h = WINDOW_TOP - WINDOW_SILL
  const frame = 0.06
  return (
    <group position={[(a.x + b.x) / 2, WINDOW_SILL + h / 2, (a.y + b.y) / 2]} rotation-y={-angle}>
      <mesh>
        <boxGeometry args={[len - frame, h - frame, 0.02]} />
        <meshPhysicalMaterial color="#CFE6EE" transmission={0.6} transparent opacity={0.35} roughness={0.05} />
      </mesh>
      {/* Frame: sides, top, sill, and a middle bar like the old windows in the photos */}
      {[
        [-(len - frame) / 2, 0, frame, h],
        [(len - frame) / 2, 0, frame, h],
        [0, (h - frame) / 2, len, frame],
        [0, -(h - frame) / 2, len, frame],
        [0, 0, len, frame * 0.6],
        [0, 0, frame * 0.6, h],
      ].map(([x, y, w, hh], i) => (
        <mesh key={i} position={[x, y, 0]} castShadow>
          <boxGeometry args={[w, hh, WALL_THICKNESS + 0.02]} />
          <meshStandardMaterial color={FRAME_COLOR} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function DoorFrame({ piece }: { piece: OpeningPiece }) {
  const { a, b } = piece
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  const h = 2.05
  const t = 0.05
  return (
    <group position={[(a.x + b.x) / 2, 0, (a.y + b.y) / 2]} rotation-y={-angle}>
      {[
        [-(len - t) / 2, h / 2, t, h],
        [(len - t) / 2, h / 2, t, h],
        [0, h - t / 2, len, t],
      ].map(([x, y, w, hh], i) => (
        <mesh key={i} position={[x, y, 0]} castShadow>
          <boxGeometry args={[w, hh, WALL_THICKNESS + 0.03]} />
          <meshStandardMaterial color={FRAME_COLOR} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function RoomLabel({ room }: { room: Room }) {
  const c = centroid(room.points)
  return (
    <Html position={[c.x, 0.3, c.y]} center distanceFactor={12} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className="room-tag">{room.name}</div>
    </Html>
  )
}

// ---- procedural textures (cached) ------------------------------------------

let wood: THREE.CanvasTexture | null = null
let vinyl: THREE.CanvasTexture | null = null

/** Pale pine planks, 1 texture repeat = 1 meter. */
function woodTexture() {
  if (wood) return wood
  const size = 512
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const planks = 6 // planks per meter, about 16 cm wide
  const pw = size / planks
  const rand = mulberry(7)
  for (let i = 0; i < planks; i++) {
    const base = 30 + rand() * 8
    const light = 68 + rand() * 8
    ctx.fillStyle = `hsl(${base}, 55%, ${light}%)`
    ctx.fillRect(i * pw, 0, pw, size)
    // grain
    for (let g = 0; g < 26; g++) {
      ctx.strokeStyle = `hsla(${base - 6}, 50%, ${light - 14 - rand() * 10}%, ${0.15 + rand() * 0.2})`
      ctx.lineWidth = 0.6 + rand() * 1.2
      ctx.beginPath()
      const x = i * pw + rand() * pw
      ctx.moveTo(x, 0)
      for (let y = 0; y <= size; y += 32) ctx.lineTo(x + Math.sin(y / 60 + g) * 3 * rand(), y)
      ctx.stroke()
    }
    // knots
    if (rand() > 0.4) {
      ctx.fillStyle = `hsla(${base - 8}, 50%, 40%, 0.45)`
      ctx.beginPath()
      ctx.ellipse(i * pw + pw * (0.3 + rand() * 0.4), rand() * size, 3 + rand() * 4, 6 + rand() * 6, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // plank seam and a staggered end joint
    ctx.fillStyle = 'rgba(90, 55, 25, 0.35)'
    ctx.fillRect(i * pw, 0, 1.5, size)
    ctx.fillRect(i * pw, rand() * size, pw, 1.5)
  }
  wood = new THREE.CanvasTexture(c)
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping
  wood.colorSpace = THREE.SRGBColorSpace
  wood.anisotropy = 8
  return wood
}

function vinylTexture() {
  if (vinyl) return vinyl
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#C9C1B6'
  ctx.fillRect(0, 0, size, size)
  const rand = mulberry(3)
  for (let i = 0; i < 2500; i++) {
    const l = 45 + rand() * 30
    ctx.fillStyle = `hsla(30, 8%, ${l}%, 0.5)`
    ctx.fillRect(rand() * size, rand() * size, 1.5, 1.5)
  }
  vinyl = new THREE.CanvasTexture(c)
  vinyl.wrapS = vinyl.wrapT = THREE.RepeatWrapping
  vinyl.colorSpace = THREE.SRGBColorSpace
  return vinyl
}

function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
