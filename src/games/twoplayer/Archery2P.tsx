import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { saveGameScore, getGameScore } from '../../db'
import type { TwoPlayerGameProps } from './types'

const ARROWS_EACH = 5
const ANNOUNCE_FRAMES = 90   // 1.5s at 60fps
const SCORED_FRAMES = 90
const FLY_FRAMES = 80
const POWER_SPEED = 0.055
const ANGLE_SPEED = 0.065

interface ArchState {
  phase: 'announce' | 'power' | 'angle' | 'flying' | 'scored' | 'done'
  currentTurn: number   // 0-indexed, 0=P1 first, alternating. Turn 0=P1 arrow1, Turn1=P2 arrow1...
  p1Scores: number[]
  p2Scores: number[]
  suddenDeath: boolean
  sdRound: number
  sdP1: number | null
  sdP2: number | null
  powerPhase: number    // oscillator state in radians
  anglePhase: number
  lockedPower: number
  lockedAngle: number
  wind: number
  flyT: number          // 0..FLY_FRAMES
  hitDX: number
  hitDY: number
  arrowScore: number
  winner: 'p1' | 'p2' | null
  announceTimer: number
  scoredTimer: number
  aiTapScheduled: boolean
  aiTapFrame: number
  aiPhase: 'power' | 'angle' | 'none'
  w: number
  h: number
}

function isP1Turn(state: ArchState): boolean {
  if (state.suddenDeath) return state.sdP1 === null
  // turns alternate P1/P2 P1/P2... Turn index 0,2,4,6,8 = P1, 1,3,5,7,9 = P2
  return state.currentTurn % 2 === 0
}

function computeScore(hitDX: number, hitDY: number, R: number): number {
  const dist = Math.sqrt(hitDX * hitDX + hitDY * hitDY)
  const r = dist / R
  if (r <= 0.12) return 10
  if (r <= 0.28) return 9
  if (r <= 0.44) return 8
  if (r <= 0.60) return 7
  if (r <= 0.76) return 6
  if (r <= 0.92) return 5
  return 0
}

function generateTap(difficulty: 'easy' | 'medium' | 'hard'): number {
  // How many frames after "window opens" does the AI tap?
  if (difficulty === 'hard') return 10
  if (difficulty === 'medium') return 10 + Math.floor(Math.random() * 15)
  return 15 + Math.floor(Math.random() * 20)
}

