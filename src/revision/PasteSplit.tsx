import { useState } from 'react'
import { Trash2, Wand2, Info } from 'lucide-react'
import { saveRevCards } from '../db'
import { uid } from '../utils'
import type { RevSubject, RevTopic, RevCard } from '../types'
import RevHeader from './RevHeader'
import CardMetaFields, { type CardMeta } from './CardMetaFields'
import { PARSE_FORMATS, parseNotes, type ParseFormat, type DraftCard } from './shared'

export default function PasteSplit({ subject, topic, onBack, onDone }: {
  subject: RevSubject
  topic: RevTopic
  onBack: () => void
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [format, setFormat] = useState<ParseFormat>('qa')
  const [drafts, setDrafts] = useState<DraftCard[] | null>(null)
  // Optional metadata applied to ALL cards added from this batch.
  const [meta, setMeta] = useState<CardMeta>({ cardType: 'basic', themes: [], location: '', reversible: false })

  const split = () => {
    setDrafts(parseNotes(text, format))
  }

  const updateDraft = (i: number, key: 'front' | 'back', value: string) => {
    setDrafts(d => d ? d.map((c, idx) => idx === i ? { ...c, [key]: value } : c) : d)
  }
  const removeDraft = (i: number) => {
    setDrafts(d => d ? d.filter((_, idx) => idx !== i) : d)
  }

  const addAll = async () => {
    if (!drafts) return
    const valid = drafts.filter(d => d.front.trim())
    if (valid.length === 0) return
    const now = new Date().toISOString()
    const cards: RevCard[] = valid.map(d => ({
      id: uid(),
      topicId: topic.id,
      subjectId: subject.id,
      front: d.front.trim(),
      back: d.back.trim(),
      createdAt: now,
      // Batch metadata (still reformatting only — content comes from the paste).
      cardType: meta.cardType,
      themes: meta.themes,
      location: meta.location.trim(),
      reversible: meta.reversible,
      // Review-tracking fields — initialised, used in later stages.
      lastReviewed: null,
      timesReviewed: 0,
      timesCorrect: 0,
      timesWrong: 0,
    }))
    await saveRevCards(cards)
    onDone()
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      <RevHeader title="Paste notes" subtitle={topic.name} accent={subject.colour} onBack={onBack} />

      <div className="scroll-area flex-1 pb-tab-bar">
        <div className="px-5 pt-4 space-y-4">
          {/* Accuracy note */}
          <div className="flex items-start gap-2 rounded-2xl p-3" style={{ background: 'rgba(59,158,255,0.08)', border: '1px solid rgba(59,158,255,0.18)' }}>
            <Info size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--loft-accent)' }} />
            <p className="text-xs leading-snug" style={{ color: 'var(--loft-muted)' }}>
              This tool only reformats text you paste — it doesn't generate content, so your cards stay accurate to your own notes.
            </p>
          </div>

          {/* Paste area */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Your notes</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={7}
              placeholder={"Paste your notes here…"}
              className="w-full mt-1.5 rounded-xl px-4 py-3 text-sm resize-y"
              style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border2)', color: 'var(--loft-text)' }}
            />
          </div>

          {/* Format selector */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>How are your notes structured?</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {PARSE_FORMATS.map(f => {
                const active = format === f.value
                return (
                  <button key={f.value} onClick={() => setFormat(f.value)}
                    className="text-left rounded-xl px-3 py-2.5 transition-colors"
                    style={{
                      background: active ? `${subject.colour}22` : 'var(--loft-card)',
                      border: `1.5px solid ${active ? subject.colour : 'var(--loft-border)'}`,
                    }}>
                    <p className="text-sm font-bold" style={{ color: active ? subject.colour : 'var(--loft-text)' }}>{f.label}</p>
                    <p className="text-[11px] leading-tight mt-0.5" style={{ color: 'var(--loft-muted)' }}>{f.hint}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <button onClick={split} disabled={!text.trim()}
            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 loft-btn-accent"
            style={{ opacity: text.trim() ? 1 : 0.4 }}>
            <Wand2 size={16} /> Split into cards
          </button>

          {/* Preview */}
          {drafts && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>
                  Draft cards ({drafts.length})
                </p>
              </div>

              {drafts.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--loft-muted)' }}>
                  No cards found with that format. Try a different structure.
                </p>
              ) : (
                <>
                  {drafts.map((d, i) => (
                    <div key={i} className="rounded-2xl p-3" style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--loft-muted)' }}>Card {i + 1}</span>
                        <button onClick={() => removeDraft(i)} className="p-1 rounded-lg" style={{ color: '#ef4444' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <textarea value={d.front} onChange={e => updateDraft(i, 'front', e.target.value)} rows={1}
                        placeholder="Front"
                        className="w-full rounded-lg px-3 py-2 text-sm mb-2 resize-y"
                        style={{ background: 'var(--loft-bg2)', border: '1px solid var(--loft-border)', color: 'var(--loft-text)' }} />
                      <textarea value={d.back} onChange={e => updateDraft(i, 'back', e.target.value)} rows={2}
                        placeholder="Back"
                        className="w-full rounded-lg px-3 py-2 text-sm resize-y"
                        style={{ background: 'var(--loft-bg2)', border: '1px solid var(--loft-border)', color: 'var(--loft-muted)' }} />
                    </div>
                  ))}

                  {/* Optional metadata applied to every card in this batch */}
                  <div className="rounded-2xl p-3 space-y-4" style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--loft-muted)' }}>
                      Apply to all these cards (optional)
                    </p>
                    <CardMetaFields meta={meta} onChange={p => setMeta(m => ({ ...m, ...p }))} accent={subject.colour} showReversible={false} />
                  </div>

                  <button onClick={addAll}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm text-white"
                    style={{ background: subject.colour }}>
                    Add all {drafts.filter(d => d.front.trim()).length} cards
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
