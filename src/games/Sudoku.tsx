import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { saveGameScore, getGameScore } from '../db'

interface Props { onBack: () => void }

type Difficulty = 'easy' | 'medium' | 'hard'

// ─── Sudoku generator ─────────────────────────────────────────────────────────

function createEmpty(): number[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0))
}

function isValid(grid: number[][], row: number, col: number, num: number): boolean {
  for (let c = 0; c < 9; c++) if (grid[row][c] === num) return false
  for (let r = 0; r < 9; r++) if (grid[r][col] === num) return false
  const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3
  for (let dr = 0; dr < 3; dr++)
    for (let dc = 0; dc < 3; dc++)
      if (grid[br + dr][bc + dc] === num) return false
  return true
}

function solveFill(grid: number[][]): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5)
        for (const n of nums) {
          if (isValid(grid, r, c, n)) {
            grid[r][c] = n
            if (solveFill(grid)) return true
            grid[r][c] = 0
          }
        }
        return false
      }
    }
  }
  return true
}

function countSolutions(grid: number[][], limit: number): number {
  let count = 0
  function solve(): boolean {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === 0) {
          for (let n = 1; n <= 9; n++) {
            if (isValid(grid, r, c, n)) {
              grid[r][c] = n
              if (solve()) {
                count++
                if (count >= limit) { grid[r][c] = 0; return true }
              }
              grid[r][c] = 0
            }
          }
          return false
        }
      }
    }
    return true
  }
  solve()
  return count
}

function cloneGrid(g: number[][]): number[][] {
  return g.map(r => [...r])
}

function generatePuzzle(difficulty: Difficulty): { puzzle: number[][]; solution: number[][] } {
  const solution = createEmpty()
  solveFill(solution)

  const clueTarget = difficulty === 'easy' ? 46 : difficulty === 'medium' ? 32 : 24
  const toRemove = 81 - clueTarget

  const puzzle = cloneGrid(solution)
  const positions: [number, number][] = []
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) positions.push([r, c])
  // Shuffle
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]]
  }

  let removed = 0
  for (const [r, c] of positions) {
    if (removed >= toRemove) break
    const backup = puzzle[r][c]
    puzzle[r][c] = 0
    const test = cloneGrid(puzzle)
    if (countSolutions(test, 2) === 1) {
      removed++
    } else {
      puzzle[r][c] = backup
    }
  }

  return { puzzle, solution }
}

// ─── State types ───────────────────────────────────────────────────────────────

interface SudokuGameState {
  puzzle: number[][]
  solution: number[][]
  grid: number[][]
  pencil: boolean[][][]   // [9][9][9] pencil marks (index 0 = num 1)
  selected: [number, number] | null
  mistakes: number
  maxMistakes: number
  startTime: number
  elapsed: number
  paused: boolean
  hints: number
  pencilMode: boolean
  gameOver: boolean
  won: boolean
  difficulty: Difficulty
  hintCells: Set<string>  // "r,c" of hint-filled cells
}

function makeInitialState(difficulty: Difficulty): SudokuGameState {
  const { puzzle, solution } = generatePuzzle(difficulty)
  const grid = cloneGrid(puzzle)
  const pencil: boolean[][][] = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => Array(9).fill(false))
  )
  return {
    puzzle, solution, grid, pencil,
    selected: null,
    mistakes: 0, maxMistakes: 3,
    startTime: Date.now(), elapsed: 0,
    paused: false,
    hints: 3,
    pencilMode: false,
    gameOver: false,
    won: false,
    difficulty,
    hintCells: new Set(),
  }
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// ─── Conflict detection ────────────────────────────────────────────────────────

