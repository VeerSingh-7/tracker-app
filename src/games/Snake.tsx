import { useEffect, useReducer, useRef, useState } from 'react'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { getGameScore, saveGameScore } from '../db'

interface Props { onBack: () => void }

const COLS = 20
const ROWS = 20
const TICK = 140

type Pos = { x: number; y: number }
type Dir = 'up' | 'down' | 'left' | 'right'

interface State {
  snake: Pos[]
  food: Pos
  dir: Dir
  pendingDir: Dir | null
  score: number
  running: boolean
  gameOver: boolean
}

type Action =
  | { type: 'TICK' }
  | { type: 'DIR'; dir: Dir }
  | { type: 'START' }
  | { type: 'RESTART' }

function randomFood(snake: Pos[]): Pos {
  const set = new Set(snake.map(s => `${s.x},${s.y}`))
  let pos: Pos
  do { pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) } }
  while (set.has(`${pos.x},${pos.y}`))
  return pos
}

function initState(): State {
  const snake: Pos[] = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]
  return { snake, food: randomFood(snake), dir: 'right', pendingDir: null, score: 0, running: false, gameOver: false }
}

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'DIR': {
      if (action.dir === OPPOSITE[state.dir]) return state
      return { ...state, pendingDir: action.dir }
    }
    case 'START': return { ...state, running: true }
    case 'RESTART': return { ...initState(), running: true }
    case 'TICK': {
      if (!state.running || state.gameOver) return state
      const dir = state.pendingDir ?? state.dir
      const head = state.snake[0]
      const next: Pos = {
        x: head.x + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0),
        y: head.y + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0),
      }
      if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) {
        return { ...state, dir, pendingDir: null, gameOver: true, running: false }
      }
      // self collision (allow tail position since it will move)
      if (state.snake.slice(0, -1).some(s => s.x === next.x && s.y === next.y)) {
        return { ...state, dir, pendingDir: null, gameOver: true, running: false }
      }
      const ateFood = next.x === state.food.x && next.y === state.food.y
      const newSnake = ateFood ? [next, ...state.snake] : [next, ...state.snake.slice(0, -1)]
      return {
        ...state,
        snake: newSnake,
        food: ateFood ? randomFood(newSnake) : state.food,
        dir,
        pendingDir: null,
        score: ateFood ? state.score + 1 : state.score,
      }
    }
    default: return state
  }
}

export default function Snake({ onBack }: Props) {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const [best, setBest] = useState(0)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    getGameScore('snake').then(s => { if (s) setBest(s.bestScore) })
  }, [])

  // Save best on game over
  useEffect(() => {
    if (state.gameOver && state.score > 0) {
      setBest(b => {
        const nb = Math.max(b, state.score)
        saveGameScore({ gameId: 'snake', bestScore: nb, lastPlayed: format(new Date(), 'yyyy-MM-dd') })
        return nb
      })
    }
  }, [state.gameOver, state.score])

  // Game loop
  useEffect(() => {
    if (!state.running) return
    const id = setInterval(() => dispatch({ type: 'TICK' }), TICK)
    return () => clearInterval(id)
  }, [state.running])

  // Keyboard
  useEffect(() => {
    const map: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
    function onKey(e: KeyboardEvent) {
      if (map[e.key]) { e.preventDefault(); dispatch({ type: 'DIR', dir: map[e.key] }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) return
    let dir: Dir
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left'
    else dir = dy > 0 ? 'down' : 'up'
    dispatch({ type: 'DIR', dir })
  }

  // Build cell lookup
  const snakeSet = new Set(state.snake.map(s => `${s.x},${s.y}`))
  const headKey = `${state.snake[0].x},${state.snake[0].y}`
  const foodKey = `${state.food.x},${state.food.y}`

  function cellClass(key: string): string {
    if (key === headKey) return 'bg-blue-400 rounded-sm'
    if (snakeSet.has(key)) return 'bg-blue-600 rounded-sm'
    if (key === foodKey) return 'bg-red-400 rounded-full'
    return ''
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
            <p className="text-white font-bold text-lg leading-none">{state.score}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">BEST</p>
            <p className="text-blue-400 font-bold text-lg leading-none">{Math.max(best, state.score)}</p>
          </div>
        </div>
        <button onClick={() => dispatch({ type: 'RESTART' })} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Game area */}
      <div
        className="flex-1 flex items-center justify-center p-4"
        style={{ touchAction: 'none' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="w-full max-w-sm">
          {/* Grid */}
          <div
            className="w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800"
            style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, aspectRatio: '1' }}
          >
            {Array.from({ length: ROWS * COLS }, (_, i) => {
              const x = i % COLS
              const y = Math.floor(i / COLS)
              const key = `${x},${y}`
              return (
                <div key={key} className={`w-full h-full ${cellClass(key)}`} />
              )
            })}
          </div>

          {!state.running && !state.gameOver && (
            <div className="text-center mt-4">
              <button
                onClick={() => dispatch({ type: 'START' })}
                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold text-base hover:bg-blue-500 transition-colors"
              >
                Start Game
              </button>
              <p className="text-slate-600 text-xs mt-2">Swipe or use arrow keys</p>
            </div>
          )}
        </div>
      </div>

      {/* Game Over */}
      <AnimatePresence>
        {state.gameOver && (
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
              <p className="text-3xl mb-2">🐍</p>
              <h3 className="text-xl font-bold text-white mb-1">Game Over</h3>
              <p className="text-slate-400 text-sm">Food eaten: <span className="text-white font-bold">{state.score}</span></p>
              <p className="text-blue-400 text-sm mt-0.5">Best: <span className="text-blue-300 font-bold">{Math.max(best, state.score)}</span></p>
              <div className="flex gap-3 mt-6">
                <button onClick={onBack} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm hover:bg-slate-700 transition-colors">Back</button>
                <button onClick={() => dispatch({ type: 'RESTART' })} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-colors">Play Again</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
