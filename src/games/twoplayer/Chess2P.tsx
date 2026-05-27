import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, RotateCcw, Flag, Handshake } from 'lucide-react'
import { saveGameScore, getGameScore } from '../../db'
import type { TwoPlayerGameProps } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────
type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'
type PieceColor = 'w' | 'b'
interface Piece { type: PieceType; color: PieceColor }
type Square = Piece | null
type Board = Square[]  // length 64, index = row*8+col (row 0 = rank 8)

interface CastleRights { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean }

interface GameState {
  board: Board
  turn: PieceColor
  castleRights: CastleRights
  enPassant: number | null  // index of ep target square
  halfMoves: number         // for 50-move rule
  fullMoves: number
  posHistory: string[]      // position keys for threefold
  moveCount: number
}

interface Move {
  from: number
  to: number
  promotion?: PieceType
  castling?: 'kside' | 'qside'
  enPassant?: boolean
}

type GameResult =
  | { type: 'checkmate'; winner: PieceColor }
  | { type: 'stalemate' }
  | { type: 'draw50' }
  | { type: 'threefold' }
  | { type: 'insufficient' }
  | { type: 'resign'; winner: PieceColor }

// ─── Constants ────────────────────────────────────────────────────────────────
const UNICODE: Record<PieceColor, Record<PieceType, string>> = {
  w: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
  b: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' },
}

const PIECE_VALUE: Record<PieceType, number> = { P: 1, N: 3, B: 3.25, R: 5, Q: 9, K: 0 }

// Piece-square tables (from white perspective, row 0 = rank 8)
const PST: Record<PieceType, number[]> = {
  P: [
     0, 0, 0, 0, 0, 0, 0, 0,
    50,50,50,50,50,50,50,50,
    10,10,20,30,30,20,10,10,
     5, 5,10,25,25,10, 5, 5,
     0, 0, 0,20,20, 0, 0, 0,
     5,-5,-10, 0, 0,-10,-5, 5,
     5,10,10,-20,-20,10,10, 5,
     0, 0, 0, 0, 0, 0, 0, 0,
  ],
  N: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  B: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  R: [
     0, 0, 0, 0, 0, 0, 0, 0,
     5,10,10,10,10,10,10, 5,
    -5, 0, 0, 0, 0, 0, 0,-5,
    -5, 0, 0, 0, 0, 0, 0,-5,
    -5, 0, 0, 0, 0, 0, 0,-5,
    -5, 0, 0, 0, 0, 0, 0,-5,
    -5, 0, 0, 0, 0, 0, 0,-5,
     0, 0, 0, 5, 5, 0, 0, 0,
  ],
  Q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  K: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
}

// ─── Board helpers ────────────────────────────────────────────────────────────
const row = (i: number) => Math.floor(i / 8)
const col = (i: number) => i % 8
const idx = (r: number, c: number) => r * 8 + c
const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8
const opp = (c: PieceColor): PieceColor => c === 'w' ? 'b' : 'w'

function initBoard(): Board {
  const b: Board = Array(64).fill(null)
  const place = (r: number, c: number, type: PieceType, color: PieceColor) => { b[idx(r, c)] = { type, color } }
  const backRank: PieceType[] = ['R','N','B','Q','K','B','N','R']
  backRank.forEach((t, c) => { place(0, c, t, 'b'); place(7, c, t, 'w') })
  for (let c = 0; c < 8; c++) { place(1, c, 'P', 'b'); place(6, c, 'P', 'w') }
  return b
}

function initState(): GameState {
  return {
    board: initBoard(),
    turn: 'w',
    castleRights: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfMoves: 0,
    fullMoves: 1,
    posHistory: [],
    moveCount: 0,
  }
}

function posKey(gs: GameState): string {
  return gs.board.map(s => s ? `${s.color}${s.type}` : '-').join('') +
    `|${gs.turn}|${gs.castleRights.wK?1:0}${gs.castleRights.wQ?1:0}${gs.castleRights.bK?1:0}${gs.castleRights.bQ?1:0}|${gs.enPassant ?? '-'}`
}

