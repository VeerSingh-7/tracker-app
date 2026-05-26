import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { getGameScore, saveGameScore } from '../db'

interface Props { onBack: () => void }

const TOTAL_TIME = 30
const SPAWN_INTERVAL = 700   // ms between spawn attempts
const MOLE_LIFE = 1200       // ms a mole stays up if not whacked

export default function WhackAMole({ onBack }: Props) {
  const [holes, setHoles] = useState<boolean[]>(Array(9).fill(false))
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME)
  const [running, setRunning] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [best, setBest] = useState(0)
  const [whacked, setWhacked] = useState<number | null>(null) // index of just-whacked hole for animation

  const moleTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const spawnRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scoreRef = useRef(0)
  scoreRef.current = score

  useEffect(() => {
    getGameScore('mole').then(s => { if (s) setBest(s.bestScore) })
    return () => stopAll()
  }, [])

  function stopAll() {
    if (spawnRef.current) clearInterval(spawnRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    moleTimers.current.forEach(t => clearTimeout(t))
    moleTimers.current.clear()
  }

  const endGame = useCallback(() => {
    stopAll()
    setRunning(false)
    setHoles(Array(9).fill(false))
    setGameOver(true)
    const finalScore = scoreRef.current
    setBest(prev => {
      const nb = Math.max(prev, finalScore)
      saveGameScore({ gameId: 'mole', bestScore: nb, lastPlayed: format(new Date(), 'yyyy-MM-dd') })
      return nb
    })
  }, [])

  function spawnMole() {
    setHoles(prev => {
      const empty = prev.map((up, i) => up ? -1 : i).filter(i => i !== -1)
      if (empty.length === 0) return prev
      const idx = empty[Math.floor(Math.random() * empty.length)]
      // Schedule auto-hide
      const t = setTimeout(() => {
        setHoles(h => h.map((v, i) => i === idx ? false : v))
        moleTimers.current.delete(idx)
      }, MOLE_LIFE)
      moleTimers.current.set(idx, t)
      return prev.map((v, i) => i === idx ? true : v)
    })
  }

  function startGame() {
    stopAll()
    setScore(0)
    setHoles(Array(9).fill(false))
    setTimeLeft(TOTAL_TIME)
    setGameOver(false)
    setRunning(true)

    spawnRef.current = setInterval(spawnMole, SPAWN_INTERVAL)

    let t = TOTAL_TIME
    timerRef.current = setInterval(() => {
      t -= 1
      setTimeLeft(t)
      if (t <= 0) endGame()
    }, 1000)
  }

  function whackMole(idx: number) {
    if (!running || !holes[idx]) return
    // Cancel the auto-hide timer
    const t = moleTimers.current.get(idx)
    if (t) { clearTimeout(t); moleTimers.current.delete(idx) }
    setHoles(prev => prev.map((v, i) => i === idx ? false : v))
    setScore(s => s + 1)
    setWhacked(idx)
    setTimeout(() => setWhacked(null), 300)
  }

  function restart() {
    startGame()
  }

  // Progress bar colour
  const pct = (timeLeft / TOTAL_TIME) * 100
  const barColor = timeLeft > 10 ? 'bg-blue-500' : timeLeft > 5 ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <div className="h-full flex flex-col bg-slate-950 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onBack} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-xs text-slate-500">SCORE</p>
            <p className="text-white font-bold text-lg leading-none">{score}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">BEST</p>
            <p className="text-blue-400 font-bold text-lg leading-none">{Math.max(best, score)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">TIME</p>
            <p className={`font-bold text-lg leading-none ${timeLeft <= 5 && running ? 'text-rose-400' : 'text-white'}`}>
              {timeLeft}s
            </p>
          </div>
        </div>
        <button onClick={restart} disabled={!running && !gameOver} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30">
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Timer bar */}
      <div className="h-1 bg-slate-800">
        <div className={`h-full transition-all duration-1000 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      {/* Game area */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {!running && !gameOver ? (
            <div className="text-center">
              <p className="text-6xl mb-6">🐭</p>
              <p className="text-white font-bold text-xl mb-2">Whack-a-Mole</p>
              <p className="text-slate-400 text-sm mb-8">Tap moles as fast as you can!<br />You have {TOTAL_TIME} seconds.</p>
              <button
                onClick={startGame}
                className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-blue-500 transition-colors"
              >
                Start!
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {holes.map((up, i) => (
                <motion.button
                  key={i}
                  onClick={() => whackMole(i)}
                  whileTap={{ scale: 0.9 }}
                  className="aspect-square rounded-2xl flex items-center justify-center text-4xl transition-all duration-100 relative overflow-hidden"
                  style={{ background: up ? '#92400e' : '#1e293b', border: up ? '2px solid #b45309' : '2px solid #334155' }}
                >
                  <AnimatePresence>
                    {up && (
                      <motion.span
                        key="mole"
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 30, opacity: 0 }}
                        transition={{ duration: 0.12 }}
                      >
                        🐭
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {/* Whack flash */}
                  <AnimatePresence>
                    {whacked === i && (
                      <motion.div
                        key="flash"
                        initial={{ opacity: 0.8, scale: 0.5 }}
                        animate={{ opacity: 0, scale: 1.8 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.28 }}
                        className="absolute inset-0 rounded-2xl bg-yellow-400 pointer-events-none"
                      />
                    )}
                  </AnimatePresence>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Game Over overlay */}
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
              <p className="text-3xl mb-2">🔨</p>
              <h3 className="text-xl font-bold text-white mb-1">Time's Up!</h3>
              <p className="text-slate-400 text-sm">Whacked: <span className="text-white font-bold">{score}</span></p>
              <p className="text-blue-400 text-sm mt-0.5">Best: <span className="text-blue-300 font-bold">{Math.max(best, score)}</span></p>
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