export default function Archery2P({
  mode, difficulty = 'medium', p1Color = 'red',
  onBack, onGameEnd, tournamentMode,
}: TwoPlayerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<ArchState | null>(null)
  const [scores, setScores] = useState<[number, number]>([0, 0])
  const [gameResult, setGameResult] = useState<'p1' | 'p2' | 'draw' | null>(null)
  const gameResultRef = useRef<'p1' | 'p2' | 'draw' | null>(null)
  const [uiPhase, setUiPhase] = useState<ArchState['phase']>('announce')

  const c1 = p1Color === 'red' ? '#ef4444' : '#3b82f6'
  const c2 = p1Color === 'red' ? '#3b82f6' : '#ef4444'

  const saveScore = async (w: 'p1' | 'p2' | 'draw') => {
    const id = `archery_${mode === 'ai' ? `ai_${difficulty}` : '2p'}`
    const existing = await getGameScore(id)
    const wins = (existing?.bestScore ?? 0) + (w === 'p1' ? 1 : 0)
    await saveGameScore({ gameId: id, bestScore: wins, lastPlayed: new Date().toISOString() })
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let rafId = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evListeners: { ev: string; fn: (e: any) => void; opts?: AddEventListenerOptions }[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addEv = (ev: string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      canvas.addEventListener(ev, fn as EventListenerOrEventListenerObject, opts)
      evListeners.push({ ev, fn, opts })
    }
    const cleanup = () => {
      cancelAnimationFrame(rafId)
      evListeners.forEach(({ ev, fn, opts }) =>
        canvas.removeEventListener(ev, fn as EventListenerOrEventListenerObject, opts))
      evListeners.length = 0
    }

    const initAndRun = () => {
      cleanup()
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 50 || rect.height < 100) {
        rafId = requestAnimationFrame(initAndRun)
        return
      }
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      const W = rect.width, H = rect.height

      const prev = stateRef.current
      const s: ArchState = {
        phase: 'announce',
        currentTurn: prev?.currentTurn ?? 0,
        p1Scores: prev?.p1Scores ?? [],
        p2Scores: prev?.p2Scores ?? [],
        suddenDeath: prev?.suddenDeath ?? false,
        sdRound: prev?.sdRound ?? 0,
        sdP1: prev?.sdP1 ?? null,
        sdP2: prev?.sdP2 ?? null,
        powerPhase: 0,
        anglePhase: 0,
        lockedPower: 0.5,
        lockedAngle: 0.5,
        wind: (Math.random() - 0.5) * 0.6,
        flyT: 0,
        hitDX: 0,
        hitDY: 0,
        arrowScore: 0,
        winner: prev?.winner ?? null,
        announceTimer: 0,
        scoredTimer: 0,
        aiTapScheduled: false,
        aiTapFrame: 0,
        aiPhase: 'none',
        w: W,
        h: H,
      }
      if (s.winner) s.phase = 'done'
      stateRef.current = s

      // Tap to fire
      const handleTap = () => {
        if (s.phase === 'power') {
          s.lockedPower = Math.sin(s.powerPhase) * 0.5 + 0.5
          s.phase = 'angle'
          s.anglePhase = 0
          s.aiTapScheduled = false
          s.aiPhase = 'angle'
        } else if (s.phase === 'angle') {
          s.lockedAngle = Math.sin(s.anglePhase) * 0.5 + 0.5
          s.phase = 'flying'
          s.flyT = 0
          const R = Math.min(W, H) * 0.28
          const powerDev = s.lockedPower - 0.5
          const windAdjOptAngle = 0.5 - s.wind * 0.3
          const angleDev = s.lockedAngle - windAdjOptAngle
          s.hitDX = angleDev * 3.0 * R + s.wind * R * 0.8
          s.hitDY = powerDev * 2.5 * R
          s.arrowScore = computeScore(s.hitDX, s.hitDY, R)
        }
      }

      addEv('touchstart', (e: TouchEvent) => { e.preventDefault(); handleTap() }, { passive: false })
      addEv('mousedown', () => handleTap())

      // AI logic
      const scheduleAITap = (phase: 'power' | 'angle') => {
        s.aiTapScheduled = true
        s.aiTapFrame = generateTap(difficulty)
        s.aiPhase = phase
      }

      const getAIOptimalPower = () => {
        // AI wants power ~0.5 (optimal)
        // Easy: within 0.25, Medium: within 0.12, Hard: within 0.04
        return 0.5
      }
      const getAIOptimalAngle = () => {
        // Hard: compensates for wind
        if (difficulty === 'hard') return 0.5 - s.wind * 0.3
        if (difficulty === 'medium') return 0.5 - s.wind * 0.15
        return 0.5
      }
      const powerTolerance = difficulty === 'hard' ? 0.04 : difficulty === 'medium' ? 0.12 : 0.25
      const angleTolerance = difficulty === 'hard' ? 0.04 : difficulty === 'medium' ? 0.12 : 0.25

      const update = () => {
        const isAITurn = mode === 'ai' && !isP1Turn(s)

        if (s.phase === 'announce') {
          s.announceTimer++
          if (s.announceTimer >= ANNOUNCE_FRAMES) {
            s.phase = 'power'
            s.powerPhase = 0
            s.aiTapScheduled = false
            if (isAITurn) scheduleAITap('power')
          }
          return
        }

        if (s.phase === 'power') {
          s.powerPhase += POWER_SPEED
          if (isAITurn && !s.aiTapScheduled) scheduleAITap('power')
          if (isAITurn && s.aiTapScheduled && s.aiPhase === 'power') {
            const cur = Math.sin(s.powerPhase) * 0.5 + 0.5
            const inWindow = Math.abs(cur - getAIOptimalPower()) < powerTolerance
            if (inWindow) {
              s.aiTapFrame--
              if (s.aiTapFrame <= 0) handleTap()
            }
          }
          return
        }

        if (s.phase === 'angle') {
          s.anglePhase += ANGLE_SPEED
          if (isAITurn && !s.aiTapScheduled) scheduleAITap('angle')
          if (isAITurn && s.aiTapScheduled && s.aiPhase === 'angle') {
            const cur = Math.sin(s.anglePhase) * 0.5 + 0.5
            const optAngle = getAIOptimalAngle()
            const inWindow = Math.abs(cur - optAngle) < angleTolerance
            if (inWindow) {
              s.aiTapFrame--
              if (s.aiTapFrame <= 0) handleTap()
            }
          }
          return
        }

        if (s.phase === 'flying') {
          s.flyT++
          if (s.flyT >= FLY_FRAMES) {
            // Record score
            if (s.suddenDeath) {
              if (s.sdP1 === null) {
                s.sdP1 = s.arrowScore
              } else {
                s.sdP2 = s.arrowScore
                // Both done
                if (s.sdP1 > s.sdP2) { s.winner = 'p1'; s.phase = 'done' }
                else if (s.sdP2 > s.sdP1) { s.winner = 'p2'; s.phase = 'done' }
                else {
                  // Still tied — another SD round
                  s.sdRound++
                  s.sdP1 = null
                  s.sdP2 = null
                  s.currentTurn += 2 // advance so isP1Turn resets properly
                  s.phase = 'announce'
                  s.announceTimer = 0
                  s.wind = (Math.random() - 0.5) * 0.6
                }
              }
              if (s.phase === 'done') {
                const winner = s.winner!
                gameResultRef.current = winner
                setGameResult(winner)
                saveScore(winner)
              }
            } else {
              if (isP1Turn(s)) {
                s.p1Scores.push(s.arrowScore)
              } else {
                s.p2Scores.push(s.arrowScore)
              }
              s.currentTurn++
              setScores([
                s.p1Scores.reduce((a, b) => a + b, 0),
                s.p2Scores.reduce((a, b) => a + b, 0),
              ])

              const totalTurns = ARROWS_EACH * 2
              if (s.currentTurn >= totalTurns) {
                const p1Total = s.p1Scores.reduce((a, b) => a + b, 0)
                const p2Total = s.p2Scores.reduce((a, b) => a + b, 0)
                if (p1Total === p2Total) {
                  // Sudden death
                  s.suddenDeath = true
                  s.sdRound = 0
                  s.sdP1 = null
                  s.sdP2 = null
                  s.phase = 'scored'
                  s.scoredTimer = 0
                } else {
                  s.winner = p1Total > p2Total ? 'p1' : 'p2'
                  s.phase = 'done'
                  const winner = s.winner
                  gameResultRef.current = winner
                  setGameResult(winner)
                  saveScore(winner)
                }
              } else {
                s.phase = 'scored'
                s.scoredTimer = 0
              }
            }
          }
          return
        }

        if (s.phase === 'scored') {
          s.scoredTimer++
          if (s.scoredTimer >= SCORED_FRAMES) {
            s.phase = 'announce'
            s.announceTimer = 0
            s.wind = (Math.random() - 0.5) * 0.6
            s.aiTapScheduled = false
          }
          return
        }
      }

      const drawTarget = (ctx2: CanvasRenderingContext2D, W2: number, H2: number) => {
        const cx = W2 / 2
        const cy = H2 * 0.32
        const R = Math.min(W2, H2) * 0.28
        const rings = [
          { r: R, fill: '#1a5276' },
          { r: R * 0.92, fill: '#000' },
          { r: R * 0.76, fill: '#1a5276' },
          { r: R * 0.60, fill: '#c0392b' },
          { r: R * 0.44, fill: '#e74c3c' },
          { r: R * 0.28, fill: '#ffd700' },
          { r: R * 0.12, fill: '#fff700' },
        ]
        for (const ring of rings) {
          ctx2.beginPath(); ctx2.arc(cx, cy, ring.r, 0, Math.PI * 2)
          ctx2.fillStyle = ring.fill; ctx2.fill()
          ctx2.strokeStyle = 'rgba(255,255,255,0.2)'; ctx2.lineWidth = 1; ctx2.stroke()
        }
      }

      const drawMeter = (
        ctx2: CanvasRenderingContext2D, W2: number, H2: number,
        value: number, label: string, color: string
      ) => {
        const barW = W2 * 0.65, barH = 28
        const bx = (W2 - barW) / 2, by = H2 - 80
        ctx2.fillStyle = 'rgba(0,0,0,0.6)'
        ctx2.beginPath(); ctx2.roundRect(bx - 2, by - 2, barW + 4, barH + 4, 8)
        ctx2.fill()
        ctx2.fillStyle = 'rgba(255,255,255,0.1)'
        ctx2.beginPath(); ctx2.roundRect(bx, by, barW, barH, 6)
        ctx2.fill()
        ctx2.fillStyle = color
        ctx2.beginPath(); ctx2.roundRect(bx, by, barW * value, barH, 6)
        ctx2.fill()
        // Optimal marker
        ctx2.strokeStyle = 'rgba(255,255,255,0.8)'; ctx2.lineWidth = 2
        ctx2.setLineDash([4, 2])
        ctx2.beginPath(); ctx2.moveTo(bx + barW * 0.5, by - 4); ctx2.lineTo(bx + barW * 0.5, by + barH + 4)
        ctx2.stroke(); ctx2.setLineDash([])
        ctx2.font = 'bold 13px Inter, system-ui'; ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle'
        ctx2.fillStyle = '#fff'
        ctx2.fillText(label, W2 / 2, by + barH / 2)
        // Tap hint
        ctx2.font = '11px Inter, system-ui'; ctx2.fillStyle = 'rgba(255,255,255,0.5)'
        ctx2.fillText('TAP TO LOCK', W2 / 2, by + barH + 18)
      }

      const drawWind = (ctx2: CanvasRenderingContext2D, W2: number, wind: number) => {
        const pct = Math.round(Math.abs(wind) / 0.3 * 100)
        const dir = wind > 0 ? '→' : '←'
        ctx2.font = 'bold 13px Inter, system-ui'; ctx2.textAlign = 'center'; ctx2.textBaseline = 'top'
        ctx2.fillStyle = 'rgba(255,255,255,0.8)'
        ctx2.fillText(`Wind: ${dir} ${pct}%`, W2 / 2, 8)
      }

      const drawArrow = (ctx2: CanvasRenderingContext2D, W2: number, H2: number, t: number) => {
        const R = Math.min(W2, H2) * 0.28
        const targetX = W2 / 2, targetY = H2 * 0.32
        const startX = W2 / 2, startY = H2 - 50
        const endX = targetX + s.hitDX, endY = targetY + s.hitDY
        const progress = t / FLY_FRAMES
        const curX = startX + (endX - startX) * progress
        const curY = startY + (endY - startY) * progress

        ctx2.strokeStyle = '#d97706'; ctx2.lineWidth = 2; ctx2.lineCap = 'round'
        ctx2.beginPath(); ctx2.moveTo(startX, startY); ctx2.lineTo(curX, curY); ctx2.stroke()
        // Arrow head
        ctx2.fillStyle = '#d97706'
        ctx2.beginPath(); ctx2.arc(curX, curY, 4, 0, Math.PI * 2); ctx2.fill()

        if (t >= FLY_FRAMES) {
          // Hit marker
          const dist = Math.sqrt(s.hitDX * s.hitDX + s.hitDY * s.hitDY)
          const isHit = dist <= R * 1.15
          ctx2.strokeStyle = isHit ? '#fff' : 'rgba(255,0,0,0.6)'; ctx2.lineWidth = 2
          if (isHit) {
            ctx2.beginPath(); ctx2.moveTo(endX - 6, endY - 6); ctx2.lineTo(endX + 6, endY + 6); ctx2.stroke()
            ctx2.beginPath(); ctx2.moveTo(endX + 6, endY - 6); ctx2.lineTo(endX - 6, endY + 6); ctx2.stroke()
          }
        }
        void R
      }

      const render = () => {
        ctx.clearRect(0, 0, W, H)
        // Background
        const bg = ctx.createLinearGradient(0, 0, 0, H)
        bg.addColorStop(0, '#0f0522'); bg.addColorStop(1, '#030110')
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

        drawTarget(ctx, W, H)
        drawWind(ctx, W, s.wind)

        // Archer silhouette at bottom
        ctx.fillStyle = c1
        ctx.fillRect(W / 2 - 4, H - 70, 8, 40)
        ctx.beginPath(); ctx.arc(W / 2, H - 80, 12, 0, Math.PI * 2); ctx.fill()

        // Scores at corners
        const p1Total = s.p1Scores.reduce((a, b) => a + b, 0) + (s.sdP1 ?? 0)
        const p2Total = s.p2Scores.reduce((a, b) => a + b, 0) + (s.sdP2 ?? 0)
        ctx.font = 'bold 28px Inter, system-ui'; ctx.textBaseline = 'top'
        ctx.fillStyle = c1; ctx.textAlign = 'left'; ctx.fillText(String(p1Total), 14, 28)
        ctx.fillStyle = c2; ctx.textAlign = 'right'; ctx.fillText(String(p2Total), W - 14, 28)

        // Arrow counter
        const totalArrows = s.suddenDeath
          ? `SD Round ${s.sdRound + 1}`
          : (() => {
              const p1Used = s.p1Scores.length
              const p2Used = s.p2Scores.length
              const currentIsP1 = isP1Turn(s)
              const arrowNum = currentIsP1 ? p1Used + 1 : p2Used + 1
              return `Arrow ${Math.min(arrowNum, ARROWS_EACH)}/${ARROWS_EACH}`
            })()
        ctx.font = 'bold 13px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(totalArrows, W / 2, 30)

        const currentIsP1 = isP1Turn(s)
        const currentColor = currentIsP1 ? c1 : c2

        if (s.phase === 'announce') {
          ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H)
          const label = s.suddenDeath
            ? 'SUDDEN DEATH!'
            : currentIsP1
              ? (mode === 'ai' ? 'Your Turn' : `P1's Turn (${p1Color === 'red' ? 'Red' : 'Blue'})`)
              : (mode === 'ai' ? 'AI Turn' : `P2's Turn (${p1Color === 'red' ? 'Blue' : 'Red'})`)
          ctx.font = 'bold 30px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillStyle = currentColor; ctx.shadowColor = currentColor; ctx.shadowBlur = 20
          ctx.fillText(label, W / 2, H / 2)
          ctx.shadowBlur = 0
        }

        if (s.phase === 'power') {
          const val = Math.sin(s.powerPhase) * 0.5 + 0.5
          drawMeter(ctx, W, H, val, 'POWER', currentColor)
        }

        if (s.phase === 'angle') {
          const val = Math.sin(s.anglePhase) * 0.5 + 0.5
          drawMeter(ctx, W, H, val, 'AIM', currentColor)
        }

        if (s.phase === 'flying' || s.phase === 'scored') {
          const t = s.phase === 'flying' ? s.flyT : FLY_FRAMES
          drawArrow(ctx, W, H, t)

          if (s.phase === 'scored') {
            // Score pop
            ctx.font = 'bold 48px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            const scoreLabel = s.arrowScore === 0 ? 'MISS!' : `+${s.arrowScore}`
            ctx.fillStyle = s.arrowScore >= 9 ? '#ffd700' : s.arrowScore >= 7 ? '#ef4444' : s.arrowScore >= 5 ? '#3b82f6' : 'rgba(255,255,255,0.5)'
            ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20
            ctx.fillText(scoreLabel, W / 2, H * 0.65)
            ctx.shadowBlur = 0
            if (s.suddenDeath && s.sdP1 !== null && s.sdP2 !== null) {
              ctx.font = 'bold 16px Inter, system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.7)'
              ctx.fillText(`SD: ${s.sdP1} vs ${s.sdP2}`, W / 2, H * 0.75)
            }
          }
        }

        setUiPhase(s.phase)
      }

      const loop = () => {
        update()
        render()
        rafId = requestAnimationFrame(loop)
      }
      rafId = requestAnimationFrame(loop)
    }

    let resizeTimer = 0
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(initAndRun, 150)
    })
    ro.observe(canvas)
    initAndRun()

    return () => { cleanup(); ro.disconnect(); clearTimeout(resizeTimer) }
  }, [mode, difficulty, p1Color])

  const handleBack = () => {
    if (gameResultRef.current && onGameEnd) onGameEnd(gameResultRef.current)
    else onBack()
  }
  const handleNext = () => {
    if (gameResultRef.current && onGameEnd) onGameEnd(gameResultRef.current)
  }
  const handleRestart = () => {
    const s = stateRef.current
    if (!s) return
    s.currentTurn = 0
    s.p1Scores = []
    s.p2Scores = []
    s.suddenDeath = false
    s.sdRound = 0
    s.sdP1 = null
    s.sdP2 = null
    s.winner = null
    s.phase = 'announce'
    s.announceTimer = 0
    s.wind = (Math.random() - 0.5) * 0.6
    s.aiTapScheduled = false
    gameResultRef.current = null
    setScores([0, 0])
    setGameResult(null)
    setUiPhase('announce')
  }

  const c1label = mode === 'ai' ? 'You' : 'P1'
  const c2label = mode === 'ai' ? 'AI' : 'P2'

  return (
    <div className="h-full flex flex-col" style={{ background: '#030110' }}>
      <div className="flex items-center gap-3 px-4 pb-2 flex-shrink-0"
        style={{ background: 'rgba(3,1,16,0.95)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">🏹 Archery</h1>
        <div className="ml-auto flex gap-3 items-center">
          <span className="text-sm font-bold" style={{ color: p1Color === 'red' ? '#ef4444' : '#3b82f6' }}>
            {c1label}: {scores[0]}
          </span>
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>–</span>
          <span className="text-sm font-bold" style={{ color: p1Color === 'red' ? '#3b82f6' : '#ef4444' }}>
            {c2label}: {scores[1]}
          </span>
        </div>
      </div>

      {uiPhase === 'power' || uiPhase === 'angle' ? (
        <div className="flex-shrink-0 text-center py-1 text-xs"
          style={{ color: 'rgba(255,255,255,0.4)' }}>
          Tap anywhere on canvas to lock
        </div>
      ) : null}

      <div className="canvas-area">
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', display: 'block' }}
        />
      </div>

      <AnimatePresence>
        {gameResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.75)', zIndex: 50 }}>
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="rounded-3xl p-8 text-center mx-5"
              style={{ background: '#0d0a1e', border: '2px solid rgba(255,255,255,0.12)', maxWidth: 300, width: '100%' }}>
              <div className="text-5xl mb-3">🏹</div>
              <h2 className="text-3xl font-black mb-1"
                style={{ color: gameResult === 'p1' ? (p1Color === 'red' ? '#ef4444' : '#3b82f6') : gameResult === 'p2' ? (p1Color === 'red' ? '#3b82f6' : '#ef4444') : '#ffd700' }}>
                {gameResult === 'draw' ? "It's a Draw!" : gameResult === 'p1' ? (mode === 'ai' ? 'You Win!' : 'P1 Wins!') : (mode === 'ai' ? 'AI Wins!' : 'P2 Wins!')}
              </h2>
              <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{scores[0]} – {scores[1]}</p>
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>5 arrows each</p>
              <div className="flex gap-3">
                <button onClick={handleBack} className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                  {tournamentMode ? 'Next' : 'Back'}
                </button>
                {!tournamentMode
                  ? <button onClick={handleRestart} className="flex-1 py-3 rounded-2xl font-bold text-sm loft-btn-accent">Play Again</button>
                  : <button onClick={handleNext} className="flex-1 py-3 rounded-2xl font-bold text-sm loft-btn-accent">Next Game</button>
                }
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
