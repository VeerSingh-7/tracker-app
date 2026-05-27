import React, { useState, useEffect, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Undo2, Lightbulb, RefreshCcw } from 'lucide-react'
import { saveGameScore, getGameScore } from '../db'

// ─── Types ────────────────────────────────────────────────────────────────────
type Suit = '♠' | '♥' | '♦' | '♣'
type Rank = 1|2|3|4|5|6|7|8|9|10|11|12|13

interface Card {
  id: string
  suit: Suit
  rank: Rank
  faceUp: boolean
}

interface GameState {
  tableau: Card[][]
  foundations: Card[][]
  stock: Card[]
  waste: Card[]
  moves: number
  recycleCount: number
  difficulty: 'easy' | 'hard'
  won: boolean
  startTime: number
}

type SelectionSource =
  | { type: 'tableau'; col: number; cardIdx: number }
  | { type: 'waste' }
  | { type: 'foundation'; suitIdx: number }

interface Selection {
  source: SelectionSource
  cards: Card[]
}

interface ValidTarget {
  type: 'tableau' | 'foundation'
  col?: number
  suitIdx?: number
}

interface Props { onBack: () => void }

// ─── Constants ────────────────────────────────────────────────────────────────
const SUITS: Suit[] = ['♠', '♥', '♦', '♣']
const SUIT_IDX: Record<Suit, number> = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 }
const RANK_STR = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const RED_SUITS = new Set<Suit>(['♥', '♦'])
const MAX_RECYCLES_HARD = 3
const MAX_HISTORY = 20
const MAX_HINTS = 3

const CARD_W = 48
const CARD_H = 68
const FACEDOWN_PEEK = 14
const FACEUP_PEEK = 26

// ─── Utilities ────────────────────────────────────────────────────────────────
function cardColor(suit: Suit): 'red' | 'black' {
  return RED_SUITS.has(suit) ? 'red' : 'black'
}

function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ id: `${rank}${suit}`, suit, rank: rank as Rank, faceUp: false })
    }
  }
  return deck
}

function shuffleDeck<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function dealGame(difficulty: 'easy' | 'hard'): GameState {
  const deck = shuffleDeck(createDeck())
  const tableau: Card[][] = Array.from({ length: 7 }, () => [])
  let idx = 0
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      tableau[col].push({ ...deck[idx++], faceUp: row === col })
    }
  }
  return {
    tableau,
    foundations: [[], [], [], []],
    stock: deck.slice(idx).map(c => ({ ...c, faceUp: false })),
    waste: [],
    moves: 0,
    recycleCount: 0,
    difficulty,
    won: false,
    startTime: Date.now(),
  }
}

// ─── Move validation ──────────────────────────────────────────────────────────
function canDropOnTableau(cards: Card[], colCards: Card[]): boolean {
  const top = cards[0]
  if (colCards.length === 0) return top.rank === 13
  const dest = colCards[colCards.length - 1]
  if (!dest.faceUp) return false
  return dest.rank === top.rank + 1 && cardColor(dest.suit) !== cardColor(top.suit)
}

function canDropOnFoundation(card: Card, foundation: Card[]): boolean {
  if (foundation.length === 0) return card.rank === 1
  const top = foundation[foundation.length - 1]
  return top.suit === card.suit && top.rank === card.rank - 1
}

function getValidTargets(sel: Selection, state: GameState): ValidTarget[] {
  const targets: ValidTarget[] = []
  for (let col = 0; col < 7; col++) {
    if (canDropOnTableau(sel.cards, state.tableau[col])) {
      targets.push({ type: 'tableau', col })
    }
  }
  if (sel.cards.length === 1) {
    const suitIdx = SUIT_IDX[sel.cards[0].suit]
    if (canDropOnFoundation(sel.cards[0], state.foundations[suitIdx])) {
      targets.push({ type: 'foundation', suitIdx })
    }
  }
  return targets
}

function checkAutoComplete(state: GameState): boolean {
  return state.tableau.every(col => col.every(c => c.faceUp))
    && state.stock.length === 0
    && state.waste.length === 0
}

function checkWon(state: GameState): boolean {
  return state.foundations.every(f => f.length === 13)
}

