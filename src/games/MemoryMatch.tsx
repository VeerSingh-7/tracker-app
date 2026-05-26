import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { getGameScore, saveGameScore } from '../db'

interface Props { onBack: () => void }

const EMOJIS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼']

interface Card {
  id: number
  emoji: string
  flipped: boolean
  matched: boolean
}

function makeCards(): Card[] {
  const pairs = [...EMOJIS, ...EMOJIS]
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]]
  }
  return pairs.map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }))
}

export default function MemoryMatch({ onBack }: Props) {
  const [cards, setCards] = useState<Card[]>(makeCards)
  const [selected, setSelected] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [matchedCount, setMatchedCount] = useState(0)
  const [best, setBest] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [locked, setLocked] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getGameScore('memory').then(s => { if (s) setBest(s.bestScore) })
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  function restart() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setCards(makeCards())
    setSelected([])
    setMoves(0)
    setMatchedCount(0)
    setGameOver(false)
    setLocked(false)
  }

  function handleCardClick(idx: number) {
    if (locked || cards[idx].matched || cards[idx].flipped || selected.length >= 2) return

    const newSelected = [...selected, idx]
    const newCards = cards.map((c, i) => i === idx ? { ...c, flipped: true } : c)
    setCards(newCards)
    setSelected(newSelected)

    if (newSelected.length === 2) {
      const [a, b] = newSelected
      const newMoves = moves + 1
      setMoves(newMoves)
      setLocked(true)

      if (newCards[a].emoji === newCards[b].emoji) {
        // Match
        timeoutRef.current = setTimeout(() => {
          setCards(prev => prev.map((c, i) => [a, b].includes(i) ? { ...c, matched: true } : c))
          setSelected([])
          setLocked(false)
          const newMatched = matchedCount + 1
          setMatchedCount(newMatched)
          if (newMatched === 8) {
            setGameOver(true)
            setBest(prev => {
              const nb = prev === 0 || newMoves < prev ? newMoves : prev
              saveGameScore({ gameId: 'memory', bestScore: nb, lastPlayed: format(new Date(), 'yyyy-MM-dd') })
              return nb
            })
          }
        }, 350)
      } else {
        // No match — flip back
        timeoutRef.current = setTimeout(() => {
          setCards(prev => prev.map((c, i) => [a, b].includes(i) ? { ...c, flipped: false } : c))
          setSelected([])
          setLocked(false)
        }, 900)
      }
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onBack} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-xs text-slate-500">MOVES</p>
            <p className="text-white font-bold text-lg leading-none">{moves}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">PAIRS</p>
            <p className="text-white font-bold text-lg leading-none">{matchedCount}/8</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">BEST</p>
            <p className="text-blue-400 font-bold text-lg leading-none">{best > 0 ? best : '—'}</p>
          </div>
        </div>
        <button onClick={restart} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Game */}
      <div className="flex-1 flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <div className="grid grid-cols-4 gap-3">
            {cards.map((card, i) => (
              <motion.button
                key={card.id}
                onClick={() => handleCardClick(i)}
                whileTap={{ scale: 0.93 }}
                className={`aspect-square rounded-2xl flex items-center justify-center text-3xl transition-all duration-200 border-2 ${
                  card.matched
                    ? 'bg-emerald-500/20 border-emerald-500/50 cursor-default'
                    : card.flipped
                    ? 'bg-slate-800 border-slate-600 cursor-default'
                    : 'bg-blue-600 border-blue-500 hover:bg-blue-500 cursor-pointer'
                }`}
              >
                <AnimatePresence mode="wait">
                  {(card.flipped || card.matched) ? (
                    <motion.span
                      key="front"
                      initial={{ rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      {card.emoji}
                    </motion.span>
                  ) : (
                    <motion.span
                      key="back"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-blue-300 text-xl font-bold"
                    >
                      ?
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>
          <p className="text-center text-slate-600 text-xs mt-4">Find all 8 matching pairs</p>
        </div>
      </div>

      {/* Win overlay */}
      <AnimatePresence>
        {gameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 flex items-center justify-center z-10"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-900 border border-slate-700 rounded-3xl p-8 text-center mx-6 w-full max-w-xs"
            >
              <p className="text-4xl mb-2">🎉</p>
              <h3 className="text-xl font-bold text-white mb-1">You Win!</h3>
              <p className="text-slate-400 text-sm">Solved in <span className="text-white font-bold">{moves} moves</span></p>
              <p className="text-blue-400 text-sm mt-0.5">Best: <span className="text-blue-300 font-bold">{best} moves</span></p>
              <div className="flex gap-3 mt-6">
                <button onClick={onBack} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition-colors">Back</button>
                <button onClick={restart} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-colors">Play Again</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
