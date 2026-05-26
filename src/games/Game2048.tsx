import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { getGameScore, saveGameScore } from '../db'

interface Props { onBack: () => void }

// ─── Grid logic ────────────────────────────────────────────────────────────

function slideRowLeft(row: number[]): { result: number[]; score: number } {
  const compact = row.filter(x => x !== 0)
  const merged: number[] = []
  let score = 0
  let i = 0
  while (i < compact.length) {
    if (i + 1 < compact.length && compact[i] === compact[i + 1]) {
      const val = compact[i] * 2
      merged.push(val)
      score += val
      i += 2
    } else {
      merged.push(compact[i])
      i++
    }
  }
  while (merged.length < 4) merged.push(0)
  return { result: merged, score }
}

function transpose(g: number[][]): number[][] {
  return g[0].map((_, i) => g.map(row => row[i]))
}

function applyLeft(g: number[][]): { grid: number[][]; score: number; changed: boolean } {
  let total = 0; let changed = false
  const grid = g.map(row => {
    const { result, score } = slideRowLeft(row)
    total += score
    if (result.join() !== row.join()) changed = true
    return result
  })
  return { grid, score: total, changed }
}

function applyRight(g: number[][]): { grid: number[][]; score: number; changed: boolean } {
  let total = 0; let changed = false
  const grid = g.map(row => {
    const rev = [...row].reverse()
    const { result, score } = slideRowLeft(rev)
    const final = result.reverse()
    total += score
    if (final.join() !== row.join()) changed = true
    return final
  })
  return { grid, score: total, changed }
}

function applyUp(g: number[][]): { grid: number[][]; score: number; changed: boolean } {
  const { grid: m, score, changed } = applyLeft(transpose(g))
  return { grid: transpose(m), score, changed }
}

function applyDown(g: number[][]): { grid: number[][]; score: number; changed: boolean } {
  const { grid: m, score, changed } = applyRight(transpose(g))
  return { grid: transpose(m), score, changed }
}

function addTile(g: number[][]): number[][] {
  const empty: [number, number][] = []
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (g[r][c] === 0) empty.push([r, c])
  if (!empty.length) return g
  const [r, c] = empty[Math.floor(Math.random() * empty.length)]
  const next = g.map(row => [...row])
  next[r][c] = Math.random() < 0.9 ? 2 : 4
  return next
}

function initGrid(): number[][] {
  return addTile(addTile(Array(4).fill(null).map(() => Array(4).fill(0))))
}

function isOver(g: number[][]): boolean {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      if (g[r][c] === 0) return false
      if (c < 3 && g[r][c] === g[r][c + 1]) return false
      if (r < 3 && g[r][c] === g[r + 1][c]) return false
    }
  return true
}

// ─── Tile styling ───────────────────────────────────────────────────────────

function tileStyle(v: number): string {
  if (v === 0) return 'bg-slate-100 dark:bg-slate-800'
  const map: Record<number, string> = {
    2: 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200',
    4: 'bg-slate-300 dark:bg-slate-600 text-slate-800 dark:text-slate-100',
    8: 'bg-orange-300 text-white',
    16: 'bg-orange-400 text-white',
    32: 'bg-orange-500 text-white',
    64: 'bg-orange-600 text-white',
    128: 'bg-yellow-400 text-slate-900',
    256: 'bg-yellow-500 text-slate-900',
    512: 'bg-yellow-600 text-white',
    1024: 'bg-blue-500 text-white',
    2048: 'bg-blue-600 text-white',
  }
  return map[v] ?? 'bg-blue-700 text-white'
}

function tileText(v: number): string {
  if (v >= 1000) return 'text-base font-extrabold'
  if (v >= 100) return 'text-xl font-extrabold'
  return 'text-2xl font-extrabold'
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Game2048({ onBack }: Props) {
  const [grid, setGrid] = useState<number[][]>(initGrid)
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    getGameScore('2048').then(s => { if (s) setBest(s.bestScore) })
  }, [])

  const handleMove = useCallback((dir: 'left' | 'right' | 'up' | 'down') => {
    if (gameOver) return
    setGrid(prev => {
      const fns = { left: applyLeft, right: applyRight, up: applyUp, down: applyDown }
      const { grid: next, score: gained, changed } = fns[dir](prev)
      if (!changed) return prev
      const withTile = addTile(next)
      setScore(s => {
        const ns = s + gained
        setBest(b => {
          const nb = Math.max(b, ns)
          saveGameScore({ gameId: '2048', bestScore: nb, lastPlayed: format(new Date(), 'yyyy-MM-dd') })
          return nb
        })
        return ns
      })
      if (withTile.flat().includes(2048)) setWon(true)
      if (isOver(withTile)) setGameOver(true)
      return withTile
    })
  }, [gameOver])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const map: Record<string, 'left' | 'right' | 'up' | 'down'> = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      }
      if (map[e.key]) { e.preventDefault(); handleMove(map[e.key]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleMove])

  function restart() {
    setGrid(initGrid())
    setScore(0)
    setGameOver(false)
    setWon(false)
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return
    if (Math.abs(dx) > Math.abs(dy)) handleMove(dx > 0 ? 'right' : 'left')
    else handleMove(dy > 0 ? 'down' : 'up')
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
            <p className="text-xs text-slate-500">SCORE</p>
            <p className="text-white font-bold text-lg leading-none">{score.toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">BEST</p>
            <p className="text-blue-400 font-bold text-lg leading-none">{best.toLocaleString()}</p>
          </div>
        </div>
        <button onClick={restart} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Game */}
      <div
        className="flex-1 flex items-center justify-center p-5"
        style={{ touchAction: 'none' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="w-full max-w-sm">
          {won && !gameOver && (
            <div className="text-center mb-4">
              <span className="bg-yellow-400 text-slate-900 text-sm font-bold px-4 py-1.5 rounded-full">
                🎉 You reached 2048! Keep going!
              </span>
            </div>
          )}
          <div className="grid grid-cols-4 gap-2 bg-slate-800 p-2 rounded-2xl">
            {grid.flat().map((val, i) => (
              <div
                key={i}
                className={`aspect-square rounded-xl flex items-center justify-center transition-all ${tileStyle(val)}`}
              >
                {val > 0 && <span className={tileText(val)}>{val}</span>}
              </div>
            ))}
          </div>
          <p className="text-center text-slate-600 text-xs mt-4">Swipe or use arrow keys</p>
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
              <p className="text-3xl mb-2">🎮</p>
              <h3 className="text-xl font-bold text-white mb-1">Game Over</h3>
              <p className="text-slate-400 text-sm">Score: <span className="text-white font-bold">{score.toLocaleString()}</span></p>
              <p className="text-blue-400 text-sm mt-0.5">Best: <span className="text-blue-300 font-bold">{best.toLocaleString()}</span></p>
              <div className="flex gap-3 mt-6">
                <button onClick={onBack} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition-colors">
                  Back
                </button>
                <button onClick={restart} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-colors">
                  Play Again
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
