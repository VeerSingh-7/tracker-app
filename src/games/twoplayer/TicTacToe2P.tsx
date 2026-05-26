import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { saveGameScore, getGameScore } from '../../db'
import type { TwoPlayerGameProps } from './types'

type Cell = 'X' | 'O' | null
const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]

function checkWinner(b: Cell[]): { sym: Cell | 'draw'; line: number[] | null } {
  for (const line of WIN_LINES) {
    const [a, c1, c2] = line
    if (b[a] && b[a] === b[c1] && b[a] === b[c2]) return { sym: b[a], line }
  }
  if (b.every(c => c !== null)) return { sym: 'draw', line: null }
  return { sym: null, line: null }
}

function randomMove(b: Cell[]) {
  const e = b.reduce<number[]>((a, c, i) => (c === null ? [...a, i] : a), [])
  return e[Math.floor(Math.random() * e.length)]
}

function mediumMove(b: Cell[], ai: Cell, hu: Cell): number {
  for (const [a, b1, c] of WIN_LINES) {
    const cells = [b[a], b[b1], b[c]]
    if (cells.filter(x => x === ai).length === 2 && cells.includes(null))
      return [a, b1, c][cells.indexOf(null)]
  }
  for (const [a, b1, c] of WIN_LINES) {
    const cells = [b[a], b[b1], b[c]]
    if (cells.filter(x => x === hu).length === 2 && cells.includes(null))
      return [a, b1, c][cells.indexOf(null)]
  }
  if (b[4] === null) return 4
  const corners = [0, 2, 6, 8].filter(i => b[i] === null)
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)]
  return randomMove(b)
}

function minimax(b: Cell[], isMax: boolean, ai: Cell, hu: Cell, depth = 0): number {
  const { sym } = checkWinner(b)
  if (sym === ai) return 10 - depth
  if (sym === hu) return depth - 10
  if (sym === 'draw') return 0
  const empty = b.reduce<number[]>((a, c, i) => (c === null ? [...a, i] : a), [])
  if (!empty.length) return 0
  if (isMax) {
    let best = -Infinity
    for (const i of empty) { b[i] = ai; best = Math.max(best, minimax(b, false, ai, hu, depth + 1)); b[i] = null }
    return best
  } else {
    let best = Infinity
    for (const i of empty) { b[i] = hu; best = Math.min(best, minimax(b, true, ai, hu, depth + 1)); b[i] = null }
    return best
  }
}

function hardMove(b: Cell[], ai: Cell, hu: Cell): number {
  const empty = b.reduce<number[]>((a, c, i) => (c === null ? [...a, i] : a), [])
  let best = -Infinity, move = empty[0]
  for (const i of empty) {
    b[i] = ai
    const v = minimax(b, false, ai, hu)
    b[i] = null
    if (v > best) { best = v; move = i }
  }
  return move
}