function getConflicts(grid: number[][]): Set<string> {
  const conflicts = new Set<string>()
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = grid[r][c]
      if (v === 0) continue
      // Check row
      for (let cc = 0; cc < 9; cc++) {
        if (cc !== c && grid[r][cc] === v) {
          conflicts.add(`${r},${c}`); conflicts.add(`${r},${cc}`)
        }
      }
      // Check col
      for (let rr = 0; rr < 9; rr++) {
        if (rr !== r && grid[rr][c] === v) {
          conflicts.add(`${r},${c}`); conflicts.add(`${rr},${c}`)
        }
      }
      // Check box
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3
      for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
        const rr = br + dr, cc = bc + dc
        if ((rr !== r || cc !== c) && grid[rr][cc] === v) {
          conflicts.add(`${r},${c}`); conflicts.add(`${rr},${cc}`)
        }
      }
    }
  }
  return conflicts
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Sudoku({ onBack }: Props) {
  const [diffPick, setDiffPick] = useState<Difficulty | null>(null)
  const [game, setGame] = useState<SudokuGameState | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start timer when game is active
  useEffect(() => {
    if (!game || game.gameOver || game.won || game.paused) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      setGame(g => g ? { ...g, elapsed: g.elapsed + 1 } : g)
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [game?.gameOver, game?.won, game?.paused, game !== null])

  const startGame = (diff: Difficulty) => {
    setGame(makeInitialState(diff))
  }

  const handleCellTap = useCallback((r: number, c: number) => {
    setGame(g => {
      if (!g || g.gameOver || g.won) return g
      return { ...g, selected: [r, c] }
    })
  }, [])

  const handleNumber = useCallback((num: number) => {
    setGame(g => {
      if (!g || !g.selected || g.gameOver || g.won) return g
      const [r, c] = g.selected
      if (g.puzzle[r][c] !== 0) return g // clue cell, not editable

      if (g.pencilMode) {
        const newPencil = g.pencil.map(row => row.map(col => [...col]))
        newPencil[r][c][num - 1] = !newPencil[r][c][num - 1]
        return { ...g, pencil: newPencil }
      }

      // Place number
      const newGrid = cloneGrid(g.grid)
      newGrid[r][c] = num

      // Clear pencil marks for this cell
      const newPencil = g.pencil.map(row => row.map(col => [...col]))
      newPencil[r][c] = Array(9).fill(false)
      // Also clear pencil marks in same row/col/box
      for (let cc = 0; cc < 9; cc++) newPencil[r][cc][num - 1] = false
      for (let rr = 0; rr < 9; rr++) newPencil[rr][c][num - 1] = false
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3
      for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
        newPencil[br + dr][bc + dc][num - 1] = false
      }

      let mistakes = g.mistakes
      if (num !== g.solution[r][c]) mistakes++

      const gameOver = mistakes >= g.maxMistakes

      // Check win: all cells match solution
      let won = false
      if (!gameOver) {
        won = newGrid.every((row, ri) => row.every((v, ci) => v === g.solution[ri][ci]))
        if (won) {
          const gameId = `sudoku_${g.difficulty}`
          getGameScore(gameId).then(existing => {
            const best = existing?.bestScore ?? Infinity
            if (g.elapsed < best || best === Infinity) {
              saveGameScore({ gameId, bestScore: g.elapsed, lastPlayed: new Date().toISOString() })
            }
          })
        }
      }

      return { ...g, grid: newGrid, pencil: newPencil, mistakes, gameOver, won }
    })
  }, [])

  const handleDelete = useCallback(() => {
    setGame(g => {
      if (!g || !g.selected || g.gameOver || g.won) return g
      const [r, c] = g.selected
      if (g.puzzle[r][c] !== 0) return g
      const newGrid = cloneGrid(g.grid)
      newGrid[r][c] = 0
      const newPencil = g.pencil.map(row => row.map(col => [...col]))
      newPencil[r][c] = Array(9).fill(false)
      return { ...g, grid: newGrid, pencil: newPencil }
    })
  }, [])

  const handleHint = useCallback(() => {
    setGame(g => {
      if (!g || g.hints <= 0 || g.gameOver || g.won) return g
      // Find a random empty or wrong cell
      const empties: [number, number][] = []
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (g.puzzle[r][c] === 0 && g.grid[r][c] !== g.solution[r][c])
            empties.push([r, c])
      if (empties.length === 0) return g
      const [r, c] = empties[Math.floor(Math.random() * empties.length)]
      const newGrid = cloneGrid(g.grid)
      newGrid[r][c] = g.solution[r][c]
      const newPencil = g.pencil.map(row => row.map(col => [...col]))
      newPencil[r][c] = Array(9).fill(false)
      const newHintCells = new Set(g.hintCells)
      newHintCells.add(`${r},${c}`)

      const won = newGrid.every((row, ri) => row.every((v, ci) => v === g.solution[ri][ci]))
      if (won) {
        const gameId = `sudoku_${g.difficulty}`
        getGameScore(gameId).then(existing => {
          const best = existing?.bestScore ?? Infinity
          if (g.elapsed < best || best === Infinity) {
            saveGameScore({ gameId, bestScore: g.elapsed, lastPlayed: new Date().toISOString() })
          }
        })
      }

      return { ...g, grid: newGrid, pencil: newPencil, hints: g.hints - 1, hintCells: newHintCells, won, selected: [r, c] }
    })
  }, [])

  const handleNewGame = () => {
    if (game) startGame(game.difficulty)
  }

  if (!game) {
    // Pre-game difficulty picker
    const diffs: { id: Difficulty; label: string; clues: string; desc: string; color: string }[] = [
      { id: 'easy', label: 'Easy', clues: '46 clues', desc: 'Relaxed solving', color: '#16a34a' },
      { id: 'medium', label: 'Medium', clues: '32 clues', desc: 'A fun challenge', color: '#d97706' },
      { id: 'hard', label: 'Hard', clues: '24 clues', desc: 'Expert logic needed', color: '#dc2626' },
    ]
    return (
      <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
        <div className="flex items-center gap-3 px-4 pb-3"
          style={{ paddingTop: 'env(safe-area-inset-top)', background: 'var(--loft-bg2)' }}>
          <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'var(--loft-card)' }}>
            <ChevronLeft size={20} style={{ color: 'var(--loft-text)' }} />
          </button>
          <h1 className="text-xl font-bold" style={{ color: 'var(--loft-text)' }}>🔢 Sudoku</h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-5 pb-8 gap-6">
          <div className="text-center">
            <div className="text-6xl mb-3">🔢</div>
            <h2 className="text-2xl font-black mb-1" style={{ color: 'var(--loft-text)' }}>Sudoku</h2>
            <p className="text-sm" style={{ color: 'var(--loft-muted)' }}>Fill the 9×9 grid with digits 1–9</p>
          </div>

          <div className="w-full max-w-sm space-y-3">
            {diffs.map(d => (
              <button key={d.id} onClick={() => setDiffPick(d.id)}
                className="w-full p-4 rounded-2xl flex items-center gap-4 text-left transition-all"
                style={{
                  background: diffPick === d.id ? `${d.color}18` : 'var(--loft-card)',
                  border: `2px solid ${diffPick === d.id ? d.color : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: diffPick === d.id ? `0 0 20px ${d.color}33` : 'none',
                }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg flex-shrink-0"
                  style={{ background: `${d.color}22`, color: d.color }}>
                  {d.label[0]}
                </div>
                <div className="flex-1">
                  <p className="font-black text-base" style={{ color: diffPick === d.id ? d.color : 'var(--loft-text)' }}>
                    {d.label}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--loft-muted)' }}>{d.clues} · {d.desc}</p>
                </div>
                {diffPick === d.id && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: d.color }}>✓</div>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={() => diffPick && startGame(diffPick)}
            disabled={!diffPick}
            className="w-full max-w-sm py-4 rounded-2xl font-black text-base transition-all"
            style={{
              background: diffPick ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'var(--loft-card)',
              color: diffPick ? '#fff' : 'var(--loft-muted)',
              boxShadow: diffPick ? '0 0 24px rgba(59,130,246,0.4)' : 'none',
              opacity: diffPick ? 1 : 0.5,
            }}>
            START GAME
          </button>
        </div>
      </div>
    )
  }

  const conflicts = getConflicts(game.grid)

  const cellBg = (r: number, c: number): string => {
    const key = `${r},${c}`
    const isSelected = game.selected?.[0] === r && game.selected?.[1] === c
    if (isSelected) return 'rgba(59,130,246,0.35)'
    if (conflicts.has(key)) return 'rgba(239,68,68,0.2)'
    if (!game.selected) return 'transparent'
    const [sr, sc] = game.selected
    const sameBox = Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3)
    const sameNum = game.grid[r][c] !== 0 && game.grid[r][c] === game.grid[sr][sc]
    if (r === sr || c === sc || sameBox) return 'rgba(59,130,246,0.08)'
    if (sameNum) return 'rgba(59,130,246,0.15)'
    return 'transparent'
  }

  const cellTextColor = (r: number, c: number): string => {
    const key = `${r},${c}`
    if (game.puzzle[r][c] !== 0) return 'var(--loft-text)'
    if (game.hintCells.has(key)) return '#22d3ee'
    if (conflicts.has(key)) return '#ef4444'
    if (game.grid[r][c] !== 0 && game.grid[r][c] === game.solution[r][c]) return '#4ade80'
    if (game.grid[r][c] !== 0) return '#ef4444'
    return 'var(--loft-text)'
  }

  const diffColor = game.difficulty === 'easy' ? '#16a34a' : game.difficulty === 'medium' ? '#d97706' : '#dc2626'

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pb-2 flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)', background: 'var(--loft-bg2)' }}>
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'var(--loft-card)' }}>
          <ChevronLeft size={20} style={{ color: 'var(--loft-text)' }} />
        </button>
        <span className="text-sm font-bold capitalize px-2 py-0.5 rounded-lg"
          style={{ background: `${diffColor}22`, color: diffColor }}>
          {game.difficulty}
        </span>
        <div className="flex-1 text-center font-bold text-base tabular-nums" style={{ color: 'var(--loft-text)' }}>
          {formatTime(game.elapsed)}
        </div>
        {/* Mistake dots */}
        <div className="flex gap-1.5">
          {Array.from({ length: game.maxMistakes }).map((_, i) => (
            <div key={i} className="w-3 h-3 rounded-full transition-all"
              style={{ background: i < game.mistakes ? '#ef4444' : 'rgba(255,255,255,0.12)', boxShadow: i < game.mistakes ? '0 0 6px #ef4444' : 'none' }} />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-area flex flex-col items-center px-2 pt-3 pb-4 gap-3">
        {/* Grid */}
        <div className="w-full max-w-sm">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 0 }}>
            {game.grid.map((row, r) =>
              row.map((val, c) => {
                const isClue = game.puzzle[r][c] !== 0
                const pencilNums = game.pencil[r][c]
                const hasPencil = !isClue && val === 0 && pencilNums.some(Boolean)
                const borderTop = r === 0 ? '2.5px solid #374151' : r % 3 === 0 ? '2.5px solid #374151' : '0.5px solid #374151'
                const borderLeft = c === 0 ? '2.5px solid #374151' : c % 3 === 0 ? '2.5px solid #374151' : '0.5px solid #374151'
                const borderRight = c === 8 ? '2.5px solid #374151' : '0'
                const borderBottom = r === 8 ? '2.5px solid #374151' : '0'

                return (
                  <button key={`${r}-${c}`}
                    onClick={() => handleCellTap(r, c)}
                    style={{
                      aspectRatio: '1',
                      background: cellBg(r, c),
                      borderTop, borderLeft, borderRight, borderBottom,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0, cursor: 'pointer', position: 'relative',
                      transition: 'background 0.1s',
                    }}>
                    {hasPencil ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '90%', height: '90%', gap: 0 }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                          <span key={n} style={{
                            fontSize: '0.32rem', color: pencilNums[n - 1] ? 'rgba(156,163,175,0.9)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                          }}>{n}</span>
                        ))}
                      </div>
                    ) : val !== 0 ? (
                      <span style={{
                        fontSize: 'clamp(12px, 4vw, 20px)',
                        fontWeight: isClue ? '700' : '600',
                        color: cellTextColor(r, c),
                        lineHeight: 1,
                      }}>{val}</span>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Controls row */}
        <div className="w-full max-w-sm flex items-center justify-between px-1">
          <button
            onClick={() => setGame(g => g ? { ...g, pencilMode: !g.pencilMode } : g)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: game.pencilMode ? 'rgba(59,130,246,0.2)' : 'var(--loft-card)',
              color: game.pencilMode ? '#60a5fa' : 'var(--loft-muted)',
              border: `1.5px solid ${game.pencilMode ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
            }}>
            ✏️ Pencil {game.pencilMode ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={handleHint}
            disabled={game.hints <= 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: game.hints > 0 ? 'rgba(34,211,238,0.1)' : 'var(--loft-card)',
              color: game.hints > 0 ? '#22d3ee' : 'var(--loft-faint)',
              border: `1.5px solid ${game.hints > 0 ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.05)'}`,
              opacity: game.hints > 0 ? 1 : 0.5,
            }}>
            💡 Hints: {game.hints}
          </button>
        </div>

        {/* Number pad */}
        <div className="w-full max-w-sm">
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
              <button key={n} onClick={() => handleNumber(n)}
                className="aspect-square rounded-xl font-bold text-lg transition-all"
                style={{
                  background: 'var(--loft-card)',
                  color: 'var(--loft-text)',
                  border: '1.5px solid rgba(255,255,255,0.08)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                {n}
              </button>
            ))}
            <button onClick={handleDelete}
              className="aspect-square rounded-xl font-bold text-base transition-all"
              style={{
                background: 'rgba(239,68,68,0.1)',
                color: '#ef4444',
                border: '1.5px solid rgba(239,68,68,0.2)',
              }}>
              ⌫
            </button>
          </div>
        </div>
      </div>

      {/* Win / Game Over overlays */}
      <AnimatePresence>
        {game.won && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.75)', zIndex: 50 }}>
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="rounded-3xl p-8 text-center mx-5"
              style={{ background: 'var(--loft-bg2)', border: '2px solid rgba(255,255,255,0.12)', maxWidth: 320, width: '100%' }}>
              <div className="text-5xl mb-3">🎉</div>
              <h2 className="text-3xl font-black mb-1" style={{ color: '#4ade80' }}>Solved!</h2>
              <p className="text-sm mb-1 capitalize font-semibold" style={{ color: diffColor }}>{game.difficulty}</p>
              <p className="text-2xl font-black mb-1" style={{ color: 'var(--loft-text)' }}>{formatTime(game.elapsed)}</p>
              <p className="text-xs mb-2" style={{ color: 'var(--loft-muted)' }}>
                Mistakes: {game.mistakes}/{game.maxMistakes}
              </p>
              <p className="text-xs mb-6" style={{ color: 'rgba(34,211,238,0.7)' }}>
                Hints used: {3 - game.hints}
              </p>
              <div className="flex gap-3">
                <button onClick={onBack} className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                  Back
                </button>
                <button onClick={handleNewGame} className="flex-1 py-3 rounded-2xl font-bold text-sm loft-btn-accent">
                  New Game
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {game.gameOver && !game.won && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.75)', zIndex: 50 }}>
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="rounded-3xl p-8 text-center mx-5"
              style={{ background: 'var(--loft-bg2)', border: '2px solid rgba(239,68,68,0.3)', maxWidth: 320, width: '100%' }}>
              <div className="text-5xl mb-3">💀</div>
              <h2 className="text-3xl font-black mb-2" style={{ color: '#ef4444' }}>Game Over</h2>
              <p className="text-base mb-6" style={{ color: 'var(--loft-muted)' }}>3 mistakes — better luck next time!</p>
              <div className="flex gap-3">
                <button onClick={onBack} className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                  Back
                </button>
                <button onClick={handleNewGame} className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: '#dc2626', color: '#fff' }}>
                  Try Again
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
