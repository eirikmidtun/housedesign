import { create } from 'zustand'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { useStore } from './store'
import type { BackgroundImage, Plan } from './types'

/**
 * Uploading a floor plan drawing (plantegning) to trace over: images and PDFs are turned
 * into a reasonably small JPEG so several floors' drawings still fit in browser storage.
 */

const MAX_SIDE = 2400
/** Architects' floor plans are usually drawn at 1:100, so start from that for PDFs. */
const PDF_SCALE = 100
const METERS_PER_PDF_POINT = (0.0254 / 72) * PDF_SCALE

interface DrawingState {
  busy: boolean
  error: string | null
  /** The PDF last uploaded to a floor, so another page can be picked. */
  pdf: { levelId: string; page: number; pages: number; pixelsPerPoint: number } | null
}

export const useDrawing = create<DrawingState>(() => ({ busy: false, error: null, pdf: null }))

let pdfTask: PDFDocumentLoadingTask | null = null
let pdfDoc: PDFDocumentProxy | null = null

interface Rendered {
  dataUrl: string
  width: number
  height: number
  /** Known scale of the drawing, when the file tells us. */
  metersPerPixel?: number
  /** For PDF pages: how many pixels one PDF point became. */
  pixelsPerPoint?: number
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

/** Puts the file behind the current floor, sized and placed as well as we can guess. */
export async function uploadDrawing(file: File) {
  const { levelId } = useStore.getState()
  useDrawing.setState({ busy: true, error: null })
  try {
    let rendered: Rendered
    if (isPdf(file)) {
      const pdfjs = await loadPdfjs()
      pdfTask?.destroy()
      pdfTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
      pdfDoc = await pdfTask.promise
      rendered = await renderPdfPage(pdfDoc, 1)
      useDrawing.setState({ pdf: { levelId, page: 1, pages: pdfDoc.numPages, pixelsPerPoint: rendered.pixelsPerPoint! } })
    } else {
      rendered = await renderImage(file)
      useDrawing.setState({ pdf: null })
    }
    const { plan, setBackground, setTool, requestFit } = useStore.getState()
    setBackground(placeDrawing(rendered, plan))
    setTool('select')
    requestFit()
  } catch (err) {
    console.error(err)
    useDrawing.setState({
      error: isPdf(file)
        ? "Couldn't read that PDF. Try exporting the page as an image instead."
        : "Couldn't read that image. Try a JPG, PNG or PDF file.",
    })
  } finally {
    useDrawing.setState({ busy: false })
  }
}

/** Shows another page of the uploaded PDF, keeping the drawing's position and scale. */
export async function showPdfPage(page: number) {
  const pdf = useDrawing.getState().pdf
  const bg = useStore.getState().plan.background
  if (!pdfDoc || !pdf || !bg || page < 1 || page > pdf.pages) return
  useDrawing.setState({ busy: true, error: null })
  try {
    const r = await renderPdfPage(pdfDoc, page)
    // Keep any scale set on the previous page: pages of one set of drawings share it.
    useStore.getState().setBackground({
      ...bg,
      dataUrl: r.dataUrl,
      naturalWidth: r.width,
      naturalHeight: r.height,
      metersPerPixel: (bg.metersPerPixel * pdf.pixelsPerPoint) / r.pixelsPerPoint!,
    })
    useDrawing.setState({ pdf: { ...pdf, page, pixelsPerPoint: r.pixelsPerPoint! } })
  } finally {
    useDrawing.setState({ busy: false })
  }
}

/** Turns the drawing a quarter turn clockwise around its centre. */
export async function rotateDrawing() {
  const bg = useStore.getState().plan.background
  if (!bg) return
  const img = await loadImage(bg.dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalHeight
  canvas.height = img.naturalWidth
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(img, 0, 0)
  const w = bg.naturalWidth * bg.metersPerPixel
  const h = bg.naturalHeight * bg.metersPerPixel
  const cx = bg.x + w / 2
  const cy = bg.y + h / 2
  useStore.getState().setBackground({
    ...bg,
    dataUrl: canvas.toDataURL('image/jpeg', 0.85),
    naturalWidth: canvas.width,
    naturalHeight: canvas.height,
    x: cx - h / 2,
    y: cy - w / 2,
  })
}

async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

async function renderPdfPage(doc: PDFDocumentProxy, n: number): Promise<Rendered> {
  const page = await doc.getPage(n)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(4, MAX_SIDE / Math.max(base.width, base.height))
  const viewport = page.getViewport({ scale })
  const canvas = whiteCanvas(Math.round(viewport.width), Math.round(viewport.height))
  await page.render({ canvas, viewport }).promise
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.85),
    width: canvas.width,
    height: canvas.height,
    metersPerPixel: METERS_PER_PDF_POINT / scale,
    pixelsPerPoint: scale,
  }
}

async function renderImage(file: File): Promise<Rendered> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = whiteCanvas(Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k))
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** A canvas filled with white, so transparent drawings don't turn black as JPEG. */
function whiteCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  return canvas
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Lines the drawing up with what is already there: this floor's rooms, or else the floor
 * below. Images have no scale, so they are sized to roughly cover those rooms (or 10 m).
 */
function placeDrawing(r: Rendered, plan: Plan): BackgroundImage {
  const { home } = useStore.getState()
  const below = home.levels[home.levels.findIndex((l) => l.id === plan.id) - 1]
  let pts = plan.rooms.flatMap((room) => room.points)
  if (!pts.length && below) pts = below.rooms.flatMap((room) => room.points)
  const minX = pts.length ? Math.min(...pts.map((p) => p.x)) : 0
  const minY = pts.length ? Math.min(...pts.map((p) => p.y)) : 0
  const spanX = pts.length ? Math.max(...pts.map((p) => p.x)) - minX : 0
  const metersPerPixel = r.metersPerPixel ?? Math.max(spanX * 1.3, 10) / r.width
  return {
    dataUrl: r.dataUrl,
    naturalWidth: r.width,
    naturalHeight: r.height,
    metersPerPixel,
    opacity: 0.6,
    // Leave a margin round the rooms, since drawings usually have one too.
    x: minX - (r.metersPerPixel ? 0 : spanX * 0.15),
    y: minY - (r.metersPerPixel ? 0 : spanX * 0.15),
  }
}