// ─── Move generation ──────────────────────────────────────────────────────────
function rawMoves(board: Board, from: number, gs: GameState): Move[] {
  const piece = board[from]
  if (!piece) return []
  const { type, color } = piece
  const moves: Move[] = []
  const r = row(from), c = col(from)
  const enemy = opp(color)

  const slide = (dr: number, dc: number) => {
    let nr = r + dr, nc = c + dc
    while (inBounds(nr, nc)) {
      const to = idx(nr, nc)
      const target = board[to]
      if (!target) { moves.push({ from, to }); nr += dr; nc += dc }
      else { if (target.color === enemy) moves.push({ from, to }); break }
    }
  }
  const step = (dr: number, dc: number) => {
    const nr = r + dr, nc = c + dc
    if (!inBounds(nr, nc)) return
    const to = idx(nr, nc)
    const target = board[to]
    if (!target || target.color === enemy) moves.push({ from, to })
  }

  switch (type) {
    case 'R': [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc]) => slide(dr, dc)); break
    case 'B': [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr,dc]) => slide(dr, dc)); break
    case 'Q': [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr,dc]) => slide(dr, dc)); break
    case 'N': [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => step(dr, dc)); break
    case 'K': [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr,dc]) => step(dr, dc)); break
    case 'P': {
      const dir = color === 'w' ? -1 : 1
      const startRow = color === 'w' ? 6 : 1
      const promRow = color === 'w' ? 0 : 7
      // Forward
      const fwd = idx(r + dir, c)
      if (inBounds(r + dir, c) && !board[fwd]) {
        if (row(fwd) === promRow) {
          (['Q','R','B','N'] as PieceType[]).forEach(promotion => moves.push({ from, to: fwd, promotion }))
        } else {
          moves.push({ from, to: fwd })
          // Double push
          if (r === startRow) {
            const dbl = idx(r + 2 * dir, c)
            if (!board[dbl]) moves.push({ from, to: dbl })
          }
        }
      }
      // Captures
      for (const dc2 of [-1, 1]) {
        if (!inBounds(r + dir, c + dc2)) continue
        const cap = idx(r + dir, c + dc2)
        if (board[cap]?.color === enemy) {
          if (row(cap) === promRow) {
            (['Q','R','B','N'] as PieceType[]).forEach(promotion => moves.push({ from, to: cap, promotion }))
          } else {
            moves.push({ from, to: cap })
          }
        }
        // En passant
        if (gs.enPassant === cap) moves.push({ from, to: cap, enPassant: true })
      }
      break
    }
  }

  // Castling
  if (type === 'K') {
    const cr = gs.castleRights
    if (color === 'w' && r === 7) {
      if (cr.wK && !board[idx(7,5)] && !board[idx(7,6)] && board[idx(7,7)]?.type === 'R')
        moves.push({ from, to: idx(7, 6), castling: 'kside' })
      if (cr.wQ && !board[idx(7,3)] && !board[idx(7,2)] && !board[idx(7,1)] && board[idx(7,0)]?.type === 'R')
        moves.push({ from, to: idx(7, 2), castling: 'qside' })
    }
    if (color === 'b' && r === 0) {
      if (cr.bK && !board[idx(0,5)] && !board[idx(0,6)] && board[idx(0,7)]?.type === 'R')
        moves.push({ from, to: idx(0, 6), castling: 'kside' })
      if (cr.bQ && !board[idx(0,3)] && !board[idx(0,2)] && !board[idx(0,1)] && board[idx(0,0)]?.type === 'R')
        moves.push({ from, to: idx(0, 2), castling: 'qside' })
    }
  }

  return moves
}

function applyMove(gs: GameState, move: Move): GameState {
  const board = [...gs.board]
  const piece = board[move.from]!
  const { color } = piece
  let { castleRights } = gs
  let enPassant: number | null = null
  let halfMoves = gs.halfMoves + 1

  // En passant capture
  if (move.enPassant) {
    const dir = color === 'w' ? 1 : -1
    board[move.to + dir * 8] = null
    halfMoves = 0
  }

  // Castling — move rook too
  if (move.castling) {
    const r2 = row(move.from)
    if (move.castling === 'kside') {
      board[idx(r2, 5)] = board[idx(r2, 7)]
      board[idx(r2, 7)] = null
    } else {
      board[idx(r2, 3)] = board[idx(r2, 0)]
      board[idx(r2, 0)] = null
    }
  }

  // Pawn double push → set ep square
  if (piece.type === 'P' && Math.abs(move.to - move.from) === 16) {
    enPassant = (move.from + move.to) >> 1
    halfMoves = 0
  }

  // Capture resets halfmove
  if (board[move.to]) halfMoves = 0
  if (piece.type === 'P') halfMoves = 0

  // Move piece
  board[move.to] = move.promotion ? { type: move.promotion, color } : piece
  board[move.from] = null

  // Update castle rights
  castleRights = { ...castleRights }
  if (piece.type === 'K') {
    if (color === 'w') { castleRights.wK = false; castleRights.wQ = false }
    else { castleRights.bK = false; castleRights.bQ = false }
  }
  if (piece.type === 'R') {
    if (move.from === idx(7, 0)) castleRights.wQ = false
    if (move.from === idx(7, 7)) castleRights.wK = false
    if (move.from === idx(0, 0)) castleRights.bQ = false
    if (move.from === idx(0, 7)) castleRights.bK = false
  }
  // Capturing a rook also removes rights
  if (move.to === idx(7, 0)) castleRights.wQ = false
  if (move.to === idx(7, 7)) castleRights.wK = false
  if (move.to === idx(0, 0)) castleRights.bQ = false
  if (move.to === idx(0, 7)) castleRights.bK = false

  const next = opp(color)
  const newGs: GameState = {
    board,
    turn: next,
    castleRights,
    enPassant,
    halfMoves,
    fullMoves: color === 'b' ? gs.fullMoves + 1 : gs.fullMoves,
    posHistory: gs.posHistory,
    moveCount: gs.moveCount + 1,
  }
  const key = posKey(newGs)
  newGs.posHistory = [...gs.posHistory, key]
  return newGs
}

