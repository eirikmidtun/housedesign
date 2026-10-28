import { useState } from 'react'
import type { ReactNode } from 'react'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export function LengthInput({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value.toFixed(2).replace('.', ',')
  const commitDraft = () => {
    if (draft === null) return
    const v = parseFloat(draft.replace(',', '.'))
    setDraft(null)
    if (v > 0 && Math.abs(v - value) > 0.0005) onCommit(v)
  }
  return (
    <label className="length-input">
      <span className="wall-no">{label}</span>
      <input
        inputMode="decimal"
        value={shown}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(null)
        }}
      />
      <span className="unit">m</span>
    </label>
  )
}

const DISMISSED_KEY = 'husdesign.dismissedHints'

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
  } catch {
    return []
  }
}

/** A floating help text the user can close. Closed hints stay closed on this device. */
export function Hint({ id, children }: { id: string; children: ReactNode }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  if (dismissed.includes(id)) return null
  const close = () => {
    const next = [...dismissed, id]
    setDismissed(next)
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
    } catch {
      // Without storage the hint just comes back next visit.
    }
  }
  return (
    <div className="tool-hint">
      <span>{children}</span>
      <button className="hint-close" onClick={close} aria-label="Hide this tip">
        ×
      </button>
    </div>
  )
}
