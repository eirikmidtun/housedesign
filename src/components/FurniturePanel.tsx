import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { FurnitureItem, FurnitureKind } from '../types'
import { centroid, polygonArea } from '../geometry'
import { PRESETS, guessKind, looksLikeImageUrl, nameFromUrl, presetFor, readImage } from '../furniture'
import { LengthInput, Section } from './ui'

type Draft = Omit<FurnitureItem, 'id' | 'x' | 'y' | 'rotation'>

/** Panel for adding furniture from a photo, a link, or a ready-made shape. */
export function FurniturePanel() {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const startDraft = (kind: FurnitureKind, extra: Partial<Draft> = {}) => {
    const p = presetFor(kind)
    setDraft({
      name: extra.name ?? p.label,
      kind,
      width: p.size[0],
      depth: p.size[1],
      height: p.size[2],
      color: p.color,
      ...extra,
    })
  }

  const fromFile = async (file: File) => {
    setBusy(true)
    setNote(null)
    try {
      const { image, color } = await readImage(file)
      const name = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')
      const kind = guessKind(name) ?? 'box'
      startDraft(kind, { name: /^(image|img|photo|screenshot|bilde)/i.test(name) ? presetFor(kind).label : name, image, ...(color ? { color } : {}) })
    } catch {
      setNote('That file could not be opened as an image.')
    } finally {
      setBusy(false)
    }
  }

  const fromLink = async () => {
    const url = link.trim()
    if (!/^https?:\/\//i.test(url)) return setNote('Paste a full link starting with https://')
    setBusy(true)
    setNote(null)
    const name = nameFromUrl(url)
    const kind = guessKind(url) ?? 'box'
    let extra: Partial<Draft> = {}
    if (looksLikeImageUrl(url)) {
      try {
        extra = await readImage(url)
        if (!extra.image) setNote("That site doesn't let other pages read its images, so I used a standard colour. You can set the colour below.")
      } catch {
        setNote("The image at that link couldn't be loaded. Pick the colour below instead.")
      }
    } else {
      setNote('Product pages can’t be read directly yet. Check the type and size below, or upload a photo of it.')
    }
    startDraft(kind, { name, sourceUrl: url, ...extra })
    setLink('')
    setBusy(false)
  }

  // Pasting an image anywhere in the app starts a new item from it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'file') return
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) {
        e.preventDefault()
        fromFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const place = () => {
    if (!draft) return
    const { plan, addFurniture } = useStore.getState()
    // Drop it in the middle of the biggest room, nudged so new items don't stack exactly.
    const room = [...plan.rooms].sort((a, b) => polygonArea(b.points) - polygonArea(a.points))[0]
    const c = room ? centroid(room.points) : { x: 0, y: 0 }
    const n = (plan.furniture ?? []).length % 5
    addFurniture({ ...draft, x: c.x + n * 0.15, y: c.y + n * 0.15, rotation: 0 })
    setDraft(null)
    setNote(null)
  }

  if (draft) {
    return (
      <Section title="New furniture">
        {draft.image && <img className="furniture-photo" src={draft.image} alt="" />}
        <label className="field">
          <span>Name</span>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <KindPicker
          value={draft.kind}
          onChange={(kind) => {
            const p = presetFor(kind)
            setDraft({ ...draft, kind, width: p.size[0], depth: p.size[1], height: p.size[2] })
          }}
        />
        <SizeFields item={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
        <ColorField value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
        {note && <p className="help">{note}</p>}
        <div className="row">
          <button onClick={() => setDraft(null)}>Cancel</button>
          <button className="primary" onClick={place}>
            Place in home
          </button>
        </div>
      </Section>
    )
  }

  return (
    <Section title="Add furniture">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) fromFile(f)
        }}
      />
      <button
        className="drop-zone"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'))
          if (f) fromFile(f)
        }}
      >
        <strong>{busy ? 'Reading the photo…' : 'Add from a photo'}</strong>
        <span>Click, drop or paste an image</span>
      </button>
      <form
        className="link-row"
        onSubmit={(e) => {
          e.preventDefault()
          fromLink()
        }}
      >
        <input
          id="furniture-link"
          placeholder="…or paste a link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <button type="submit" disabled={busy || !link.trim()}>
          Add
        </button>
      </form>
      {note && <p className="help error">{note}</p>}
      <p className="help">Or start from a shape:</p>
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button key={p.kind} onClick={() => startDraft(p.kind)}>
            {p.label}
          </button>
        ))}
      </div>
    </Section>
  )
}

/** Editing panel for the furniture item that is selected. */
export function SelectedFurniturePanel({ id }: { id: string }) {
  const item = useStore((s) => (s.plan.furniture ?? []).find((f) => f.id === id))
  const { updateFurniture, deleteSelected, addFurniture } = useStore.getState()
  if (!item) return null
  const update = (patch: Partial<FurnitureItem>) => updateFurniture(id, patch)
  const rotate = (deg: number) => update({ rotation: (((item.rotation + deg) % 360) + 360) % 360 })
  return (
    <Section title="Selected furniture">
      {item.image && <img className="furniture-photo" src={item.image} alt="" />}
      <label className="field">
        <span>Name</span>
        <input value={item.name} onChange={(e) => update({ name: e.target.value })} />
      </label>
      <KindPicker value={item.kind} onChange={(kind) => update({ kind })} />
      <SizeFields item={item} onChange={update} />
      <ColorField value={item.color} onChange={(color) => update({ color })} />
      <div className="field">
        <span>Turn · {Math.round(item.rotation)}°</span>
        <div className="row">
          <button onClick={() => rotate(-90)} title="Turn 90° left">⟲ 90°</button>
          <button onClick={() => rotate(-15)} title="Turn 15° left">⟲ 15°</button>
          <button onClick={() => rotate(15)} title="Turn 15° right">15° ⟳</button>
          <button onClick={() => rotate(90)} title="Turn 90° right">90° ⟳</button>
        </div>
      </div>
      {item.sourceUrl && (
        <p className="help source-link">
          From{' '}
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
            {safeHost(item.sourceUrl)}
          </a>
        </p>
      )}
      <p className="help">Drag it around in the 3D view or on the floor plan.</p>
      <div className="row">
        <button
          onClick={() => {
            const { id: _id, ...rest } = item
            addFurniture({ ...rest, x: item.x + 0.3, y: item.y + 0.3 })
          }}
        >
          Duplicate
        </button>
        <button className="danger" onClick={deleteSelected}>
          Remove
        </button>
      </div>
    </Section>
  )
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function KindPicker({ value, onChange }: { value: FurnitureKind; onChange: (k: FurnitureKind) => void }) {
  return (
    <div className="field">
      <span>Type</span>
      <div className="chips">
        {PRESETS.map((p) => (
          <button key={p.kind} className={`chip ${value === p.kind ? 'active' : ''}`} onClick={() => onChange(p.kind)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SizeFields({ item, onChange }: { item: Draft; onChange: (patch: Partial<Draft>) => void }) {
  return (
    <div className="field">
      <span>Size (width, depth, height)</span>
      <div className="size-grid">
        <LengthInput label="W" value={item.width} onCommit={(width) => onChange({ width })} />
        <LengthInput label="D" value={item.depth} onCommit={(depth) => onChange({ depth })} />
        <LengthInput label="H" value={item.height} onCommit={(height) => onChange({ height })} />
      </div>
    </div>
  )
}

function ColorField({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <label className="field color-field">
      <span>Colour</span>
      <span className="color-row">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  )
}
