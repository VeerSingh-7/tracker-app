import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shuffle, RotateCcw, Check, RefreshCw } from 'lucide-react'
import { getRevCards } from '../db'
import type { RevSubject, RevTopic, RevCard } from '../types'
import RevHeader from './RevHeader'

export default function StudyMode({ subject, topic, onBack }: {
  subject: RevSubject
  topic: RevTopic
  onBack: () => void
}) {
  const [cards, setCards] = useState<RevCard[]>([])
  const [order, setOrder] = useState<number[]>([])
  const [pos, setPos] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [shuffled, setShuffled] = useState(false)
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
    getRevCards(topic.id).then(c => {
      setCards(c)
      setOrder(buildOrder(c.length, false))
      setLoaded(true)
    })
  }, [topic.id, buildOrder])

  const restart = (doShuffle: boolean) => {
    setOrder(buildOrder(cards.length, doShuffle))
    setPos(0); setFlipped(false); setFinished(false); setReviewed(0)
    setShuffled(doShuffle)
  }

  // Advance to next card. `_knewIt` is recorded by the buttons but unused in stage 1.
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

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      <RevHeader
        title="Study"
        subtitle={`${subject.name} · ${topic.name}`}
        accent={subject.colour}
        onBack={onBack}
        right={!finished && cards.length > 0 ? (
          <button onClick={() => restart(!shuffled)}
            className="p-2 rounded-xl" style={{ background: shuffled ? subject.colour : 'var(--loft-card)' }}
            title={shuffled ? 'Shuffle on' : 'Shuffle off'}>
            <Shuffle size={16} style={{ color: shuffled ? '#fff' : 'var(--loft-text)' }} />
          </button>
        ) : undefined}
      />

      <div className="flex-1 flex flex-col px-5 pt-3 pb-tab-bar overflow-hidden">
        {!loaded ? null : cards.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <p className="text-sm" style={{ color: 'var(--loft-muted)' }}>No cards in this topic yet.</p>
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
                <div className="h-full rounded-full transition-all" style={{ width: `${((pos) / order.length) * 100}%`, background: subject.colour }} />
              </div>
              <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--loft-muted)' }}>
                Card {pos + 1} of {order.length}
              </span>
            </div>

            {/* Flashcard */}
            <button
              onClick={() => setFlipped(f => !f)}
              className="flex-1 w-full rounded-3xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden"
              style={{ background: 'var(--loft-card)', border: `1.5px solid ${flipped ? subject.colour : 'var(--loft-border2)'}`, minHeight: 0 }}
            >
              <span className="absolute top-3 left-4 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: flipped ? subject.colour : 'var(--loft-muted)' }}>
                {flipped ? 'Answer' : 'Question'}
              </span>
              <AnimatePresence mode="wait">
                <motion.div
                  key={flipped ? 'back' : 'front'}
                  initial={{ opacity: 0, rotateX: -8 }}
                  animate={{ opacity: 1, rotateX: 0 }}
                  exit={{ opacity: 0, rotateX: 8 }}
                  transition={{ duration: 0.16 }}
                  className="overflow-y-auto scroll-area max-h-full"
                >
                  <p className="text-lg font-semibold whitespace-pre-wrap leading-snug" style={{ color: 'var(--loft-text)' }}>
                    {flipped ? (current?.back || '—') : current?.front}
                  </p>
                </motion.div>
              </AnimatePresence>
              {!flipped && (
                <span className="absolute bottom-3 text-xs flex items-center gap-1" style={{ color: 'var(--loft-muted)' }}>
                  <RotateCcw size={12} /> Tap to flip
                </span>
              )}
            </button>

            {/* Answer buttons (navigate only in stage 1) */}
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