export default function TicTacToe2P({ mode, difficulty = 'medium', onBack, onGameEnd, tournamentMode }: TwoPlayerGameProps) {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null))
  const [turn, setTurn] = useState<1 | 2>(1)
  const [result, setResult] = useState<{ winner: 'p1' | 'p2' | 'draw'; line: number[] | null } | null>(null)
  const [aiThinking, setAiThinking] = useState(false)

  const saveScore = async (w: 'p1' | 'p2' | 'draw') => {
    const id = `tictactoe_${mode === 'ai' ? `ai_${difficulty}` : '2p'}`
    const existing = await getGameScore(id)
    const wins = (existing?.bestScore ?? 0) + (w === 'p1' ? 1 : 0)
    await saveGameScore({ gameId: id, bestScore: wins, lastPlayed: new Date().toISOString() })
  }

  const doAI = useCallback((b: Cell[]) => {
    setAiThinking(true)
    setTimeout(() => {
      const ai: Cell = 'O', hu: Cell = 'X'
      let idx: number
      if (difficulty === 'easy') idx = randomMove(b)
      else if (difficulty === 'medium') idx = mediumMove(b, ai, hu)
      else idx = hardMove([...b], ai, hu)
      const nb = [...b]; nb[idx] = 'O'
      setBoard(nb)
      const { sym, line } = checkWinner(nb)
      if (sym) {
        const w = sym === 'draw' ? 'draw' : sym === 'X' ? 'p1' : 'p2'
        setResult({ winner: w, line })
        saveScore(w)
      } else {
        setTurn(1)
      }
      setAiThinking(false)
    }, difficulty === 'hard' ? 600 : 350)
  }, [difficulty])

  const handleCell = (i: number) => {
    if (board[i] || result || aiThinking) return
    if (mode === 'ai' && turn === 2) return
    const sym: Cell = turn === 1 ? 'X' : 'O'
    const nb = [...board]; nb[i] = sym
    setBoard(nb)
    const { sym: s, line } = checkWinner(nb)
    if (s) {
      const w = s === 'draw' ? 'draw' : s === 'X' ? 'p1' : 'p2'
      setResult({ winner: w, line })
      saveScore(w)
    } else {
      const next: 1 | 2 = turn === 1 ? 2 : 1
      setTurn(next)
      if (mode === 'ai' && next === 2) doAI(nb)
    }
  }

  const reset = () => { setBoard(Array(9).fill(null)); setTurn(1); setResult(null); setAiThinking(false) }

  const handleBack = () => {
    if (result && onGameEnd) onGameEnd(result.winner)
    else onBack()
  }

  const handleNext = () => {
    if (result && onGameEnd) onGameEnd(result.winner)
  }

  // Auto-start AI if it goes first (shouldn't happen since P1 always goes first)
  useEffect(() => {
    if (mode === 'ai' && turn === 2 && !result && board.every(c => c === null)) doAI(board)
  }, [])

  const p1Label = mode === 'ai' ? 'You' : 'Player 1'
  const p2Label = mode === 'ai' ? `AI (${difficulty})` : 'Player 2'

  return (
    <div className="h-full flex flex-col relative" style={{ background: 'var(--loft-bg)' }}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 safe-top">
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'var(--loft-card)' }}>
          <ChevronLeft size={20} style={{ color: 'var(--loft-text)' }} />
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--loft-text)' }}>Tic-Tac-Toe</h1>
        <span className="ml-auto text-sm font-medium px-3 py-1 rounded-full" style={{ background: 'var(--loft-card)', color: 'var(--loft-muted)' }}>
          {mode === 'ai' ? `vs AI · ${difficulty}` : 'Pass & Play'}
        </span>
      </div>

      {/* Player strips */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className={`flex items-center gap-3 transition-opacity ${turn === 1 && !result ? 'opacity-100' : 'opacity-35'}`}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-black"
            style={{ background: 'rgba(239,68,68,0.15)', border: '2px solid #ef4444', color: '#ef4444' }}>X</div>
          <div>
            <p className="font-bold text-sm" style={{ color: '#ef4444' }}>{p1Label}</p>
            <p className="text-xs" style={{ color: 'var(--loft-muted)' }}>X · Red</p>
          </div>
        </div>
        <div className="text-lg font-black" style={{ color: 'var(--loft-faint)' }}>VS</div>
        <div className={`flex items-center gap-3 transition-opacity ${turn === 2 && !result ? 'opacity-100' : 'opacity-35'}`}>
          <div>
            <p className="font-bold text-sm text-right" style={{ color: '#3b82f6' }}>{p2Label}</p>
            <p className="text-xs text-right" style={{ color: 'var(--loft-muted)' }}>O · Blue</p>
          </div>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-black"
            style={{ background: 'rgba(59,130,246,0.15)', border: '2px solid #3b82f6', color: '#3b82f6' }}>O</div>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="grid grid-cols-3 gap-2.5 w-full" style={{ maxWidth: 320 }}>
          {board.map((cell, i) => {
            const isWin = result?.line?.includes(i) ?? false
            return (
              <motion.button key={i} whileTap={{ scale: 0.9 }} onClick={() => handleCell(i)}
                className="aspect-square rounded-2xl flex items-center justify-center"
                style={{
                  background: isWin
                    ? (result?.winner === 'p1' ? 'rgba(239,68,68,0.22)' : result?.winner === 'p2' ? 'rgba(59,130,246,0.22)' : 'var(--loft-card)')
                    : 'var(--loft-card)',
                  border: `3px solid ${isWin ? (result?.winner === 'p1' ? '#ef4444' : '#3b82f6') : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: isWin ? `0 0 16px ${result?.winner === 'p1' ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)'}` : 'none',
                }}
              >
                <AnimatePresence>
                  {cell && (
                    <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                      className="text-5xl font-black select-none"
                      style={{ color: cell === 'X' ? '#ef4444' : '#3b82f6' }}>
                      {cell}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* AI thinking indicator */}
      {aiThinking && (
        <div className="flex items-center justify-center py-3 gap-2">
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3b82f6', animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3b82f6', animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3b82f6', animationDelay: '300ms' }} />
        </div>
      )}

      {/* Turn indicator */}
      {!result && !aiThinking && (
        <div className="flex justify-center py-3">
          <div className="px-4 py-2 rounded-full text-sm font-semibold"
            style={{ background: 'var(--loft-card)', color: turn === 1 ? '#ef4444' : '#3b82f6' }}>
            {turn === 1 ? `${p1Label}'s turn` : `${p2Label}'s turn`}
          </div>
        </div>
      )}

      {/* Result overlay */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', zIndex: 50 }}>
            <motion.div initial={{ scale: 0.8, y: 24 }} animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className="rounded-3xl p-8 text-center mx-5"
              style={{ background: 'var(--loft-card)', border: '2px solid rgba(255,255,255,0.12)', maxWidth: 320, width: '100%' }}>
              <div className="text-6xl mb-4">
                {result.winner === 'draw' ? '🤝' : '🏆'}
              </div>
              <h2 className="text-3xl font-black mb-1"
                style={{ color: result.winner === 'p1' ? '#ef4444' : result.winner === 'p2' ? '#3b82f6' : 'var(--loft-text)' }}>
                {result.winner === 'draw' ? "It's a Draw!"
                  : result.winner === 'p1' ? (mode === '2p' ? 'Player 1 Wins!' : 'You Win! 🎉')
                  : (mode === 'ai' ? 'AI Wins!' : 'Player 2 Wins!')}
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--loft-muted)' }}>
                {result.winner === 'draw' ? 'No one wins this round'
                  : result.winner === 'p1' ? 'Red takes it!' : 'Blue takes it!'}
              </p>
              <div className="flex gap-3">
                <button onClick={handleBack}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)' }}>
                  {tournamentMode ? 'Next' : 'Back'}
                </button>
                {!tournamentMode && (
                  <button onClick={reset}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm loft-btn-accent">
                    Play Again
                  </button>
                )}
                {tournamentMode && (
                  <button onClick={handleNext}
                    className="flex-1 py-3 rounded-2xl font-bold text-sm loft-btn-accent">
                    Next Game
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
