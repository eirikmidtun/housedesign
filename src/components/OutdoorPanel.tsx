import { useStore } from '../store'
import type { AreaKind } from '../types'
import { polygonArea } from '../geometry'
import { AREA_PRESETS, DEFAULT_DECK_HEIGHT, OUTDOOR_PRESETS, outdoorSpot } from '../outdoor'
import { LengthInput, Section } from './ui'

/**
 * Everything for designing outside: surfaces to draw on the floor plan (decks, lawn, paths)
 * and things to put on them. In the 3D view, picking a surface switches to the floor plan.
 */
export function OutdoorPanel({ onDraw }: { onDraw?: () => void }) {
  const tool = useStore((s) => s.tool)
  const areaKind = useStore((s) => s.areaKind)
  const { drawArea, setTool, addFurniture } = useStore.getState()

  const draw = (kind: AreaKind) => {
    if (tool === 'area' && areaKind === kind) return setTool('select')
    onDraw?.()
    drawArea(kind)
  }

  const place = (i: number) => {
    const p = OUTDOOR_PRESETS[i]
    const { plan } = useStore.getState()
    const spot = outdoorSpot(plan, p.size[0], p.size[1])
    addFurniture({
      name: p.label,
      kind: p.kind,
      width: p.size[0],
      depth: p.size[1],
      height: p.size[2],
      color: p.color,
      x: spot.x,
      y: spot.y,
      rotation: 0,
    })
  }

  return (
    <Section title="Outside">
      <p className="help">Draw a surface, then drag on the plan outside the walls.</p>
      <div className="chips area-chips">
        {AREA_PRESETS.map((a) => (
          <button
            key={a.kind}
            className={`chip ${tool === 'area' && areaKind === a.kind ? 'active' : ''}`}
            onClick={() => draw(a.kind)}
          >
            <span className={`area-swatch area-swatch-${a.kind}`} />
            {a.label}
          </button>
        ))}
      </div>
      <p className="help">Add to the garden:</p>
      <div className="preset-grid">
        {OUTDOOR_PRESETS.map((p, i) => (
          <button key={p.label} onClick={() => place(i)}>
            {p.label}
          </button>
        ))}
      </div>
    </Section>
  )
}

/** Editing panel for the selected deck, lawn or path. */
export function SelectedAreaPanel({ id }: { id: string }) {
  const area = useStore((s) => s.plan.outdoor?.find((a) => a.id === id))
  const { updateArea, deleteSelected } = useStore.getState()
  if (!area) return null
  const deck = area.kind === 'deck'
  return (
    <Section title={`Selected ${deck ? 'deck' : 'area'} · ${polygonArea(area.points).toFixed(1).replace('.', ',')} m²`}>
      <label className="field">
        <span>Name</span>
        <input value={area.name} onChange={(e) => updateArea(id, { name: e.target.value })} />
      </label>
      <div className="field">
        <span>Surface</span>
        <div className="chips">
          {AREA_PRESETS.map((a) => (
            <button
              key={a.kind}
              className={`chip ${area.kind === a.kind ? 'active' : ''}`}
              onClick={() =>
                updateArea(id, { kind: a.kind, height: a.kind === 'deck' ? (area.height ?? DEFAULT_DECK_HEIGHT) : undefined })
              }
            >
              <span className={`area-swatch area-swatch-${a.kind}`} />
              {a.label}
            </button>
          ))}
        </div>
      </div>
      {deck && (
        <>
          <div className="field">
            <span>Height above the floor inside</span>
            <LengthInput
              label="↕"
              value={area.height ?? DEFAULT_DECK_HEIGHT}
              onCommit={(height) => updateArea(id, { height: Math.min(3, height) })}
            />
          </div>
          <label className="check-row">
            <input type="checkbox" checked={!!area.railing} onChange={(e) => updateArea(id, { railing: e.target.checked })} />
            Railing along the open sides
          </label>
        </>
      )}
      <p className="help">Drag it to move it. Drag the corners to change its shape, or the + on an edge to add a corner.</p>
      <div className="row">
        <span />
        <button className="danger" onClick={deleteSelected}>
          Remove
        </button>
      </div>
    </Section>
  )
}
