import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { saveGameScore, getGameScore } from '../../db'
import type { TwoPlayerGameProps } from './types'

const PAD_W = 72
const PAD_H = 18
const BALL_R = 8
const PAD_OFFSET = 28
const WIN_SCORE = 7
const BASE_SPEED = 5.5
const NET_H = 28
const AI_HISTORY_LEN = 14

interface TennisState {
  w: number; h: number
  bx: number; by: number; bvx: number; bvy: number
  p1x: number; p2x: number
  p1s: number; p2s: number
  speed: number; rally: number
  phase: 'countdown' | 'playing' | 'done'
  countdown: number; countTimer: number
  winner: 'p1' | 'p2' | null
  p1touch: number | null; p2touch: number | null
  aiHistory: number[]
}

function resetBall(s: TennisState) {
  s.bx = s.w / 2; s.by = s.h / 2
  const angle = (Math.random() * 0.5 + 0.15) * (Math.random() < 0.5 ? 1 : -1)
  const dir = s.p1s > s.p2s ? -1 : 1
  s.bvx = Math.sin(angle) * BASE_SPEED
  s.bvy = Math.cos(angle) * BASE_SPEED * dir
  s.speed = BASE_SPEED; s.rally = 0
  s.phase = 'countdown'; s.countdown = 3; s.countTimer = 0
}

