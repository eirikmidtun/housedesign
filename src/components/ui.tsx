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