// ─── Hint logic ───────────────────────────────────────────────────────────────
function findHint(state: GameState): { cardId: string; targetType: 'tableau' | 'foundation'; targetIdx: number } | null {
  if (state.waste.length > 0) {
    const wc = state.waste[state.waste.length - 1]
    const si = SUIT_IDX[wc.suit]
    if (canDropOnFoundation(wc, state.foundations[si])) {
      return { cardId: wc.id, targetType: 'foundation', targetIdx: si }
    }
  }

  for (let col = 0; col < 7; col++) {
    const cards = state.tableau[col]
    if (cards.length === 0) continue
    const bc = cards[cards.length - 1]
    if (!bc.faceUp) continue
    const si = SUIT_IDX[bc.suit]
    if (canDropOnFoundation(bc, state.foundations[si])) {
      return { cardId: bc.id, targetType: 'foundation', targetIdx: si }
    }
  }

  for (let fromCol = 0; fromCol < 7; fromCol++) {
    const fromCards = state.tableau[fromCol]
    if (fromCards.length === 0) continue
    const firstFaceUp = fromCards.findIndex(c => c.faceUp)
    if (firstFaceUp < 0) continue
    const moving = fromCards.slice(firstFaceUp)
    for (let toCol = 0; toCol < 7; toCol++) {
      if (toCol === fromCol) continue
      if (canDropOnTableau(moving, state.tableau[toCol])) {
        if (firstFaceUp > 0) {
          return { cardId: moving[0].id, targetType: 'tableau', targetIdx: toCol }
        }
      }
    }
  }

  if (state.waste.length > 0) {
    const wc = state.waste[state.waste.length - 1]
    for (let toCol = 0; toCol < 7; toCol++) {
      if (canDropOnTableau([wc], state.tableau[toCol])) {
        return { cardId: wc.id, targetType: 'tableau', targetIdx: toCol }
      }
    }
  }

  // General tableau moves (not just revealing)
  for (let fromCol = 0; fromCol < 7; fromCol++) {
    const fromCards = state.tableau[fromCol]
    if (fromCards.length === 0) continue
    const firstFaceUp = fromCards.findIndex(c => c.faceUp)
    if (firstFaceUp < 0) continue
    const moving = fromCards.slice(firstFaceUp)
    for (let toCol = 0; toCol < 7; toCol++) {
      if (toCol === fromCol) continue
      if (canDropOnTableau(moving, state.tableau[toCol])) {
        return { cardId: moving[0].id, targetType: 'tableau', targetIdx: toCol }
      }
    }
  }

  return null
}

// ─── Apply moves ──────────────────────────────────────────────────────────────
function applyStockClick(state: GameState): GameState {
  if (state.stock.length === 0) {
    const limit = state.difficulty === 'hard' ? MAX_RECYCLES_HARD : Infinity
    if (state.recycleCount >= limit) return state
    const newStock = [...state.waste].reverse().map(c => ({ ...c, faceUp: false }))
    return { ...state, stock: newStock, waste: [], recycleCount: state.recycleCount + 1, moves: state.moves + 1 }
  }
  const count = state.difficulty === 'easy' ? 1 : 3
  const drawn = state.stock.slice(-count).map(c => ({ ...c, faceUp: true }))
  return {
    ...state,
    stock: state.stock.slice(0, state.stock.length - count),
    waste: [...state.waste, ...drawn],
    moves: state.moves + 1,
  }
}

function applyMove(state: GameState, sel: Selection, target: ValidTarget): GameState {
  let newState = { ...state, moves: state.moves + 1 }
  const cards = sel.cards

  if (sel.source.type === 'tableau') {
    const col = sel.source.col
    const newCol = [...newState.tableau[col].slice(0, sel.source.cardIdx)]
    if (newCol.length > 0 && !newCol[newCol.length - 1].faceUp) {
      newCol[newCol.length - 1] = { ...newCol[newCol.length - 1], faceUp: true }
    }
    const newTableau = [...newState.tableau]
    newTableau[col] = newCol
    newState = { ...newState, tableau: newTableau }
  } else if (sel.source.type === 'waste') {
    newState = { ...newState, waste: newState.waste.slice(0, -1) }
  } else if (sel.source.type === 'foundation') {
    const si = sel.source.suitIdx
    const newFoundations = [...newState.foundations]
    newFoundations[si] = newFoundations[si].slice(0, -1)
    newState = { ...newState, foundations: newFoundations }
  }

  if (target.type === 'tableau' && target.col !== undefined) {
    const newTableau = [...newState.tableau]
    newTableau[target.col] = [...newTableau[target.col], ...cards.map(c => ({ ...c, faceUp: true }))]
    newState = { ...newState, tableau: newTableau }
  } else if (target.type === 'foundation' && target.suitIdx !== undefined) {
    const newFoundations = [...newState.foundations]
    newFoundations[target.suitIdx] = [...newFoundations[target.suitIdx], ...cards.map(c => ({ ...c, faceUp: true }))]
    newState = { ...newState, foundations: newFoundations }
    newState = { ...newState, won: checkWon(newState) }
  }

  return newState
}

// ─── Card Component ───────────────────────────────────────────────────────────
interface CardProps {
  card: Card
  selected?: boolean
  highlighted?: boolean
  hinted?: boolean
  onTap: () => void
  onDragStart: (e: React.PointerEvent<HTMLDivElement>) => void
}

