import { useState } from 'react'
import { X } from 'lucide-react'
import type { RevCardType } from '../types'
import { CARD_TYPES, parseThemes } from './shared'

// Shared editor for the richer card fields: type, themes, location, (optional) reversible.
// Used by the Add/Edit Card form and the paste-to-split preview.
export interface CardMeta {
  cardType: RevCardType
  themes: string[]
  location: string
  reversible: boolean
}

export default function CardMetaFields({ meta, onChange, accent, showReversible = true }: {
  meta: CardMeta
  onChange: (patch: Partial<CardMeta>) => void
  accent: string
  showReversible?: boolean
}) {
  const [themeInput, setThemeInput] = useState('')

  const commitThemes = () => {
    const added = parseThemes(themeInput)
    if (added.length) {
      const merged = [...meta.themes]
      for (const t of added) if (!merged.some(x => x.toLowerCase() === t.toLowerCase())) merged.push(t)
      onChange({ themes: merged })
    }
    setThemeInput('')
  }
  const removeTheme = (t: string) => onChange({ themes: meta.themes.filter(x => x !== t) })

  return (
    <>
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Card type</label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {CARD_TYPES.map(t => {
            const active = meta.cardType === t.value
            return (
              <button key={t.value} type="button" onClick={() => onChange({ cardType: t.value })}
                className="px-3 py-2 rounded-xl text-sm font-semibold transition-colors"
                style={{
                  background: active ? accent : 'var(--loft-card2)',
                  color: active ? '#fff' : 'var(--loft-muted)',
                }}>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Themes</label>
        {meta.themes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {meta.themes.map(t => (
              <span key={t} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: `${accent}22`, color: accent }}>
                {t}
                <button type="button" onClick={() => removeTheme(t)}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <input
          value={themeInput}
          onChange={e => setThemeInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitThemes() } }}
          onBlur={commitThemes}
          placeholder="e.g. ambition, guilt — press Enter"
          className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Location</label>
        <input
          value={meta.location}
          onChange={e => onChange({ location: e.target.value })}
          placeholder='e.g. "Act 1 Scene 5", "Ozymandias"'
          className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {showReversible && (
        <button type="button" onClick={() => onChange({ reversible: !meta.reversible })}
          className="w-full flex items-center justify-between rounded-xl px-4 py-3"
          style={{ background: 'var(--loft-card2)' }}>
          <div className="text-left">
            <p className="text-sm font-semibold" style={{ color: 'var(--loft-text)' }}>Reversible</p>
            <p className="text-xs" style={{ color: 'var(--loft-muted)' }}>Allow studying back → front too</p>
          </div>
          <span className="w-11 h-6 rounded-full flex-shrink-0 relative transition-colors"
            style={{ background: meta.reversible ? accent : 'rgba(255,255,255,0.15)' }}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
              style={{ left: meta.reversible ? '22px' : '2px' }} />
          </span>
        </button>
      )}
    </>
  )
}