function isSquareAttacked(board: Board, sq: number, byColor: PieceColor): boolean {
  const enemy = byColor
  const friendly = opp(byColor)
  const r2 = row(sq), c2 = col(sq)

  // Check knight attacks
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const nr = r2 + dr, nc = c2 + dc
    if (inBounds(nr, nc)) {
      const p = board[idx(nr, nc)]
      if (p?.color === enemy && p.type === 'N') return true
    }
  }
  // Check diagonals (bishop/queen)
  for (const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    let nr = r2 + dr, nc = c2 + dc
    while (inBounds(nr, nc)) {
      const p = board[idx(nr, nc)]
      if (p) {
        if (p.color === enemy && (p.type === 'B' || p.type === 'Q')) return true
        break
      }
      nr += dr; nc += dc
    }
  }
  // Check rank/file (rook/queen)
  for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    let nr = r2 + dr, nc = c2 + dc
    while (inBounds(nr, nc)) {
      const p = board[idx(nr, nc)]
      if (p) {
        if (p.color === enemy && (p.type === 'R' || p.type === 'Q')) return true
        break
      }
      nr += dr; nc += dc
    }
  }
  // King adjacency
  for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    const nr = r2 + dr, nc = c2 + dc
    if (inBounds(nr, nc)) {
      const p = board[idx(nr, nc)]
      if (p?.color === enemy && p.type === 'K') return true
    }
  }
  // Pawn attacks
  const pawnDir = enemy === 'w' ? 1 : -1
  for (const dc of [-1, 1]) {
    const nr = r2 + pawnDir, nc = c2 + dc
    if (inBounds(nr, nc)) {
      const p = board[idx(nr, nc)]
      if (p?.color === enemy && p.type === 'P') return true
    }
  }
  // Suppress unused warning
  void friendly
  return false
}

function findKing(board: Board, color: PieceColor): number {
  return board.findIndex(p => p?.type === 'K' && p.color === color)
}

function isInCheck(board: Board, color: PieceColor): boolean {
  const kSq = findKing(board, color)
  return kSq !== -1 && isSquareAttacked(board, kSq, opp(color))
}

function legalMoves(gs: GameState, from: number): Move[] {
  const piece = gs.board[from]
  if (!piece || piece.color !== gs.turn) return []
  const candidates = rawMoves(gs.board, from, gs)
  return candidates.filter(m => {
    // For castling: ensure king not in check, not passing through check
    if (m.castling) {
      if (isInCheck(gs.board, piece.color)) return false
      const passSq = m.castling === 'kside' ? idx(row(m.from), 5) : idx(row(m.from), 3)
      if (isSquareAttacked(gs.board, passSq, opp(piece.color))) return false
    }
    const next = applyMove(gs, m)
    return !isInCheck(next.board, piece.color)
  })
}

function allLegalMoves(gs: GameState): Move[] {
  const moves: Move[] = []
  gs.board.forEach((p, i) => {
    if (p?.color === gs.turn) moves.push(...legalMoves(gs, i))
  })
  return moves
}

function checkGameResult(gs: GameState): GameResult | null {
  const moves = allLegalMoves(gs)
  if (moves.length === 0) {
    if (isInCheck(gs.board, gs.turn)) return { type: 'checkmate', winner: opp(gs.turn) }
    return { type: 'stalemate' }
  }
  if (gs.halfMoves >= 100) return { type: 'draw50' }
  const key = posKey(gs)
  if (gs.posHistory.filter(k => k === key).length >= 2) return { type: 'threefold' }
  // Insufficient material
  const pieces = gs.board.filter(Boolean) as Piece[]
  if (pieces.length === 2) return { type: 'insufficient' }
  if (pieces.length === 3) {
    const minor = pieces.find(p => p.type === 'N' || p.type === 'B')
    if (minor) return { type: 'insufficient' }
  }
  if (pieces.length === 4) {
    const wb = pieces.filter(p => p.color === 'w' && p.type === 'B')
    const bb = pieces.filter(p => p.color === 'b' && p.type === 'B')
    if (wb.length === 1 && bb.length === 1) return { type: 'insufficient' }
  }
  return null
}