export default function Tennis2P({
  mode, difficulty = 'medium', p1Color = 'red',
  onBack, onGameEnd, tournamentMode,
}: TwoPlayerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<TennisState | null>(null)
  const [scores, setScores] = useState([0, 0])
  const [gameResult, setGameResult] = useState<'p1' | 'p2' | null>(null)
  const gameResultRef = useRef<'p1' | 'p2' | null>(null)

  const c1 = p1Color === 'red' ? '#ef4444' : '#3b82f6'
  const c2 = p1Color === 'red' ? '#3b82f6' : '#ef4444'

  const saveScore = async (w: 'p1' | 'p2') => {
    const id = `tennis_${mode === 'ai' ? `ai_${difficulty}` : '2p'}`
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
      const s: TennisState = {
        w: W, h: H, bx: W / 2, by: H / 2, bvx: 0, bvy: 0,
        p1x: W / 2, p2x: W / 2,
        p1s: prev?.p1s ?? 0, p2s: prev?.p2s ?? 0,
        speed: BASE_SPEED, rally: 0,
        phase: 'countdown', countdown: 3, countTimer: 0,
        winner: prev?.winner ?? null,
        p1touch: null, p2touch: null,
        aiHistory: Array(AI_HISTORY_LEN).fill(W / 2),
      }
      if (s.winner) { s.phase = 'done' } else { resetBall(s) }
      stateRef.current = s

      const onTouchStart = (e: TouchEvent) => {
        e.preventDefault()
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i]
          const ty = t.clientY - rect.top
          if (ty > H * 0.60) s.p1touch = t.identifier
          else if (ty < H * 0.40 && mode === '2p') s.p2touch = t.identifier
        }
      }
      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault()
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i]
          const tx = t.clientX - rect.left
          if (t.identifier === s.p1touch) s.p1x = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, tx))
          if (t.identifier === s.p2touch) s.p2x = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, tx))
        }
      }
      const onTouchEnd = (e: TouchEvent) => {
        e.preventDefault()
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i]
          if (t.identifier === s.p1touch) s.p1touch = null
          if (t.identifier === s.p2touch) s.p2touch = null
        }
      }
      const onMouseMove = (e: MouseEvent) => {
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        if (my > H * 0.60) s.p1x = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, mx))
        else if (my < H * 0.40 && mode === '2p') s.p2x = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, mx))
      }
      addEv('touchstart', onTouchStart, { passive: false })
      addEv('touchmove', onTouchMove, { passive: false })
      addEv('touchend', onTouchEnd, { passive: false })
      addEv('mousemove', onMouseMove)

      const aiLagFrames = difficulty === 'easy' ? 13 : difficulty === 'medium' ? 5 : 0
      const aiSpeedFactor = difficulty === 'easy' ? 0.60 : difficulty === 'medium' ? 0.90 : 1.30

      const netTop = H / 2 - NET_H / 2
      const netBot = H / 2 + NET_H / 2

      const update = () => {
        if (s.phase === 'countdown') {
          s.countTimer++
          if (s.countTimer >= 60) { s.countdown--; s.countTimer = 0 }
          if (s.countdown <= 0) s.phase = 'playing'
          return
        }
        if (s.phase !== 'playing') return

        // AI
        if (mode === 'ai') {
          s.aiHistory.push(s.bx)
          if (s.aiHistory.length > AI_HISTORY_LEN) s.aiHistory.shift()
          const histIdx = Math.max(0, s.aiHistory.length - 1 - aiLagFrames)
          const seenBallX = s.aiHistory[histIdx]
          let targetX = s.bvy < 0 ? seenBallX : W / 2
          if (difficulty === 'hard' && s.bvy < 0) {
            const openSideOffset = s.p1x < W / 2 ? PAD_W * 0.45 : -PAD_W * 0.45
            targetX = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, seenBallX + openSideOffset))
          }
          const maxSpeed = s.speed * aiSpeedFactor
          const hesitate = difficulty === 'easy' && Math.random() < 0.010
          if (!hesitate) {
            const dx = targetX - s.p2x
            const step = Math.min(Math.abs(dx), maxSpeed)
            s.p2x += Math.sign(dx) * step
            s.p2x = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, s.p2x))
          }
          if (difficulty === 'hard' && Math.abs(s.bvx / s.bvy) > 1.4 && Math.random() < 0.04) {
            s.p2x += (Math.random() - 0.5) * 12
          }
        }

        // Gravity
        s.bvy += 0.25

        const prevBy = s.by
        s.bx += s.bvx
        s.by += s.bvy

        // Wall bounce
        if (s.bx - BALL_R < 0) { s.bx = BALL_R; s.bvx = Math.abs(s.bvx) }
        if (s.bx + BALL_R > W) { s.bx = W - BALL_R; s.bvx = -Math.abs(s.bvx) }

        // Net collision check
        const wasCrossingNet = (prevBy < H / 2 && s.by >= H / 2) || (prevBy > H / 2 && s.by <= H / 2)
        if (wasCrossingNet && s.by > netTop && s.by < netBot) {
          // Net fault: point to who did NOT hit it last
          // bvy > 0 means going down (P1 hit it up toward P2 side) → net fault for P1 → P2 scores
          // bvy < 0 means going up (P2 hit it toward P1 side) → net fault for P2 → P1 scores
          if (s.bvy > 0) {
            s.p2s++
            setScores([s.p1s, s.p2s])
            if (s.p2s >= WIN_SCORE) {
              s.winner = 'p2'; s.phase = 'done'
              gameResultRef.current = 'p2'; setGameResult('p2'); saveScore('p2')
            } else resetBall(s)
          } else {
            s.p1s++
            setScores([s.p1s, s.p2s])
            if (s.p1s >= WIN_SCORE) {
              s.winner = 'p1'; s.phase = 'done'
              gameResultRef.current = 'p1'; setGameResult('p1'); saveScore('p1')
            } else resetBall(s)
          }
          return
        }

        // P1 paddle (bottom)
        const p1y = H - PAD_OFFSET
        if (s.bvy > 0 && s.by + BALL_R >= p1y - PAD_H / 2 && s.by - BALL_R <= p1y + PAD_H / 2
          && s.bx >= s.p1x - PAD_W / 2 && s.bx <= s.p1x + PAD_W / 2) {
          const hit = (s.bx - s.p1x) / (PAD_W / 2)
          s.speed = Math.min(s.speed + 0.25, 11)
          s.bvx = hit * s.speed * 0.75
          s.bvy = -Math.sqrt(Math.max(0, s.speed * s.speed - s.bvx * s.bvx))
          s.by = p1y - PAD_H / 2 - BALL_R; s.rally++
        }

        // P2 paddle (top)
        const p2y = PAD_OFFSET
        if (s.bvy < 0 && s.by - BALL_R <= p2y + PAD_H / 2 && s.by + BALL_R >= p2y - PAD_H / 2
          && s.bx >= s.p2x - PAD_W / 2 && s.bx <= s.p2x + PAD_W / 2) {
          const hit = (s.bx - s.p2x) / (PAD_W / 2)
          s.speed = Math.min(s.speed + 0.25, 11)
          s.bvx = hit * s.speed * 0.75
          s.bvy = Math.sqrt(Math.max(0, s.speed * s.speed - s.bvx * s.bvx))
          s.by = p2y + PAD_H / 2 + BALL_R; s.rally++
        }

        // Out of bounds
        if (s.by > H + BALL_R + 20) {
          s.p2s++; setScores([s.p1s, s.p2s])
          if (s.p2s >= WIN_SCORE) {
            s.winner = 'p2'; s.phase = 'done'
            gameResultRef.current = 'p2'; setGameResult('p2'); saveScore('p2')
          } else resetBall(s)
        }
        if (s.by < -BALL_R - 20) {
          s.p1s++; setScores([s.p1s, s.p2s])
          if (s.p1s >= WIN_SCORE) {
            s.winner = 'p1'; s.phase = 'done'
            gameResultRef.current = 'p1'; setGameResult('p1'); saveScore('p1')
          } else resetBall(s)
        }
      }

      const drawRacket = (
        cx: number, cy: number, col: string, isBottom: boolean
      ) => {
        // Oval racket head
        ctx.beginPath()
        ctx.ellipse(cx, cy, PAD_W / 2, PAD_H / 2, 0, 0, Math.PI * 2)
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.fill()
        ctx.shadowBlur = 0
        // Strings
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1
        for (let dx = -PAD_W / 2 + 8; dx < PAD_W / 2; dx += 10) {
          ctx.beginPath()
          ctx.moveTo(cx + dx, cy - PAD_H / 2 + 2)
          ctx.lineTo(cx + dx, cy + PAD_H / 2 - 2)
          ctx.stroke()
        }
        // Handle stub
        const handleY = isBottom ? cy + PAD_H / 2 + 3 : cy - PAD_H / 2 - 3
        const handleEnd = isBottom ? handleY + 12 : handleY - 12
        ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(cx, handleY); ctx.lineTo(cx, handleEnd); ctx.stroke()
      }

      const render = () => {
        ctx.clearRect(0, 0, W, H)

        // Dark green court background
        ctx.fillStyle = '#0a2a0a'; ctx.fillRect(0, 0, W, H)

        // Court lines
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2
        ctx.strokeRect(W * 0.08, 0, W * 0.84, H)

        // Service lines
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(W * 0.08, H * 0.25); ctx.lineTo(W * 0.92, H * 0.25); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(W * 0.08, H * 0.75); ctx.lineTo(W * 0.92, H * 0.75); ctx.stroke()
        // Center service line
        ctx.beginPath(); ctx.moveTo(W / 2, H * 0.25); ctx.lineTo(W / 2, H * 0.75); ctx.stroke()

        // Touch zones
        ctx.fillStyle = `${c2}06`; ctx.fillRect(0, 0, W, H * 0.40)
        ctx.fillStyle = `${c1}06`; ctx.fillRect(0, H * 0.60, W, H * 0.40)

        // Net
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.fillRect(0, netTop, W, NET_H)
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5
        ctx.strokeRect(0, netTop, W, NET_H)
        // Net post
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(W / 2 - 2, netTop, 4, NET_H)

        // Scores
        ctx.font = 'bold 52px Inter, system-ui'; ctx.textBaseline = 'middle'
        ctx.fillStyle = `${c1}e5`; ctx.textAlign = 'left'
        ctx.fillText(String(s.p1s), 20, H / 2 + 30)
        ctx.fillStyle = `${c2}e5`; ctx.textAlign = 'right'
        ctx.fillText(String(s.p2s), W - 20, H / 2 - 30)

        // Paddles (racket ovals)
        drawRacket(s.p2x, PAD_OFFSET, c2, false)
        drawRacket(s.p1x, H - PAD_OFFSET, c1, true)

        // Ball (yellow tennis ball)
        if (s.phase !== 'done') {
          ctx.beginPath(); ctx.arc(s.bx, s.by, BALL_R, 0, Math.PI * 2)
          ctx.fillStyle = '#facc15'; ctx.shadowColor = 'rgba(250,204,21,0.6)'; ctx.shadowBlur = 10
          ctx.fill(); ctx.shadowBlur = 0
          // Tennis ball seams
          ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.arc(s.bx - 2, s.by, BALL_R - 2, Math.PI * 0.3, Math.PI * 1.7)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(s.bx + 2, s.by, BALL_R - 2, Math.PI * 1.3, Math.PI * 0.7)
          ctx.stroke()
        }

        // Countdown
        if (s.phase === 'countdown' && s.countdown > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H)
          ctx.font = 'bold 80px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(100,200,100,0.8)'; ctx.shadowBlur = 20
          ctx.fillText(String(s.countdown), W / 2, H / 2); ctx.shadowBlur = 0
        }

        // Labels
        ctx.font = 'bold 12px Inter, system-ui'; ctx.textAlign = 'center'
        ctx.textBaseline = 'top'; ctx.fillStyle = `${c2}80`
        ctx.fillText(mode === 'ai' ? `AI (${difficulty})` : 'P2 — drag top', W / 2, 8)
        ctx.textBaseline = 'bottom'; ctx.fillStyle = `${c1}80`
        ctx.fillText(mode === 'ai' ? 'You — drag bottom' : 'P1 — drag bottom', W / 2, H - 8)
      }

      const loop = () => { update(); render(); rafId = requestAnimationFrame(loop) }
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
    const s = stateRef.current; if (!s) return
    s.p1s = 0; s.p2s = 0; s.p1x = s.w / 2; s.p2x = s.w / 2
    s.winner = null; gameResultRef.current = null
    resetBall(s); setScores([0, 0]); setGameResult(null)
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#022c22' }}>
      <div className="flex items-center gap-3 px-4 pb-2 flex-shrink-0"
        style={{ background: 'rgba(2,44,34,0.95)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">🎾 Tennis</h1>
        <div className="ml-auto flex gap-3 items-center">
          <span className="text-sm font-bold" style={{ color: c1 }}>{scores[0]}</span>
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>–</span>
          <span className="text-sm font-bold" style={{ color: c2 }}>{scores[1]}</span>
        </div>
      </div>
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
              style={{ background: '#0a1a10', border: '2px solid rgba(255,255,255,0.12)', maxWidth: 300, width: '100%' }}>
              <div className="text-5xl mb-3">🎾</div>
              <h2 className="text-3xl font-black mb-1" style={{ color: gameResult === 'p1' ? c1 : c2 }}>
                {gameResult === 'p1' ? (mode === 'ai' ? 'You Win!' : 'P1 Wins!') : (mode === 'ai' ? 'AI Wins!' : 'P2 Wins!')}
              </h2>
              <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{scores[0]} – {scores[1]}</p>
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>First to {WIN_SCORE}</p>
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
