import type { FurnitureKind } from './types'

export interface FurniturePreset {
  kind: FurnitureKind
  label: string
  /** Typical size in meters: width, depth, height. */
  size: [number, number, number]
  color: string
  /** Things that belong outside. */
  outdoor?: boolean
  /** Not offered as furniture; added with its own button (stairs). */
  special?: boolean
}

export const PRESETS: FurniturePreset[] = [
  { kind: 'sofa', label: 'Sofa', size: [2.0, 0.9, 0.8], color: '#3E4A63' },
  { kind: 'bed', label: 'Bed', size: [1.6, 2.0, 0.9], color: '#EDE7DD' },
  { kind: 'table', label: 'Table', size: [1.2, 0.75, 0.74], color: '#B98A5E' },
  { kind: 'chair', label: 'Chair', size: [0.48, 0.52, 0.85], color: '#C49A6C' },
  { kind: 'shelf', label: 'Shelf', size: [0.8, 0.35, 1.8], color: '#F2EEE6' },
  { kind: 'cabinet', label: 'Cabinet', size: [0.8, 0.45, 0.9], color: '#F2EEE6' },
  { kind: 'lamp', label: 'Lamp', size: [0.35, 0.35, 1.5], color: '#2E2A27' },
  { kind: 'plant', label: 'Plant', size: [0.45, 0.45, 1.0], color: '#6F8A55' },
  { kind: 'rug', label: 'Rug', size: [1.6, 2.3, 0.01], color: '#D8C3A5' },
  { kind: 'box', label: 'Other', size: [0.6, 0.6, 0.6], color: '#D9C2A3' },
  { kind: 'stairs', label: 'Stairs', size: [0.9, 3.6, 2.65], color: '#C9A27A', special: true },
  { kind: 'tree', label: 'Tree', size: [2.6, 2.6, 4.5], color: '#6C9150', outdoor: true },
  { kind: 'bush', label: 'Bush', size: [0.9, 0.9, 0.8], color: '#5F7F45', outdoor: true },
  { kind: 'hedge', label: 'Hedge', size: [2.0, 0.6, 1.2], color: '#4F6F3A', outdoor: true },
  { kind: 'fence', label: 'Fence', size: [2.0, 0.08, 1.0], color: '#E9E3D8', outdoor: true },
  { kind: 'parasol', label: 'Parasol', size: [2.5, 2.5, 2.4], color: '#F1E6D2', outdoor: true },
  { kind: 'lounger', label: 'Sun lounger', size: [0.65, 1.9, 0.35], color: '#B9905F', outdoor: true },
  { kind: 'grill', label: 'Grill', size: [0.6, 0.55, 1.05], color: '#2F2C2A', outdoor: true },
]

export const presetFor = (kind: FurnitureKind) => PRESETS.find((p) => p.kind === kind)!

/** Guesses the kind of furniture from words in a name or a product link. */
export function guessKind(text: string): FurnitureKind | null {
  const t = text.toLowerCase()
  const words: [FurnitureKind, RegExp][] = [
    // Outdoor words first: "solseng" and "liggestol" would otherwise read as a bed and a chair.
    ['parasol', /parasol|umbrella/],
    ['lounger', /lounger|solseng|sunbed|deck ?chair|liggestol/],
    ['grill', /grill|bbq|barbecue/],
    ['fence', /fence|gjerde|levegg|rekkverk/],
    ['hedge', /hedge|hekk/],
    ['tree', /\btree|\btre\b|epletre|bjørk/],
    ['bush', /bush|busk/],
    ['sofa', /sofa|couch|settee|divan|sovesofa/],
    ['bed', /\bbed|seng|mattress|madrass/],
    ['rug', /rug|carpet|teppe|matte/],
    ['table', /table|bord|desk|skrivebord/],
    ['chair', /chair|stol|stool|krakk|armchair|lenestol/],
    ['shelf', /shel|hylle|bookcase|bokhylle|reol/],
    ['cabinet', /cabinet|skap|dresser|kommode|drawer|sideboard|skjenk|tv-benk|tv bench/],
    ['lamp', /lamp|lampe|light|lys/],
    ['plant', /plant|blomst|flower|potte/],
  ]
  for (const [kind, re] of words) if (re.test(t)) return kind
  return null
}

/** Turns the last useful part of a product link into a readable name. */
export function nameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const slug = parts.reverse().find((p) => /[a-z]{3,}/i.test(p) && !/^(p|products?|produkt|item|dp)$/i.test(p)) ?? u.hostname
    const words = slug
      .replace(/\.[a-z]+$/i, '')
      .split(/[-_+]/)
      .filter((w) => w && !/^\d+$/.test(w) && !/^[a-z]?\d{5,}$/i.test(w))
    const name = words.slice(0, 5).join(' ')
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : u.hostname
  } catch {
    return 'New item'
  }
}

export const looksLikeImageUrl = (url: string) => /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url)

/**
 * Loads an image (a file or a URL), shrinks it to a small thumbnail and finds its main
 * colour. Near-white pixels are ignored because product photos usually sit on white.
 * Images from other sites may refuse to be read; then only the URL is kept.
 */
export async function readImage(source: File | string): Promise<{ image?: string; color?: string }> {
  const src = typeof source === 'string' ? source : await fileToDataUrl(source)
  const img = new Image()
  if (typeof source === 'string') img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('The image could not be loaded.'))
    img.src = src
  })
  const max = 320
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k))
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    return { image: canvas.toDataURL('image/jpeg', 0.82), color: mainColor(data) }
  } catch {
    // Tainted canvas: the other site does not allow reading the pixels.
    return {}
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function mainColor(data: Uint8ClampedArray) {
  // Bucket colours coarsely and take the biggest bucket's average.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += 16) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    if (a < 128) continue
    if (r > 232 && g > 232 && b > 232) continue
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++
    e.r += r
    e.g += g
    e.b += b
    buckets.set(key, e)
  }
  let best: { n: number; r: number; g: number; b: number } | null = null
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e
  if (!best) return '#EEEAE3'
  const hex = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, '0')
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`
}