// ─── AI ───────────────────────────────────────────────────────────────────────
function evaluate(gs: GameState): number {
  let score = 0
  gs.board.forEach((p, i) => {
    if (!p) return
    const val = PIECE_VALUE[p.type] * 100
    const pstIdx = p.color === 'w' ? i : (7 - row(i)) * 8 + col(i)
    const pos = PST[p.type][pstIdx] ?? 0
    const sign = p.color === 'w' ? 1 : -1
    score += sign * (val + pos)
  })
  // Mobility bonus
  const wMoves = allLegalMoves({ ...gs, turn: 'w' }).length
  const bMoves = allLegalMoves({ ...gs, turn: 'b' }).length
  score += (wMoves - bMoves) * 2
  return gs.turn === 'w' ? score : -score
}

function orderMoves(board: Board, moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const captureA = board[a.to] ? PIECE_VALUE[board[a.to]!.type] : 0
    const captureB = board[b.to] ? PIECE_VALUE[board[b.to]!.type] : 0
    return captureB - captureA
  })
}

function alphabeta(gs: GameState, depth: number, alpha: number, beta: number, deadline: number): number {
  if (Date.now() > deadline) return evaluate(gs)
  const result = checkGameResult(gs)
  if (result) {
    if (result.type === 'checkmate') return -90000
    return 0
  }
  if (depth === 0) return evaluate(gs)

  const moves = orderMoves(gs.board, allLegalMoves(gs))
  let best = -Infinity
  for (const m of moves) {
    if (Date.now() > deadline) break
    const next = applyMove(gs, m)
    const score = -alphabeta(next, depth - 1, -beta, -alpha, deadline)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

function getBestMove(gs: GameState, difficulty: 'easy' | 'medium' | 'hard'): Move | null {
  const moves = allLegalMoves(gs)
  if (!moves.length) return null

  if (difficulty === 'easy') {
    if (Math.random() < 0.2) return moves[Math.floor(Math.random() * moves.length)]
    // depth 2
    const deadline = Date.now() + 1500
    let best = -Infinity
    let bestMove = moves[0]
    for (const m of orderMoves(gs.board, moves)) {
      const next = applyMove(gs, m)
      const score = -alphabeta(next, 1, -Infinity, Infinity, deadline)
      if (score > best) { best = score; bestMove = m }
    }
    return bestMove
  }

  const maxDepth = difficulty === 'medium' ? 3 : 4
  const deadline = Date.now() + 2000
  let best = -Infinity
  let bestMove = moves[0]
  for (const m of orderMoves(gs.board, moves)) {
    if (Date.now() > deadline) break
    const next = applyMove(gs, m)
    const score = -alphabeta(next, maxDepth - 1, -Infinity, Infinity, deadline)
    if (score > best) { best = score; bestMove = m }
  }
  return bestMove
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Chess2P({ mode, difficulty = 'medium', p1Color = 'red', onBack, onGameEnd, tournamentMode }: TwoPlayerGameProps) {
  // p1Color red → plays white; blue → plays black
  const humanColor: PieceColor = p1Color === 'red' ? 'w' : 'b'
  const p1ColorName = p1Color === 'red' ? 'Red' : 'Blue'
  const p2ColorName = p1Color === 'red' ? 'Blue' : 'Red'

  const [gs, setGs] = useState<GameState>(initState)
  const [selected, setSelected] = useState<number | null>(null)
  const [legalDests, setLegalDests] = useState<Move[]>([])
  const [gameResult, setGameResult] = useState<GameResult | null>(null)
  const [aiThinking, setAiThinking] = useState(false)
  const [promotionPending, setPromotionPending] = useState<{ from: number; to: number } | null>(null)
  const [capturedW, setCapturedW] = useState<Piece[]>([])
  const [capturedB, setCapturedB] = useState<Piece[]>([])
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null)
  const [historyStack, setHistoryStack] = useState<GameState[]>([])
  const [resignConfirm, setResignConfirm] = useState(false)
  const [drawOffer, setDrawOffer] = useState(false)
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Flip board when human plays black
  const flipped = mode === 'ai' && humanColor === 'b'

  const inCheck = useMemo(() => isInCheck(gs.board, gs.turn), [gs])
  const kingSquare = useMemo(() => findKing(gs.board, gs.turn), [gs])

  // Save score to IndexedDB
  const saveScore = useCallback(async (winner: 'p1' | 'p2' | 'draw') => {
    const id = `chess_${mode === 'ai' ? `ai_${difficulty}` : '2p'}`
    const existing = await getGameScore(id)
    const wins = (existing?.bestScore ?? 0) + (winner === 'p1' ? 1 : 0)
    await saveGameScore({ gameId: id, bestScore: wins, lastPlayed: new Date().toISOString() })
  }, [mode, difficulty])

  // Determine winner label from GameResult
  const resolveWinner = (res: GameResult): 'p1' | 'p2' | 'draw' => {
    if (res.type === 'checkmate' || res.type === 'resign') {
      const winColor = res.winner
      if (mode === 'ai') {
        return winColor === humanColor ? 'p1' : 'p2'
      }
      return winColor === 'w' ? 'p1' : 'p2'
    }
    return 'draw'
  }

  const endGame = useCallback((res: GameResult) => {
    setGameResult(res)
    const w = resolveWinner(res)
    saveScore(w)
  }, [saveScore])

  // Check for game end after every state change
  useEffect(() => {
    if (gameResult) return
    const res = checkGameResult(gs)
    if (res) endGame(res)
  }, [gs, gameResult, endGame])

  // AI move
  useEffect(() => {
    if (gameResult) return
    if (mode !== 'ai') return
    if (gs.turn === humanColor) return
    if (aiThinking) return

    setAiThinking(true)
    const delay = 400 + Math.random() * 1100
    aiTimerRef.current = setTimeout(() => {
      const move = getBestMove(gs, difficulty)
      if (move) {
        executeMove(gs, move)
      }
      setAiThinking(false)
    }, delay)
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current) }
  }, [gs.turn, gs.moveCount, mode, gameResult])

  const executeMove = (state: GameState, move: Move) => {
    const newGs = applyMove(state, move)
    // Track captures
    const captured = state.board[move.to]
    if (captured) {
      if (captured.color === 'w') setCapturedW(prev => [...prev, captured])
      else setCapturedB(prev => [...prev, captured])
    }
    if (move.enPassant) {
      const dir = state.turn === 'w' ? 1 : -1
      const capPiece = state.board[move.to + dir * 8]
      if (capPiece) {
        if (capPiece.color === 'w') setCapturedW(prev => [...prev, capPiece])
        else setCapturedB(prev => [...prev, capPiece])
      }
    }
    setLastMove({ from: move.from, to: move.to })
    setHistoryStack(prev => [...prev, state])
    setGs(newGs)
    setSelected(null)
    setLegalDests([])
  }

  const handleSquareTap = (sq: number) => {
    if (gameResult || aiThinking) return
    if (mode === 'ai' && gs.turn !== humanColor) return

    const piece = gs.board[sq]

    // If promotion pending, ignore taps
    if (promotionPending) return

    if (selected !== null) {
      // Try to execute move to tapped square
      const move = legalDests.find(m => m.to === sq)
      if (move) {
        if (move.promotion !== undefined) {
          // Multiple promotions possible — show picker
          setPromotionPending({ from: selected, to: sq })
          return
        }
        executeMove(gs, move)
        return
      }
      // Click on own piece → switch selection
      if (piece?.color === gs.turn) {
        const dests = legalMoves(gs, sq)
        setSelected(sq)
        setLegalDests(dests)
        return
      }
      // Deselect
      setSelected(null)
      setLegalDests([])
      return
    }

    // Select own piece
    if (piece?.color === gs.turn) {
      const dests = legalMoves(gs, sq)
      setSelected(sq)
      setLegalDests(dests)
    }
  }

  const handlePromotion = (type: PieceType) => {
    if (!promotionPending) return
    const { from, to } = promotionPending
    const move: Move = { from, to, promotion: type }
    executeMove(gs, move)
    setPromotionPending(null)
  }

  const handleUndo = () => {
    if (historyStack.length === 0 || mode === 'ai') return
    const prev = historyStack[historyStack.length - 1]
    setHistoryStack(h => h.slice(0, -1))
    setGs(prev)
    setSelected(null)
    setLegalDests([])
    setGameResult(null)
    // Undo captured pieces (approximate — pop last captured)
    const cap = prev.board[lastMove?.to ?? -1]
    if (cap) {
      if (cap.color === 'w') setCapturedW(cw => cw.slice(0, -1))
      else setCapturedB(cb => cb.slice(0, -1))
    }
  }

  const handleResign = () => {
    if (!resignConfirm) { setResignConfirm(true); return }
    const winner: PieceColor = opp(gs.turn)
    endGame({ type: 'resign', winner })
    setResignConfirm(false)
  }

  const handleReset = () => {
    setGs(initState())
    setSelected(null)
    setLegalDests([])
    setGameResult(null)
    setCapturedW([])
    setCapturedB([])
    setLastMove(null)
    setHistoryStack([])
    setResignConfirm(false)
    setDrawOffer(false)
    setAiThinking(false)
  }

  const handleBack = () => {
    if (gameResult && onGameEnd) onGameEnd(resolveWinner(gameResult))
    else onBack()
  }

  const handleNext = () => {
    if (gameResult && onGameEnd) onGameEnd(resolveWinner(gameResult))
  }

  // ─── Render helpers ────────────────────────────────────────────────────────
  const renderSquare = (displayIdx: number) => {
    // displayIdx is position on screen (0 = top-left)
    const sq = flipped ? (63 - displayIdx) : displayIdx
    const r = row(sq), c = col(sq)
    const isLight = (r + c) % 2 === 0
    const piece = gs.board[sq]
    const isSelected = selected === sq
    const isLegal = legalDests.some(m => m.to === sq)
    const isCaptureDest = isLegal && gs.board[sq] !== null
    const isLastFrom = lastMove?.from === sq
    const isLastTo = lastMove?.to === sq
    const isCheck = inCheck && sq === kingSquare

    const bgColor = isLight ? '#f0d9b5' : '#b58863'
    let overlay = 'transparent'
    if (isSelected) overlay = 'rgba(0,180,255,0.45)'
    else if (isLastFrom || isLastTo) overlay = 'rgba(255,230,0,0.35)'
    if (isCheck) overlay = 'rgba(220,0,0,0.55)'

    // Coordinates
    const showFile = flipped ? r === 0 : r === 7
    const showRank = flipped ? c === 7 : c === 0
    const fileLabel = String.fromCharCode(97 + c)
    const rankLabel = String(8 - r)

    return (
      <div
        key={sq}
        onClick={() => handleSquareTap(sq)}
        className="relative flex items-center justify-center cursor-pointer select-none"
        style={{
          background: bgColor,
          aspectRatio: '1',
        }}
      >
        {/* Overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: overlay }} />

        {/* Legal move dot / ring */}
        {isLegal && !isCaptureDest && (
          <div className="absolute w-[28%] h-[28%] rounded-full pointer-events-none z-10"
            style={{ background: 'rgba(0,0,0,0.22)' }} />
        )}
        {isCaptureDest && (
          <div className="absolute inset-0 pointer-events-none z-10 rounded-none"
            style={{ boxShadow: 'inset 0 0 0 4px rgba(0,0,0,0.22)' }} />
        )}

        {/* Piece */}
        {piece && (
          <motion.span
            initial={false}
            animate={{ scale: isSelected ? 1.15 : 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="relative z-20 leading-none pointer-events-none"
            style={{
              fontSize: 'clamp(18px, 5.5vw, 38px)',
              textShadow: piece.color === 'w'
                ? '0 1px 3px rgba(0,0,0,0.6)'
                : '0 1px 2px rgba(0,0,0,0.4)',
              filter: piece.color === 'w' ? 'drop-shadow(0 0 1px rgba(0,0,0,0.5))' : 'none',
            }}
          >
            {UNICODE[piece.color][piece.type]}
          </motion.span>
        )}

        {/* Coordinates */}
        {showRank && (
          <span className="absolute top-0.5 left-0.5 text-[8px] font-bold leading-none pointer-events-none z-30"
            style={{ color: isLight ? '#b58863' : '#f0d9b5', opacity: 0.85 }}>
            {rankLabel}
          </span>
        )}
        {showFile && (
          <span className="absolute bottom-0.5 right-0.5 text-[8px] font-bold leading-none pointer-events-none z-30"
            style={{ color: isLight ? '#b58863' : '#f0d9b5', opacity: 0.85 }}>
            {fileLabel}
          </span>
        )}
      </div>
    )
  }

  const c1 = p1Color === 'red' ? '#ef4444' : '#3b82f6'
  const c2 = p1Color === 'red' ? '#3b82f6' : '#ef4444'

  // Turn display
  const isP1Turn = mode === 'ai' ? gs.turn === humanColor : gs.turn === 'w'
  const p1Label = mode === 'ai' ? 'You' : 'Player 1'
  const p2Label = mode === 'ai' ? `AI (${difficulty})` : 'Player 2'
  const whiteLabel = mode === 'ai' && humanColor === 'w' ? p1Label : mode === 'ai' ? p2Label : 'Player 1'
  const blackLabel = mode === 'ai' && humanColor === 'b' ? p1Label : mode === 'ai' ? p2Label : 'Player 2'

  // Captured pieces display
  const renderCaptured = (pieces: Piece[]) => {
    const sorted = [...pieces].sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type])
    return sorted.map((p, i) => (
      <span key={i} style={{ fontSize: 14, lineHeight: 1 }}>{UNICODE[p.color][p.type]}</span>
    ))
  }

  // Game result text
  const resultTitle = () => {
    if (!gameResult) return ''
    if (gameResult.type === 'checkmate') {
      const winColor = gameResult.winner
      const winName = winColor === 'w' ? whiteLabel : blackLabel
      return `Checkmate! ${winName} wins`
    }
    if (gameResult.type === 'resign') {
      const winColor = gameResult.winner
      const loserLabel = opp(winColor) === 'w' ? whiteLabel : blackLabel
      return `${loserLabel} resigned`
    }
    if (gameResult.type === 'stalemate') return 'Stalemate — Draw'
    if (gameResult.type === 'draw50') return '50-move rule — Draw'
    if (gameResult.type === 'threefold') return 'Threefold repetition — Draw'
    if (gameResult.type === 'insufficient') return 'Insufficient material — Draw'
    return 'Game over'
  }

  const resultIcon = () => {
    if (!gameResult) return '♟'
    if (gameResult.type === 'checkmate' || gameResult.type === 'resign') return '♔'
    return '🤝'
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden" style={{ background: 'var(--loft-bg)' }}>
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 pb-2 flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)', background: 'var(--loft-bg2)' }}>
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'var(--loft-card)' }}>
          <ChevronLeft size={20} style={{ color: 'var(--loft-text)' }} />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--loft-text)' }}>Chess</h1>
        <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: 'var(--loft-card)', color: 'var(--loft-muted)' }}>
          {mode === 'ai' ? `vs AI · ${difficulty}` : 'Pass & Play'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {/* Undo — 2P only */}
          {mode === '2p' && (
            <button onClick={handleUndo} disabled={historyStack.length === 0}
              className="p-2 rounded-xl transition-opacity" style={{ background: 'var(--loft-card)', opacity: historyStack.length ? 1 : 0.35 }}>
              <RotateCcw size={16} style={{ color: 'var(--loft-text)' }} />
            </button>
          )}
          {/* Offer draw — 2P only */}
          {mode === '2p' && !gameResult && (
            <button onClick={() => setDrawOffer(true)}
              className="p-2 rounded-xl" style={{ background: 'var(--loft-card)' }}>
              <Handshake size={16} style={{ color: 'var(--loft-text)' }} />
            </button>
          )}
          {/* Resign */}
          {!gameResult && (
            <button onClick={handleResign}
              className="p-2 rounded-xl transition-colors"
              style={{ background: resignConfirm ? '#ef4444' : 'var(--loft-card)' }}>
              <Flag size={16} style={{ color: resignConfirm ? '#fff' : 'var(--loft-text)' }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Top captured + player label ── */}
      {/* Top = opponent's side from human perspective */}
      <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
        style={{ background: 'var(--loft-bg2)' }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
          style={{ background: `${c2}22`, border: `2px solid ${c2}`, color: c2 }}>
          {flipped ? '♙' : '♟'}
        </div>
        <div>
          <p className="text-xs font-bold leading-tight" style={{ color: c2 }}>
            {flipped ? whiteLabel : blackLabel}
            <span className="ml-1 font-normal" style={{ color: 'var(--loft-muted)' }}>
              {flipped ? '(White)' : '(Black)'}
            </span>
          </p>
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {renderCaptured(flipped ? capturedB : capturedW)}
          </div>
        </div>
        {/* Check / turn indicator */}
        <div className="ml-auto">
          {inCheck && gs.turn !== (flipped ? 'w' : 'b') && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">Check!</span>
          )}
          {!gameResult && gs.turn === (flipped ? 'w' : 'b') && (
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: c2 }} />
          )}
        </div>
      </div>

      {/* ── Board ── */}
      <div className="flex-1 flex items-center justify-center px-2 py-1">
        <div className="w-full" style={{ maxWidth: 'min(100vw - 16px, calc(100vh - 260px))', aspectRatio: '1' }}>
          <div className="grid w-full h-full" style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}>
            {Array.from({ length: 64 }, (_, i) => renderSquare(i))}
          </div>
        </div>
      </div>

      {/* ── Bottom captured + player label ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0"
        style={{ background: 'var(--loft-bg2)' }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
          style={{ background: `${c1}22`, border: `2px solid ${c1}`, color: c1 }}>
          {flipped ? '♟' : '♙'}
        </div>
        <div>
          <p className="text-xs font-bold leading-tight" style={{ color: c1 }}>
            {flipped ? blackLabel : whiteLabel}
            <span className="ml-1 font-normal" style={{ color: 'var(--loft-muted)' }}>
              {flipped ? '(Black)' : '(White)'}
            </span>
          </p>
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {renderCaptured(flipped ? capturedW : capturedB)}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {inCheck && gs.turn === (flipped ? 'b' : 'w') && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">Check!</span>
          )}
          {aiThinking && (
            <div className="flex gap-1 items-center">
              <span className="text-xs" style={{ color: 'var(--loft-muted)' }}>Thinking</span>
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: c2, animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          )}
          {!gameResult && !aiThinking && gs.turn === (flipped ? 'b' : 'w') && (
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: c1 }} />
          )}
          <span className="text-xs" style={{ color: 'var(--loft-muted)' }}>
            Move {gs.fullMoves}
          </span>
        </div>
      </div>

      {/* ── Turn indicator bar ── */}
      {!gameResult && (
        <div className="flex-shrink-0 px-3 py-1.5" style={{ background: 'var(--loft-bg)' }}>
          <div className="py-1.5 rounded-xl text-center text-xs font-semibold"
            style={{
              background: 'var(--loft-card)',
              color: isP1Turn ? c1 : c2,
            }}>
            {isP1Turn
              ? `${p1Label}'s turn (${humanColor === gs.turn || mode === '2p' ? (gs.turn === 'w' ? 'White' : 'Black') : ''})`
              : `${p2Label}'s turn (${gs.turn === 'w' ? 'White' : 'Black'})`}
          </div>
        </div>
      )}

      {/* ── Resign confirm toast ── */}
      <AnimatePresence>
        {resignConfirm && !gameResult && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-20 left-4 right-4 rounded-2xl p-4 flex items-center gap-3 z-40"
            style={{ background: 'var(--loft-card)', border: '1.5px solid rgba(239,68,68,0.4)' }}>
            <p className="flex-1 text-sm font-semibold" style={{ color: 'var(--loft-text)' }}>
              Tap flag again to confirm resign
            </p>
            <button onClick={() => setResignConfirm(false)} className="text-xs px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--loft-muted)' }}>
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Draw offer ── */}
      <AnimatePresence>
        {drawOffer && !gameResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-50"
            style={{ background: 'rgba(0,0,0,0.65)' }}>
            <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }}
              className="rounded-3xl p-7 mx-5 text-center"
              style={{ background: 'var(--loft-card)', border: '2px solid rgba(255,255,255,0.12)', maxWidth: 300, width: '100%' }}>
              <div className="text-5xl mb-3">🤝</div>
              <h2 className="text-xl font-black mb-2" style={{ color: 'var(--loft-text)' }}>Draw Offered</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--loft-muted)' }}>
                {gs.turn === 'w' ? blackLabel : whiteLabel}, do you accept?
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDrawOffer(false)}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)' }}>
                  Decline
                </button>
                <button
                  onClick={() => { setDrawOffer(false); endGame({ type: 'stalemate' }) }}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: '#3b82f6', color: '#fff' }}>
                  Accept
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Promotion picker ── */}
      <AnimatePresence>
        {promotionPending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-50"
            style={{ background: 'rgba(0,0,0,0.7)' }}>
            <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }}
              className="rounded-3xl p-6 text-center"
              style={{ background: 'var(--loft-card)', border: '2px solid rgba(255,255,255,0.12)' }}>
              <p className="text-sm font-bold mb-4" style={{ color: 'var(--loft-text)' }}>Choose promotion</p>
              <div className="flex gap-4">
                {(['Q','R','B','N'] as PieceType[]).map(type => (
                  <button key={type} onClick={() => handlePromotion(type)}
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl transition-transform active:scale-90"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.15)' }}>
                    {UNICODE[gs.turn][type]}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Game over overlay ── */}
      <AnimatePresence>
        {gameResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center z-50"
            style={{ background: 'rgba(0,0,0,0.72)' }}>
            <motion.div initial={{ scale: 0.82, y: 24 }} animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className="rounded-3xl p-8 text-center mx-5"
              style={{ background: 'var(--loft-card)', border: '2px solid rgba(255,255,255,0.12)', maxWidth: 320, width: '100%' }}>
              <div className="text-6xl mb-4">{resultIcon()}</div>
              <h2 className="text-2xl font-black mb-1 leading-tight"
                style={{ color: resolveWinner(gameResult) === 'p1' ? c1 : resolveWinner(gameResult) === 'p2' ? c2 : 'var(--loft-text)' }}>
                {resultTitle()}
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--loft-muted)' }}>
                {resolveWinner(gameResult) === 'draw'
                  ? 'The game is a draw'
                  : resolveWinner(gameResult) === 'p1'
                    ? `${p1ColorName} takes the win!`
                    : `${p2ColorName} takes the win!`}
              </p>
              <div className="flex gap-3">
                <button onClick={handleBack}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)' }}>
                  {tournamentMode ? 'Back' : 'Back'}
                </button>
                {!tournamentMode && (
                  <button onClick={handleReset}
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
