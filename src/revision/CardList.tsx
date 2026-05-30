import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ClipboardPaste, Play, Pencil, ChevronDown, MapPin, Filter } from 'lucide-react'
import Modal from '../components/Modal'
import { getRevCards, saveRevCard, deleteRevCard } from '../db'
import { uid } from '../utils'
import type { RevSubject, RevTopic, RevCard } from '../types'
import RevHeader from './RevHeader'
import CardMetaFields, { type CardMeta } from './CardMetaFields'
import { CARD_TYPE_LABEL, distinctThemes, distinctLocations } from './shared'

export interface StudyFilter { theme: string | null; location: string | null }

const EMPTY_META: CardMeta = { cardType: 'basic', themes: [], location: '', reversible: false }

export default function CardList({ subject, topic, onBack, onStudy, onPaste }: {
  subject: RevSubject
  topic: RevTopic
  onBack: () => void
  onStudy: (filter: StudyFilter) => void
  onPaste: () => void
}) {
  const [cards, setCards] = useState<RevCard[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editCard, setEditCard] = useState<RevCard | null>(null)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [meta, setMeta] = useState<CardMeta>(EMPTY_META)
  const [filterTheme, setFilterTheme] = useState<string | null>(null)
  const [filterLocation, setFilterLocation] = useState<string | null>(null)

  const load = () => getRevCards(topic.id).then(setCards)
  useEffect(() => { load() }, [topic.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const themes = distinctThemes(cards)
  const locations = distinctLocations(cards)
  const filtered = cards.filter(c =>
    (!filterTheme || (c.themes ?? []).some(t => t.toLowerCase() === filterTheme.toLowerCase())) &&
    (!filterLocation || (c.location ?? '').toLowerCase() === filterLocation.toLowerCase())
  )
  const filterActive = filterTheme !== null || filterLocation !== null

  const openAdd = () => { setEditCard(null); setFront(''); setBack(''); setMeta(EMPTY_META); setModalOpen(true) }
  const openEdit = (c: RevCard) => {
    setEditCard(c); setFront(c.front); setBack(c.back)
    setMeta({ cardType: c.cardType, themes: c.themes ?? [], location: c.location ?? '', reversible: c.reversible })
    setModalOpen(true)
  }

  const save = async () => {
    if (!front.trim()) return
    if (editCard) {
      await saveRevCard({ ...editCard, front: front.trim(), back: back.trim(), ...meta })
    } else {
      await saveRevCard({
        id: uid(), topicId: topic.id, subjectId: subject.id,
        front: front.trim(), back: back.trim(), createdAt: new Date().toISOString(),
        ...meta,
        // Review-tracking fields — initialised, used in later stages.
        lastReviewed: null, timesReviewed: 0, timesCorrect: 0, timesWrong: 0,
      })
    }
    setModalOpen(false); load()
  }

  const remove = async () => {
    if (!editCard) return
    await deleteRevCard(editCard.id)
    setModalOpen(false); load()
  }

  const patchMeta = (p: Partial<CardMeta>) => setMeta(m => ({ ...m, ...p }))

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      <RevHeader
        title={topic.name}
        subtitle={subject.name}
        accent={subject.colour}
        onBack={onBack}
        right={
          <button onClick={openAdd} className="p-2 rounded-xl" style={{ background: subject.colour }}>
            <Plus size={18} className="text-white" />
          </button>
        }
      />

      {/* Action row */}
      <div className="flex-shrink-0 flex gap-2 px-5 pt-3">
        <button onClick={onPaste}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5"
          style={{ background: 'var(--loft-card)', color: 'var(--loft-text)', border: '1px solid var(--loft-border2)' }}>
          <ClipboardPaste size={15} /> Paste notes
        </button>
        <button onClick={() => onStudy({ theme: filterTheme, location: filterLocation })} disabled={filtered.length === 0}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 text-white"
          style={{ background: subject.colour, opacity: filtered.length ? 1 : 0.4 }}>
          <Play size={15} /> {filterActive ? `Study (${filtered.length})` : 'Study these cards'}
        </button>
      </div>

      {/* STAGE 2 HOOK (quizzes): a "Quiz" action will sit alongside "Study these cards"
          here, launching a quiz over this topic's (filtered) cards. Not built yet. */}

      {/* Filter bar — by theme and/or location */}
      {(themes.length > 0 || locations.length > 0) && (
        <div className="flex-shrink-0 px-5 pt-3">
          <div className="rounded-2xl p-2.5 space-y-2" style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}>
            <div className="flex items-center gap-1.5 px-0.5">
              <Filter size={12} style={{ color: 'var(--loft-muted)' }} />
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Filter</span>
              {filterActive && (
                <button onClick={() => { setFilterTheme(null); setFilterLocation(null) }}
                  className="ml-auto text-[11px] font-semibold" style={{ color: subject.colour }}>Clear</button>
              )}
            </div>
            {themes.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {themes.map(t => {
                  const active = filterTheme?.toLowerCase() === t.toLowerCase()
                  return (
                    <button key={t} onClick={() => setFilterTheme(active ? null : t)}
                      className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: active ? subject.colour : 'var(--loft-card2)', color: active ? '#fff' : 'var(--loft-muted)' }}>
                      {t}
                    </button>
                  )
                })}
              </div>
            )}
            {locations.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {locations.map(l => {
                  const active = filterLocation?.toLowerCase() === l.toLowerCase()
                  return (
                    <button key={l} onClick={() => setFilterLocation(active ? null : l)}
                      className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: active ? subject.colour : 'var(--loft-card2)', color: active ? '#fff' : 'var(--loft-muted)' }}>
                      <MapPin size={11} /> {l}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="scroll-area flex-1 pb-tab-bar">
        <div className="px-5 pt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>
            {filterActive ? `${filtered.length} of ${cards.length}` : cards.length} card{(filterActive ? filtered.length : cards.length) === 1 ? '' : 's'}
          </p>

          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16">
              <p className="text-sm mb-1" style={{ color: 'var(--loft-text)' }}>No flashcards yet</p>
              <p className="text-xs mb-5" style={{ color: 'var(--loft-muted)' }}>Add a card manually or paste your notes to split them.</p>
              <button onClick={openAdd} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: subject.colour }}>
                + Add Card
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--loft-muted)' }}>No cards match the filter.</p>
          ) : (
            <AnimatePresence initial={false}>
              {filtered.map(c => {
                const isOpen = expanded === c.id
                const hasMeta = (c.themes?.length ?? 0) > 0 || !!c.location
                return (
                  <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl overflow-hidden" style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}>
                    <button onClick={() => setExpanded(isOpen ? null : c.id)} className="w-full text-left px-4 py-3 flex items-start gap-2">
                      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: subject.colour }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold whitespace-pre-wrap" style={{ color: 'var(--loft-text)' }}>{c.front}</p>
                        {/* Theme + location chips */}
                        {hasMeta && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {c.location && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)' }}>
                                <MapPin size={9} /> {c.location}
                              </span>
                            )}
                            {(c.themes ?? []).map(t => (
                              <span key={t} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ background: `${subject.colour}22`, color: subject.colour }}>{t}</span>
                            ))}
                          </div>
                        )}
                        {isOpen && c.back && (
                          <p className="text-sm mt-2 pt-2 whitespace-pre-wrap" style={{ color: 'var(--loft-muted)', borderTop: '1px solid var(--loft-border)' }}>{c.back}</p>
                        )}
                      </div>
                      <ChevronDown size={16} className="flex-shrink-0 mt-0.5 transition-transform" style={{ color: 'var(--loft-muted)', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--loft-faint)' }}>
                          {CARD_TYPE_LABEL[c.cardType]}{c.reversible ? ' · reversible' : ''}
                        </span>
                        <button onClick={() => openEdit(c)} className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg"
                          style={{ background: 'var(--loft-bg2)', color: 'var(--loft-text)' }}>
                          <Pencil size={12} /> Edit
                        </button>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Add / edit card modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editCard ? 'Edit Card' : 'New Card'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Front (question / quote / term)</label>
            <textarea value={front} onChange={e => setFront(e.target.value)} rows={3} placeholder="e.g. What is osmosis?"
              className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Back (answer / analysis / definition)</label>
            <textarea value={back} onChange={e => setBack(e.target.value)} rows={4} placeholder="e.g. The diffusion of water across a partially permeable membrane…"
              className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
          </div>

          <CardMetaFields meta={meta} onChange={patchMeta} accent={subject.colour} />

          <button onClick={save} disabled={!front.trim()}
            className="w-full text-white py-3.5 rounded-xl font-semibold text-base" style={{ background: subject.colour, opacity: front.trim() ? 1 : 0.5 }}>
            {editCard ? 'Save Changes' : 'Add Card'}
          </button>
          {editCard && (
            <button onClick={remove} className="w-full border border-rose-200 dark:border-rose-900 text-rose-500 py-3 rounded-xl font-semibold text-sm">
              Delete Card
            </button>
          )}
        </div>
      </Modal>
    </div>
  )
}