const CardComp = memo(function CardComp({ card, selected, highlighted, hinted, onTap, onDragStart }: CardProps) {
  const isRed = RED_SUITS.has(card.suit)
  const textColor = isRed ? '#dc2626' : '#111827'

  let borderStyle = '1px solid rgba(0,0,0,0.15)'
  let boxShadow = '0 2px 6px rgba(0,0,0,0.4)'
  let outline = 'none'

  if (selected) {
    borderStyle = '2px solid #06b6d4'
    boxShadow = '0 0 0 2px #06b6d4, 0 2px 8px rgba(6,182,212,0.5)'
  } else if (hinted) {
    borderStyle = '2px solid #f59e0b'
    boxShadow = '0 0 0 2px #f59e0b, 0 2px 8px rgba(245,158,11,0.5)'
  } else if (highlighted) {
    borderStyle = '2px dashed #06b6d4'
    boxShadow = '0 0 8px rgba(6,182,212,0.3)'
  }

  if (!card.faceUp) {
    return (
      <div
        style={{
          width: CARD_W, height: CARD_H, borderRadius: 6,
          background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2040 100%)',
          border: borderStyle, boxShadow, touchAction: 'none', flexShrink: 0,
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 8px)',
          cursor: 'default',
          outline,
        }}
        onPointerDown={onDragStart}
      />
    )
  }

  return (
    <div
      style={{
        width: CARD_W, height: CARD_H, borderRadius: 6,
        background: '#ffffff', border: borderStyle, boxShadow,
        touchAction: 'none', flexShrink: 0,
        position: 'relative', cursor: 'grab', overflow: 'hidden',
        outline,
      }}
      onPointerDown={onDragStart}
      onClick={onTap}
    >
      {/* Top-left rank+suit */}
      <div style={{
        position: 'absolute', top: 2, left: 3,
        fontSize: 11, fontWeight: 800, lineHeight: 1.1, color: textColor,
        fontFamily: 'Inter, sans-serif',
      }}>
        <div>{RANK_STR[card.rank]}</div>
        <div style={{ fontSize: 10 }}>{card.suit}</div>
      </div>
      {/* Center suit */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: 20, color: textColor, lineHeight: 1,
        userSelect: 'none',
      }}>
        {card.suit}
      </div>
      {/* Bottom-right rank+suit (rotated) */}
      <div style={{
        position: 'absolute', bottom: 2, right: 3,
        fontSize: 11, fontWeight: 800, lineHeight: 1.1, color: textColor,
        fontFamily: 'Inter, sans-serif',
        transform: 'rotate(180deg)',
      }}>
        <div>{RANK_STR[card.rank]}</div>
        <div style={{ fontSize: 10 }}>{card.suit}</div>
      </div>
    </div>
  )
})

// ─── Drag State ───────────────────────────────────────────────────────────────
interface DragState {
  cards: Card[]
  source: SelectionSource
  x: number
  y: number
  startX: number
  startY: number
  originX: number
  originY: number
  cardWidth: number
  cardHeight: number
  dragging: boolean
  pointerId: number
}

