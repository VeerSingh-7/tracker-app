import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shuffle, RotateCcw, Check, RefreshCw, Repeat, MapPin } from 'lucide-react'
import { getRevCards } from '../db'
import type { RevSubject, RevTopic, RevCard } from '../types'
import RevHeader from './RevHeader'
import { isQuoteCard } from './shared'
import type { StudyFilter } from './CardList'

export default function StudyMode({ subject, topic, filter, onBack }: {
  subject: RevSubject
  topic: RevTopic
  filter: StudyFilter
  onBack: () => void
}) {
  const [cards, setCards] = useState<RevCard[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [pos, setPos] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [shuffled, setShuffled] = useState(false)
  const [reverse, setReverse] = useState(false) // study reversible cards back→front
  const [finished, setFinished] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const buildOrder = useCallback((n: number, doShuffle: boolean) => {
    const arr = Array.from({ length: n }, (_, i) => i)
    if (doShuffle) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
    }
    return arr
  }, [])

  useEffect(() => {
    getRevCards(topic.id).then(all => {
      // Respect the filter passed in from the card list.
      const f = all.filter(c =>
        (!filter.theme || (c.themes ?? []).some(t => t.toLowerCase() === filter.theme!.toLowerCase())) &&
        (!filter.location || (c.location ?? '').toLowerCase() === filter.location!.toLowerCase())
      )
      setCards(f)
      setOrder(buildOrder(f.length, false))
      setLoaded(true)
    })
  }, [topic.id, filter.theme, filter.location, buildOrder])

  const restart = (doShuffle: boolean) => {
    setOrder(buildOrder(cards.length, doShuffle))
    setPos(0); setFlipped(false); setFinished(false); setReviewed(0)
    setShuffled(doShuffle)
  }

  // Advance to next card. `_knewIt` is recorded by the buttons but unused for now.
  // ── STAGE 3 HOOK (spaced repetition) ──────────────────────────────────────
  // This is where a "Got it" / "Need more practice" answer will update the card's
  // review-tracking fields (lastReviewed / timesReviewed / timesCorrect /
  // timesWrong) and schedule its next appearance. For now it only advances.
  const advance = (_knewIt: boolean) => {
    void _knewIt
    setReviewed(r => r + 1)
    if (pos + 1 >= order.length) {
      setFinished(true)
    } else {
      setPos(p => p + 1)
      setFlipped(false)
    }
  }

  const current = cards[order[pos]]
  const anyReversible = cards.some(c => c.reversible)

  // When studying reversed AND this card is reversible, the card's back is shown first.
  const showBackFirst = reverse && !!current?.reversible
  const questionText = showBackFirst ? current?.back : current?.front
  const answerText = showBackFirst ? current?.front : current?.back
  const displayed = flipped ? answerText : questionText
  // The card's "front" is its quote; render it prominently whenever it's on screen.
  const showingFront = (!flipped && !showBackFirst) || (flipped && showBackFirst)
  const quoteStyle = !!current && isQuoteCard(current.cardType) && showingFront
  const hasMeta = !!current && ((current.themes?.length ?? 0) > 0 || !!current.location)

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      <RevHeader
        title="Study"
        subtitle={`${subject.name} · ${topic.name}`}
        accent={subject.colour}
        onBack={onBack}
        right={!finished && cards.length > 0 ? (
          <>
            {anyReversible && (
              <button onClick={() => { setReverse(r => !r); setFlipped(false) }}
                className="p-2 rounded-xl" style={{ background: reverse ? subject.colour : 'var(--loft-card)' }}
                title="Study reversible cards back→front">
                <Repeat size={16} style={{ color: reverse ? '#fff' : 'var(--loft-text)' }} />
              </button>
            )}
            <button onClick={() => restart(!shuffled)}
              className="p-2 rounded-xl" style={{ background: shuffled ? subject.colour : 'var(--loft-card)' }}
              title={shuffled ? 'Shuffle on' : 'Shuffle off'}>
              <Shuffle size={16} style={{ color: shuffled ? '#fff' : 'var(--loft-text)' }} />
            </button>
          </>
        ) : undefined}
      />

      <div className="flex-1 flex flex-col px-5 pt-3 pb-tab-bar overflow-hidden">
        {!loaded ? null : cards.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-sm" style={{ color: 'var(--loft-muted)' }}>
              {filter.theme || filter.location ? 'No cards match the current filter.' : 'No cards in this topic yet.'}
            </p>
            <button onClick={onBack} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold loft-btn-accent">
              Back to cards
            </button>
          </div>
        ) : finished ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-extrabold mb-1" style={{ color: 'var(--loft-text)' }}>Deck complete</h2>
            <p className="text-sm mb-8" style={{ color: 'var(--loft-muted)' }}>Reviewed {reviewed} card{reviewed === 1 ? '' : 's'}</p>
            <div className="flex gap-3 w-full max-w-xs">
              <button onClick={() => restart(shuffled)}
                className="flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
                style={{ background: 'var(--loft-card)', color: 'var(--loft-text)', border: '1px solid var(--loft-border)' }}>
                <RefreshCw size={15} /> Again
              </button>
              <button onClick={onBack}
                className="flex-1 py-3 rounded-2xl font-bold text-sm text-white"
                style={{ background: subject.colour }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Progress */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--loft-card2)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(pos / order.length) * 100}%`, background: subject.colour }} />
              </div>
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--loft-muted)' }}>
                Card {pos + 1} of {order.length}
              </span>
            </div>

            {/* Flashcard */}
            <button
              onClick={() => setFlipped(f => !f)}
              className="flex-1 w-full rounded-3xl p-5 flex flex-col relative overflow-hidden"
              style={{ background: 'var(--loft-card)', border: `1.5px solid ${flipped ? subject.colour : 'var(--loft-border2)'}`, minHeight: 0 }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: flipped ? subject.colour : 'var(--loft-muted)' }}>
                  {flipped ? 'Answer' : 'Question'}{showBackFirst ? ' · reversed' : ''}
                </span>
              </div>

              <div className="flex-1 min-h-0 flex items-center justify-center text-center overflow-y-auto scroll-area py-3">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${flipped ? 'b' : 'f'}-${current?.id}`}
                    initial={{ opacity: 0, rotateX: -8 }}
                    animate={{ opacity: 1, rotateX: 0 }}
                    exit={{ opacity: 0, rotateX: 8 }}
                    transition={{ duration: 0.16 }}
                  >
                    {quoteStyle ? (
                      <p className="text-xl font-semibold italic whitespace-pre-wrap leading-snug" style={{ color: 'var(--loft-text)' }}>
                        “{displayed}”
                      </p>
                    ) : (
                      <p className="text-lg font-semibold whitespace-pre-wrap leading-snug" style={{ color: 'var(--loft-text)' }}>
                        {displayed || '—'}
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Theme + location chips */}
              {hasMeta && (
                <div className="flex flex-wrap gap-1.5 justify-center mb-1">
                  {current!.location && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)' }}>
                      <MapPin size={10} /> {current!.location}
                    </span>
                  )}
                  {(current!.themes ?? []).map(t => (
                    <span key={t} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `${subject.colour}22`, color: subject.colour }}>{t}</span>
                  ))}
                </div>
              )}
              {!flipped && (
                <span className="text-xs flex items-center justify-center gap-1" style={{ color: 'var(--loft-muted)' }}>
                  <RotateCcw size={12} /> Tap to flip
                </span>
              )}
            </button>

            {/* Answer buttons (navigate only for now) */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => advance(false)}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
                style={{ background: 'var(--loft-card)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)' }}
              >
                <RotateCcw size={15} /> Need more practice
              </button>
              <button
                onClick={() => advance(true)}
                className="flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 text-white"
                style={{ background: '#22c55e' }}
              >
                <Check size={15} /> Got it
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