// ─── Format time ──────────────────────────────────────────────────────────────
function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${ss.toString().padStart(2, '0')}`
}

// ─── Pre-game Screen ──────────────────────────────────────────────────────────
function PreGameScreen({ onStart }: { onStart: (d: 'easy' | 'hard') => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--loft-bg)' }}>
      <div className="text-6xl mb-4">🃏</div>
      <h1 className="text-3xl font-black mb-2" style={{ color: 'var(--loft-text)' }}>Solitaire</h1>
      <p className="text-sm text-center mb-10" style={{ color: 'var(--loft-muted)' }}>Classic Klondike card game</p>
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={() => onStart('easy')}
          className="w-full rounded-2xl p-5 text-left"
          style={{ background: 'rgba(22,163,74,0.12)', border: '2px solid rgba(22,163,74,0.4)', boxShadow: '0 0 20px rgba(22,163,74,0.1)' }}
        >
          <div className="font-black text-lg mb-1" style={{ color: '#4ade80' }}>Easy</div>
          <div className="text-sm" style={{ color: 'var(--loft-muted)' }}>Flip 1 card · Unlimited recycles</div>
        </button>
        <button
          onClick={() => onStart('hard')}
          className="w-full rounded-2xl p-5 text-left"
          style={{ background: 'rgba(220,38,38,0.12)', border: '2px solid rgba(220,38,38,0.4)', boxShadow: '0 0 20px rgba(220,38,38,0.1)' }}
        >
          <div className="font-black text-lg mb-1" style={{ color: '#f87171' }}>Hard</div>
          <div className="text-sm" style={{ color: 'var(--loft-muted)' }}>Flip 3 cards · 3 recycles only</div>
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Solitaire({ onBack }: Props) {
  const [phase, setPhase] = useState<'pregame' | 'playing'>('pregame')
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [validTargets, setValidTargets] = useState<ValidTarget[]>([])
  const [history, setHistory] = useState<GameState[]>([])
  const [hintCardId, setHintCardId] = useState<string | null>(null)
  const [hintTarget, setHintTarget] = useState<{ type: 'tableau' | 'foundation'; idx: number } | null>(null)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [showNewGameConfirm, setShowNewGameConfirm] = useState(false)
  const [autoCompleting, setAutoCompleting] = useState(false)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoCompleteRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gameStateRef = useRef<GameState | null>(null)
  const historyRef = useRef<GameState[]>([])

  // Keep refs in sync
  useEffect(() => { gameStateRef.current = gameState }, [gameState])
  useEffect(() => { historyRef.current = history }, [history])

  // Timer
  useEffect(() => {
    if (!gameState || gameState.won || phase !== 'playing') {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      if (gameStateRef.current) {
        setElapsed(Date.now() - gameStateRef.current.startTime)
      }
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [gameState?.won, phase, gameState?.startTime])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      if (autoCompleteRef.current) clearTimeout(autoCompleteRef.current)
    }
  }, [])

  // Drag pointer move/up handlers
  useEffect(() => {
    if (!dragRef.current) return

    function onPointerMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      const threshold = d.cards[0].faceUp ? 6 : 999
      if (!d.dragging && Math.sqrt(dx * dx + dy * dy) > threshold) {
        dragRef.current = { ...d, dragging: true }
      }
      dragRef.current = { ...dragRef.current!, x: e.clientX, y: e.clientY }
      setDragState({ ...dragRef.current! })
    }

    function onPointerUp(e: PointerEvent) {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return

      if (d.dragging) {
        // Find drop target
        const el = document.elementFromPoint(e.clientX, e.clientY)
        let target: ValidTarget | null = null
        let node: Element | null = el
        while (node) {
          const dropCol = node.getAttribute('data-drop-col')
          const dropFound = node.getAttribute('data-drop-foundation')
          if (dropCol !== null) {
            target = { type: 'tableau', col: parseInt(dropCol) }
            break
          }
          if (dropFound !== null) {
            target = { type: 'foundation', suitIdx: parseInt(dropFound) }
            break
          }
          node = node.parentElement
        }

        if (target) {
          const gs = gameStateRef.current!
          const selObj: Selection = { source: d.source, cards: d.cards }
          const isValid = target.type === 'tableau'
            ? canDropOnTableau(d.cards, gs.tableau[target.col!])
            : d.cards.length === 1 && canDropOnFoundation(d.cards[0], gs.foundations[target.suitIdx!])

          if (isValid) {
            pushHistory(gs)
            const newGs = applyMove(gs, selObj, target)
            setGameState(newGs)
            setSelection(null)
            setValidTargets([])
            if (newGs.won) handleWin(newGs)
          }
        }
      }

      dragRef.current = null
      setDragState(null)
    }

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    }
  }, [dragState !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  function pushHistory(gs: GameState) {
    setHistory(prev => {
      const next = [...prev, gs]
      return next.slice(-MAX_HISTORY)
    })
  }

  function handleWin(gs: GameState) {
    const elapsedSecs = Math.floor((Date.now() - gs.startTime) / 1000)
    const scoreId = `solitaire_${gs.difficulty}`
    getGameScore(scoreId).then(existing => {
      if (!existing || elapsedSecs < existing.bestScore) {
        saveGameScore({
          gameId: scoreId,
          bestScore: elapsedSecs,
          lastPlayed: new Date().toISOString().split('T')[0],
        })
      }
    })
  }

  function startGame(difficulty: 'easy' | 'hard') {
    const gs = dealGame(difficulty)
    setGameState(gs)
    setHistory([])
    setSelection(null)
    setValidTargets([])
    setHintCardId(null)
    setHintTarget(null)
    setHintsUsed(0)
    setElapsed(0)
    setAutoCompleting(false)
    setPhase('playing')
  }

  function handleStockClick() {
    if (!gameState || autoCompleting) return
    pushHistory(gameState)
    const newGs = applyStockClick(gameState)
    if (newGs === gameState) return
    setGameState(newGs)
    setSelection(null)
    setValidTargets([])
  }

  function handleCardTap(source: SelectionSource, cards: Card[]) {
    if (!gameState || autoCompleting) return
    const card = cards[0]
    if (!card.faceUp) return

    // If same card tapped again
    if (selection) {
      const isSame = (() => {
        if (source.type === 'waste' && selection.source.type === 'waste') return true
        if (source.type === 'tableau' && selection.source.type === 'tableau'
          && source.col === selection.source.col && source.cardIdx === selection.source.cardIdx) return true
        if (source.type === 'foundation' && selection.source.type === 'foundation'
          && source.suitIdx === selection.source.suitIdx) return true
        return false
      })()

      if (isSame) {
        // Try auto-send to foundation
        if (cards.length === 1) {
          const si = SUIT_IDX[cards[0].suit]
          if (canDropOnFoundation(cards[0], gameState.foundations[si])) {
            pushHistory(gameState)
            const newGs = applyMove(gameState, { source, cards }, { type: 'foundation', suitIdx: si })
            setGameState(newGs)
            setSelection(null)
            setValidTargets([])
            if (newGs.won) handleWin(newGs)
            return
          }
        }
        setSelection(null)
        setValidTargets([])
        return
      }

      // Check if tapped card is a valid target
      const target: ValidTarget | null = (() => {
        if (source.type === 'tableau') {
          const col = source.col as number
          // Check if it's a valid tableau target (tapped on empty or top of column)
          const colCards = gameState.tableau[col]
          if (canDropOnTableau(selection.cards, colCards)) {
            return { type: 'tableau' as const, col }
          }
        }
        if (source.type === 'foundation') {
          const si = source.suitIdx as number
          if (selection.cards.length === 1 && canDropOnFoundation(selection.cards[0], gameState.foundations[si])) {
            return { type: 'foundation' as const, suitIdx: si }
          }
        }
        return null
      })()

      if (target) {
        pushHistory(gameState)
        const newGs = applyMove(gameState, selection, target)
        setGameState(newGs)
        setSelection(null)
        setValidTargets([])
        if (newGs.won) handleWin(newGs)
        return
      }

      // New selection
      const newSel: Selection = { source, cards }
      const targets = getValidTargets(newSel, gameState)
      setSelection(newSel)
      setValidTargets(targets)
      return
    }

    // No current selection
    const newSel: Selection = { source, cards }
    const targets = getValidTargets(newSel, gameState)
    setSelection(newSel)
    setValidTargets(targets)
  }

  function handleEmptyColTap(col: number) {
    if (!gameState || autoCompleting) return
    if (selection && canDropOnTableau(selection.cards, [])) {
      pushHistory(gameState)
      const newGs = applyMove(gameState, selection, { type: 'tableau', col })
      setGameState(newGs)
      setSelection(null)
      setValidTargets([])
    } else {
      setSelection(null)
      setValidTargets([])
    }
  }

  function handleFoundationTap(suitIdx: number) {
    if (!gameState || autoCompleting) return
    const foundation = gameState.foundations[suitIdx]

    if (selection) {
      if (selection.cards.length === 1 && canDropOnFoundation(selection.cards[0], foundation)) {
        pushHistory(gameState)
        const newGs = applyMove(gameState, selection, { type: 'foundation', suitIdx })
        setGameState(newGs)
        setSelection(null)
        setValidTargets([])
        if (newGs.won) handleWin(newGs)
        return
      }
      // Select foundation top
      if (foundation.length > 0) {
        const topCard = foundation[foundation.length - 1]
        const src: SelectionSource = { type: 'foundation', suitIdx }
        const newSel: Selection = { source: src, cards: [topCard] }
        const targets = getValidTargets(newSel, gameState)
        setSelection(newSel)
        setValidTargets(targets)
      } else {
        setSelection(null)
        setValidTargets([])
      }
      return
    }

    if (foundation.length > 0) {
      const topCard = foundation[foundation.length - 1]
      const src: SelectionSource = { type: 'foundation', suitIdx }
      const newSel: Selection = { source: src, cards: [topCard] }
      const targets = getValidTargets(newSel, gameState)
      setSelection(newSel)
      setValidTargets(targets)
    }
  }

  function handleUndo() {
    if (history.length === 0 || autoCompleting) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setGameState(prev)
    setSelection(null)
    setValidTargets([])
    setDragState(null)
    dragRef.current = null
  }

  function handleHint() {
    if (!gameState || hintsUsed >= MAX_HINTS || autoCompleting) return
    const hint = findHint(gameState)
    if (!hint) return
    setHintsUsed(h => h + 1)
    setHintCardId(hint.cardId)
    setHintTarget({ type: hint.targetType, idx: hint.targetIdx })
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    hintTimerRef.current = setTimeout(() => {
      setHintCardId(null)
      setHintTarget(null)
    }, 2500)
  }

  function startAutoComplete() {
    if (!gameState || autoCompleting) return
    setAutoCompleting(true)
    runAutoComplete(gameState)
  }

  function runAutoComplete(gs: GameState) {
    // Find next foundation move
    const nextMove = (() => {
      for (let col = 0; col < 7; col++) {
        const cards = gs.tableau[col]
        if (cards.length === 0) continue
        const bc = cards[cards.length - 1]
        if (!bc.faceUp) continue
        const si = SUIT_IDX[bc.suit]
        if (canDropOnFoundation(bc, gs.foundations[si])) {
          const sel: Selection = { source: { type: 'tableau', col, cardIdx: cards.length - 1 }, cards: [bc] }
          const target: ValidTarget = { type: 'foundation', suitIdx: si }
          return { sel, target }
        }
      }
      if (gs.waste.length > 0) {
        const wc = gs.waste[gs.waste.length - 1]
        const si = SUIT_IDX[wc.suit]
        if (canDropOnFoundation(wc, gs.foundations[si])) {
          const sel: Selection = { source: { type: 'waste' }, cards: [wc] }
          const target: ValidTarget = { type: 'foundation', suitIdx: si }
          return { sel, target }
        }
      }
      return null
    })()

    if (!nextMove) {
      setAutoCompleting(false)
      return
    }

    const newGs = applyMove(gs, nextMove.sel, nextMove.target)
    setGameState(newGs)

    if (newGs.won) {
      setAutoCompleting(false)
      handleWin(newGs)
      return
    }

    autoCompleteRef.current = setTimeout(() => runAutoComplete(newGs), 100)
  }

  function handleNewGame() {
    if (!gameState || gameState.won) {
      setPhase('pregame')
      return
    }
    setShowNewGameConfirm(true)
  }

  function isCardSelected(cardId: string): boolean {
    return selection?.cards.some(c => c.id === cardId) ?? false
  }

  function isColumnHighlighted(col: number): boolean {
    return validTargets.some(t => t.type === 'tableau' && t.col === col)
  }

  function isFoundationHighlighted(suitIdx: number): boolean {
    return validTargets.some(t => t.type === 'foundation' && t.suitIdx === suitIdx)
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>, source: SelectionSource, cards: Card[]) {
    if (!gameState || autoCompleting) return
    if (!cards[0].faceUp) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const ds: DragState = {
      cards,
      source,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
      cardWidth: CARD_W,
      cardHeight: CARD_H,
      dragging: false,
      pointerId: e.pointerId,
    }
    dragRef.current = ds
    setDragState(ds)
  }

  if (phase === 'pregame') {
    return (
      <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
        <div className="flex items-center gap-3 px-4 pb-3 flex-shrink-0"
          style={{ paddingTop: 'env(safe-area-inset-top)', background: 'var(--loft-bg2)' }}>
          <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'var(--loft-card)' }}>
            <ChevronLeft size={20} style={{ color: 'var(--loft-text)' }} />
          </button>
          <h1 className="text-xl font-bold" style={{ color: 'var(--loft-text)' }}>Solitaire</h1>
        </div>
        <div className="flex-1">
          <PreGameScreen onStart={startGame} />
        </div>
      </div>
    )
  }

  if (!gameState) return null

  const isAutoCompleteReady = checkAutoComplete(gameState)
  const canUndo = history.length > 0 && !autoCompleting
  const canHint = hintsUsed < MAX_HINTS && !autoCompleting && !gameState.won

  return (
    <div className="h-full flex flex-col select-none" style={{ background: '#0d4a2a' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 pb-2"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 6px)',
          background: 'rgba(13,74,42,0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
        <button onClick={onBack} className="p-1.5 rounded-lg flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.1)' }}>
          <ChevronLeft size={18} color="white" />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-xs font-bold text-white/70">Moves: <span className="text-white">{gameState.moves}</span></span>
          <span className="text-xs font-bold text-white/70">{formatTime(elapsed)}</span>
          {gameState.difficulty === 'hard' && (
            <span className="text-xs text-red-300/70">
              Recycles: {Math.max(0, MAX_RECYCLES_HARD - gameState.recycleCount)}
            </span>
          )}
        </div>
        <button
          onClick={handleNewGame}
          className="px-2.5 py-1 rounded-lg text-xs font-bold flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}>
          New
        </button>
      </div>

      {/* Top Row: Stock + Waste + Foundations */}
      <div className="flex-shrink-0 flex items-center px-3 py-2 gap-2">
        {/* Stock */}
        <div
          style={{ width: CARD_W, height: CARD_H, borderRadius: 6, flexShrink: 0, cursor: 'pointer', position: 'relative' }}
          onClick={handleStockClick}
        >
          {gameState.stock.length > 0 ? (
            <div style={{
              width: CARD_W, height: CARD_H, borderRadius: 6,
              background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2040 100%)',
              border: '1px solid rgba(255,255,255,0.15)',
              backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{gameState.stock.length}</span>
            </div>
          ) : (
            <div style={{
              width: CARD_W, height: CARD_H, borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              border: '1px dashed rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {gameState.difficulty === 'hard' && gameState.recycleCount >= MAX_RECYCLES_HARD ? (
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>✕</span>
              ) : (
                <RefreshCcw size={16} color="rgba(255,255,255,0.4)" />
              )}
            </div>
          )}
        </div>

        {/* Waste */}
        <div style={{ width: CARD_W * (gameState.difficulty === 'hard' ? 1.4 : 1), height: CARD_H, position: 'relative', flexShrink: 0 }}>
          {gameState.waste.length === 0 ? (
            <div style={{
              width: CARD_W, height: CARD_H, borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px dashed rgba(255,255,255,0.15)',
            }} />
          ) : (
            <>
              {/* In hard mode, show up to 3 waste cards */}
              {gameState.difficulty === 'hard' && gameState.waste.length >= 3 && (
                <div style={{
                  position: 'absolute', left: 0, top: 0,
                  width: CARD_W, height: CARD_H, borderRadius: 6,
                  background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2040 100%)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }} />
              )}
              {gameState.difficulty === 'hard' && gameState.waste.length >= 2 && (
                <div style={{
                  position: 'absolute', left: 8, top: 0,
                  width: CARD_W, height: CARD_H, borderRadius: 6,
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,0.15)',
                  display: 'flex', alignItems: 'flex-start', padding: 2,
                  overflow: 'hidden',
                }}>
                  {(() => {
                    const c = gameState.waste[gameState.waste.length - 2]
                    const isR = RED_SUITS.has(c.suit)
                    return <span style={{ fontSize: 9, fontWeight: 800, color: isR ? '#dc2626' : '#111' }}>{RANK_STR[c.rank]}{c.suit}</span>
                  })()}
                </div>
              )}
              {/* Top waste card - interactive */}
              <div
                style={{
                  position: 'absolute',
                  left: gameState.difficulty === 'hard' && gameState.waste.length >= 2 ? 16 : 0,
                  top: 0, zIndex: 2,
                }}
              >
                {(() => {
                  const topCard = gameState.waste[gameState.waste.length - 1]
                  const isSelected = isCardSelected(topCard.id)
                  const isHinted = hintCardId === topCard.id
                  return (
                    <CardComp
                      key={topCard.id}
                      card={topCard}
                      selected={isSelected}
                      hinted={isHinted}
                      onTap={() => handleCardTap({ type: 'waste' }, [topCard])}
                      onDragStart={(e) => {
                        onCardPointerDown(e, { type: 'waste' }, [topCard])
                        // prevent click after drag
                      }}
                    />
                  )
                })()}
              </div>
            </>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Foundations */}
        <div className="flex gap-1.5">
          {SUITS.map((suit, si) => {
            const foundation = gameState.foundations[si]
            const topCard = foundation.length > 0 ? foundation[foundation.length - 1] : null
            const isHighlighted = isFoundationHighlighted(si)
            const isHinted = hintTarget?.type === 'foundation' && hintTarget.idx === si
            const isSelected = selection?.source.type === 'foundation' && selection.source.suitIdx === si
            const isRedSuit = RED_SUITS.has(suit)

            return (
              <div
                key={suit}
                data-drop-foundation={si}
                style={{
                  width: CARD_W, height: CARD_H, borderRadius: 6, cursor: 'pointer',
                  position: 'relative', flexShrink: 0,
                  background: topCard ? undefined : 'rgba(255,255,255,0.08)',
                  border: isHinted
                    ? '2px solid #f59e0b'
                    : isHighlighted
                      ? '2px dashed #06b6d4'
                      : isSelected
                        ? '2px solid #06b6d4'
                        : '1px solid rgba(255,255,255,0.15)',
                  boxShadow: isHinted
                    ? '0 0 8px rgba(245,158,11,0.5)'
                    : isHighlighted
                      ? '0 0 8px rgba(6,182,212,0.3)'
                      : undefined,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onClick={() => handleFoundationTap(si)}
              >
                {!topCard && (
                  <span style={{ fontSize: 18, opacity: 0.3, color: isRedSuit ? '#dc2626' : '#111' }}>{suit}</span>
                )}
                {topCard && (
                  <div style={{ position: 'absolute', inset: 0 }}>
                    <CardComp
                      key={topCard.id}
                      card={topCard}
                      selected={isSelected}
                      highlighted={isHighlighted && !isSelected}
                      hinted={isHinted}
                      onTap={() => handleFoundationTap(si)}
                      onDragStart={(e) => onCardPointerDown(e, { type: 'foundation', suitIdx: si }, [topCard])}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Tableau */}
      <div className="flex-1 overflow-hidden px-1.5 pb-1"
        onClick={() => { if (selection) { setSelection(null); setValidTargets([]) } }}>
        <div style={{ display: 'flex', gap: 4, height: '100%', alignItems: 'flex-start' }}>
          {gameState.tableau.map((colCards, col) => {
            const isEmpty = colCards.length === 0
            const colHighlighted = isColumnHighlighted(col)
            const isHintedTarget = hintTarget?.type === 'tableau' && hintTarget.idx === col

            return (
              <div
                key={col}
                data-drop-col={col}
                style={{
                  width: CARD_W, flexShrink: 0,
                  minHeight: CARD_H,
                  position: 'relative',
                  borderRadius: 6,
                  background: isEmpty ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: isEmpty
                    ? (colHighlighted || isHintedTarget)
                      ? '2px dashed #06b6d4'
                      : '1px dashed rgba(255,255,255,0.12)'
                    : 'none',
                  boxShadow: (colHighlighted || isHintedTarget) && isEmpty ? '0 0 8px rgba(6,182,212,0.3)' : undefined,
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (isEmpty) handleEmptyColTap(col)
                }}
              >
                {colCards.map((card, cardIdx) => {
                  const marginTop = cardIdx === 0 ? 0 : (colCards[cardIdx - 1].faceUp ? -CARD_H + FACEUP_PEEK : -CARD_H + FACEDOWN_PEEK)
                  const isSelected = isCardSelected(card.id)
                  const isHinted = hintCardId === card.id

                  // Whether this card is part of the highlighted valid target column
                  const isAtTopOfHighlightedCol = colHighlighted && cardIdx === colCards.length - 1

                  const source: SelectionSource = { type: 'tableau', col, cardIdx }
                  const dragCards = colCards.slice(cardIdx)

                  return (
                    <div
                      key={card.id}
                      data-drop-col={col}
                      style={{
                        marginTop: cardIdx === 0 ? 0 : marginTop,
                        position: 'relative', zIndex: cardIdx,
                        opacity: (dragState?.dragging && dragState.source.type === 'tableau'
                          && dragState.source.col === col
                          && dragState.source.cardIdx <= cardIdx) ? 0.3 : 1,
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (card.faceUp) handleCardTap(source, dragCards)
                      }}
                    >
                      <CardComp
                        card={card}
                        selected={isSelected}
                        highlighted={isAtTopOfHighlightedCol && !isSelected}
                        hinted={isHinted}
                        onTap={() => {
                          if (card.faceUp) handleCardTap(source, dragCards)
                        }}
                        onDragStart={(e) => {
                          e.stopPropagation()
                          if (card.faceUp) onCardPointerDown(e, source, dragCards)
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex-shrink-0 flex items-center justify-around px-4 py-2"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
          background: 'rgba(0,0,0,0.3)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className="flex flex-col items-center gap-1 p-2 rounded-xl transition-opacity"
          style={{ opacity: canUndo ? 1 : 0.35, background: 'rgba(255,255,255,0.08)' }}>
          <Undo2 size={18} color="white" />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Undo</span>
        </button>

        <button
          onClick={handleHint}
          disabled={!canHint}
          className="flex flex-col items-center gap-1 p-2 rounded-xl transition-opacity"
          style={{
            opacity: canHint ? 1 : 0.35,
            background: canHint ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.08)',
            border: canHint ? '1px solid rgba(245,158,11,0.3)' : 'none',
          }}>
          <Lightbulb size={18} color={canHint ? '#f59e0b' : 'white'} />
          <span style={{ fontSize: 10, color: canHint ? '#f59e0b' : 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
            Hint {MAX_HINTS - hintsUsed}
          </span>
        </button>

        {isAutoCompleteReady && !gameState.won && (
          <button
            onClick={startAutoComplete}
            disabled={autoCompleting}
            className="flex flex-col items-center gap-1 p-2 rounded-xl"
            style={{
              background: 'rgba(22,163,74,0.2)',
              border: '1px solid rgba(22,163,74,0.5)',
            }}>
            <span style={{ fontSize: 12 }}>⚡</span>
            <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 700 }}>
              {autoCompleting ? 'Finishing...' : 'Auto-Complete'}
            </span>
          </button>
        )}
      </div>

      {/* Drag Ghost */}
      {dragState?.dragging && (
        <div style={{
          position: 'fixed',
          left: dragState.x - CARD_W / 2,
          top: dragState.y - CARD_H / 2,
          zIndex: 1000,
          pointerEvents: 'none',
        }}>
          {dragState.cards.map((card, i) => (
            <div key={card.id} style={{ marginTop: i === 0 ? 0 : -CARD_H + FACEUP_PEEK }}>
              <CardComp
                card={card}
                onTap={() => {}}
                onDragStart={() => {}}
              />
            </div>
          ))}
        </div>
      )}

      {/* New Game Confirm */}
      <AnimatePresence>
        {showNewGameConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', zIndex: 50 }}
            onClick={() => setShowNewGameConfirm(false)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="rounded-3xl p-6 mx-6 w-full max-w-xs"
              style={{ background: '#0d2a1a', border: '1.5px solid rgba(255,255,255,0.12)' }}>
              <p className="font-black text-lg text-white text-center mb-2">New Game?</p>
              <p className="text-sm text-center mb-6" style={{ color: 'rgba(255,255,255,0.55)' }}>
                Current progress will be lost
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewGameConfirm(false)}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowNewGameConfirm(false)
                    setPhase('pregame')
                  }}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: '#16a34a', color: '#fff' }}>
                  New Game
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Win Overlay */}
      <AnimatePresence>
        {gameState.won && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.8)', zIndex: 50 }}>
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.1 }}
              className="rounded-3xl p-8 mx-6 w-full max-w-xs text-center"
              style={{ background: '#0d2a1a', border: '1.5px solid rgba(255,255,255,0.12)' }}>
              <motion.div
                initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.2 }}
                className="text-6xl mb-3">🏆</motion.div>
              <h2 className="text-3xl font-black text-white mb-2">You Won!</h2>
              <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Time: <span className="text-white font-bold">{formatTime(elapsed)}</span>
              </p>
              <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Moves: <span className="text-white font-bold">{gameState.moves}</span>
              </p>
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Hints used: <span className="text-white font-bold">{hintsUsed}</span>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={onBack}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                  Back
                </button>
                <button
                  onClick={() => startGame(gameState.difficulty)}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: '#16a34a', color: '#fff', boxShadow: '0 0 16px rgba(22,163,74,0.4)' }}>
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
