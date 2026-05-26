import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { saveGameScore, getGameScore } from '../../db'
import type { TwoPlayerGameProps } from './types'

const PAD_R = 28
const PUCK_R = 18
const WIN_SCORE = 5
const FRICTION = 0.988
const WALL_BOUNCE = 0.78
const GOAL_RATIO = 0.32

interface Vec { x: number; y: number }
interface AHState {
  w: number; h: number
  puck: Vec & { vx: number; vy: number }
  p1: Vec & { vx: number; vy: number }
  p2: Vec & { vx: number; vy: number }
  p1s: number; p2s: number
  phase: 'playing' | 'scored' | 'done'
  winner: 'p1' | 'p2' | null
  scoredTimer: number
  p1TouchId: number | null; p2TouchId: number | null
  goalW: number
}

export default function AirHockey2P({ mode, difficulty = 'medium', p1Color = 'red', onBack, onGameEnd, tournamentMode }: TwoPlayerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<AHState | null>(null)
  const [scores, setScores] = useState([0, 0])
  const [gameResult, setGameResult] = useState<'p1' | 'p2' | null>(null)
  const gameResultRef = useRef<'p1' | 'p2' | null>(null)

  const c1 = p1Color === 'red' ? '#ef4444' : '#3b82f6'
  const c2 = p1Color === 'red' ? '#3b82f6' : '#ef4444'

  const saveScore = async (w: 'p1' | 'p2') => {
    const id = `airhockey_${mode === 'ai' ? `ai_${difficulty}` : '2p'}`
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
      evListeners.forEach(({ ev, fn, opts }) => canvas.removeEventListener(ev, fn as EventListenerOrEventListenerObject, opts))
      evListeners.length = 0
    }

    const initAndRun = () => {
      cleanup()
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 50 || rect.height < 100) { rafId = requestAnimationFrame(initAndRun); return }

      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')!; ctx.scale(dpr, dpr)
      const W = rect.width, H = rect.height
      const goalW = W * GOAL_RATIO

      const prev = stateRef.current
      const s: AHState = {
        w: W, h: H, goalW,
        puck: { x: W/2, y: H/2, vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4 },
        p1: { x: W/2, y: H*0.78, vx: 0, vy: 0 },
        p2: { x: W/2, y: H*0.22, vx: 0, vy: 0 },
        p1s: prev?.p1s ?? 0, p2s: prev?.p2s ?? 0,
        phase: prev?.winner ? 'done' : 'playing',
        winner: prev?.winner ?? null,
        scoredTimer: 0,
        p1TouchId: null, p2TouchId: null,
      }
      stateRef.current = s

      // AI speed (px/frame): Easy≈3, Medium≈5.5, Hard≈9.8 (human drag ≈8-10px/frame max)
      const aiSpd = difficulty === 'easy' ? 3.0 : difficulty === 'medium' ? 5.5 : 9.8

      const onTouchStart = (e: TouchEvent) => {
        e.preventDefault()
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i]
          const ty = t.clientY - rect.top
          if (ty > H/2 && s.p1TouchId === null) s.p1TouchId = t.identifier
          else if (ty <= H/2 && mode === '2p' && s.p2TouchId === null) s.p2TouchId = t.identifier
        }
      }
      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault()
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i]
          const tx = Math.max(PAD_R, Math.min(W - PAD_R, t.clientX - rect.left))
          const ty = t.clientY - rect.top
          if (t.identifier === s.p1TouchId) {
            const ny = Math.max(H/2 + PAD_R, Math.min(H - PAD_R, ty))
            s.p1.vx = tx - s.p1.x; s.p1.vy = ny - s.p1.y
            s.p1.x = tx; s.p1.y = ny
          }
          if (t.identifier === s.p2TouchId) {
            const ny = Math.max(PAD_R, Math.min(H/2 - PAD_R, ty))
            s.p2.vx = tx - s.p2.x; s.p2.vy = ny - s.p2.y
            s.p2.x = tx; s.p2.y = ny
          }
        }
      }
      const onTouchEnd = (e: TouchEvent) => {
        e.preventDefault()
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i]
          if (t.identifier === s.p1TouchId) { s.p1TouchId = null; s.p1.vx = 0; s.p1.vy = 0 }
          if (t.identifier === s.p2TouchId) { s.p2TouchId = null; s.p2.vx = 0; s.p2.vy = 0 }
        }
      }
      let mouseDown = false, mouseInP1 = false, mouseInP2 = false
      const onMouseDown = (e: MouseEvent) => {
        mouseDown = true
        const my = e.clientY - rect.top
        mouseInP1 = my > H/2; mouseInP2 = my <= H/2
      }
      const onMouseMove = (e: MouseEvent) => {
        if (!mouseDown) return
        const mx = Math.max(PAD_R, Math.min(W - PAD_R, e.clientX - rect.left))
        const my = e.clientY - rect.top
        if (mouseInP1) {
          const ny = Math.max(H/2 + PAD_R, Math.min(H - PAD_R, my))
          s.p1.vx = mx - s.p1.x; s.p1.vy = ny - s.p1.y
          s.p1.x = mx; s.p1.y = ny
        }
        if (mouseInP2 && mode === '2p') {
          const ny = Math.max(PAD_R, Math.min(H/2 - PAD_R, my))
          s.p2.vx = mx - s.p2.x; s.p2.vy = ny - s.p2.y
          s.p2.x = mx; s.p2.y = ny
        }
      }
      const onMouseUp = () => { mouseDown = false; s.p1.vx = 0; s.p1.vy = 0; s.p2.vx = 0; s.p2.vy = 0 }
      addEv('touchstart', onTouchStart, { passive: false })
      addEv('touchmove', onTouchMove, { passive: false })
      addEv('touchend', onTouchEnd, { passive: false })
      addEv('mousedown', onMouseDown)
      addEv('mousemove', onMouseMove)
      addEv('mouseup', onMouseUp)

      const circlePaddleCollision = (pad: AHState['p1'], pk: AHState['puck']) => {
        const dx = pk.x - pad.x, dy = pk.y - pad.y
        const dist = Math.sqrt(dx*dx + dy*dy)
        const minDist = PAD_R + PUCK_R
        if (dist < minDist && dist > 0.01) {
          const nx = dx/dist, ny = dy/dist
          pk.x = pad.x + nx * minDist * 1.02
          pk.y = pad.y + ny * minDist * 1.02
          const relVx = pk.vx - pad.vx, relVy = pk.vy - pad.vy
          const dot = relVx*nx + relVy*ny
          if (dot < 0) {
            pk.vx -= (1 + 0.85) * dot * nx + pad.vx * 0.6
            pk.vy -= (1 + 0.85) * dot * ny + pad.vy * 0.6
            const spd = Math.sqrt(pk.vx*pk.vx + pk.vy*pk.vy)
            if (spd > 16) { pk.vx = pk.vx/spd*16; pk.vy = pk.vy/spd*16 }
          }
        }
      }

      const update = () => {
        if (s.phase === 'scored') {
          s.scoredTimer++
          if (s.scoredTimer > 80) {
            s.puck = { x: W/2, y: H/2, vx: (Math.random()-0.5)*3, vy: (Math.random()-0.5)*3 }
            s.p1.x = W/2; s.p1.y = H*0.78; s.p1.vx = 0; s.p1.vy = 0
            s.p2.x = W/2; s.p2.y = H*0.22; s.p2.vx = 0; s.p2.vy = 0
            s.phase = 'playing'; s.scoredTimer = 0
          }
          return
        }
        if (s.phase !== 'playing') return

        if (mode === 'ai') {
          const pk = s.puck
          let targetX: number, targetY: number

          if (difficulty === 'hard') {
            // Predict puck trajectory ~280ms ahead (17 frames)
            let px = pk.x, py = pk.y, pvx = pk.vx, pvy = pk.vy
            for (let i = 0; i < 17; i++) {
              px += pvx; py += pvy
              pvx *= FRICTION; pvy *= FRICTION
              if (px - PUCK_R < 0) { px = PUCK_R; pvx = Math.abs(pvx) * WALL_BOUNCE }
              if (px + PUCK_R > W) { px = W - PUCK_R; pvx = -Math.abs(pvx) * WALL_BOUNCE }
            }
            if (py < H/2) {
              // Attack: aim for goal corner away from P1's current position
              const goalLeft = (W - s.goalW) / 2 + PAD_R * 0.5
              const goalRight = (W + s.goalW) / 2 - PAD_R * 0.5
              const cornerX = s.p1.x < W / 2 ? goalRight : goalLeft
              targetX = Math.max(PAD_R, Math.min(W - PAD_R, cornerX))
              targetY = Math.max(PAD_R, Math.min(H/2 - PAD_R, py - PAD_R * 1.5))
            } else {
              // Defend: hug goal line, shift laterally to block angle
              const puckAngle = Math.atan2(pk.y - H * 0.08, pk.x - W / 2)
              targetX = Math.max(PAD_R, Math.min(W - PAD_R, W / 2 + Math.sin(puckAngle) * s.goalW * 0.45))
              targetY = Math.max(PAD_R, Math.min(H/2 - PAD_R, H * 0.11))
            }
          } else if (difficulty === 'medium') {
            if (pk.y < H/2) {
              // Puck in AI half — attack with offset to aim at goal corners
              const attackOffset = pk.x > W/2 ? -PAD_R * 0.8 : PAD_R * 0.8
              targetX = Math.max(PAD_R, Math.min(W - PAD_R, pk.x + attackOffset))
              targetY = Math.max(PAD_R, Math.min(H/2 - PAD_R, pk.y - PAD_R * 1.5))
            } else {
              // Defend corners: position between puck and goal
              const cornerX = pk.x < W/2 ? W/2 - s.goalW*0.3 : W/2 + s.goalW*0.3
              targetX = cornerX; targetY = H*0.18
            }
          } else {
            // Easy — simple attack or sit in defense
            if (pk.y < H/2) {
              targetX = pk.x
              targetY = Math.max(PAD_R, Math.min(H/2 - PAD_R, pk.y))
            } else {
              targetX = W/2; targetY = H*0.2
            }
          }

          const dx = targetX - s.p2.x, dy = targetY - s.p2.y
          const d = Math.sqrt(dx*dx + dy*dy)
          if (d > 1) {
            const mv = Math.min(aiSpd, d)
            s.p2.vx = dx/d * mv; s.p2.vy = dy/d * mv
            s.p2.x += s.p2.vx; s.p2.y += s.p2.vy
          }
        }

        s.puck.x += s.puck.vx; s.puck.y += s.puck.vy
        s.puck.vx *= FRICTION; s.puck.vy *= FRICTION

        if (s.puck.x - PUCK_R < 0) { s.puck.x = PUCK_R; s.puck.vx = Math.abs(s.puck.vx) * WALL_BOUNCE }
        if (s.puck.x + PUCK_R > W) { s.puck.x = W - PUCK_R; s.puck.vx = -Math.abs(s.puck.vx) * WALL_BOUNCE }

        const gL = (W - s.goalW) / 2, gR = (W + s.goalW) / 2
        const inGoal = s.puck.x > gL && s.puck.x < gR

        if (!inGoal) {
          if (s.puck.y - PUCK_R < 0) { s.puck.y = PUCK_R; s.puck.vy = Math.abs(s.puck.vy) * WALL_BOUNCE }
          if (s.puck.y + PUCK_R > H) { s.puck.y = H - PUCK_R; s.puck.vy = -Math.abs(s.puck.vy) * WALL_BOUNCE }
        }

        if (inGoal) {
          if (s.puck.y < -PUCK_R) {
            s.p2s++; setScores([s.p1s, s.p2s])
            if (s.p2s >= WIN_SCORE) { s.winner = 'p2'; s.phase = 'done'; gameResultRef.current = 'p2'; setGameResult('p2'); saveScore('p2') }
            else { s.phase = 'scored'; s.scoredTimer = 0 }
          }
          if (s.puck.y > H + PUCK_R) {
            s.p1s++; setScores([s.p1s, s.p2s])
            if (s.p1s >= WIN_SCORE) { s.winner = 'p1'; s.phase = 'done'; gameResultRef.current = 'p1'; setGameResult('p1'); saveScore('p1') }
            else { s.phase = 'scored'; s.scoredTimer = 0 }
          }
        }

        circlePaddleCollision(s.p1, s.puck)
        circlePaddleCollision(s.p2, s.puck)
      }

      const render = () => {
        ctx.clearRect(0, 0, W, H)

        const tableBg = ctx.createLinearGradient(0, 0, 0, H)
        tableBg.addColorStop(0, '#0c2040'); tableBg.addColorStop(1, '#061428')
        ctx.fillStyle = tableBg; ctx.fillRect(0, 0, W, H)

        ctx.strokeStyle = 'rgba(59,158,255,0.3)'; ctx.lineWidth = 3
        ctx.strokeRect(3, 3, W-6, H-6)

        const gL = (W - s.goalW) / 2, gR = (W + s.goalW) / 2

        // Top goal (P2 scores) — c2 color
        ctx.fillStyle = `${c2}26`; ctx.fillRect(gL, 0, s.goalW, 20)
        ctx.strokeStyle = c2; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(gL, 0); ctx.lineTo(gL, 20); ctx.lineTo(gR, 20); ctx.lineTo(gR, 0); ctx.stroke()

        // Bottom goal (P1 scores) — c1 color
        ctx.fillStyle = `${c1}26`; ctx.fillRect(gL, H-20, s.goalW, 20)
        ctx.strokeStyle = c1; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(gL, H); ctx.lineTo(gL, H-20); ctx.lineTo(gR, H-20); ctx.lineTo(gR, H); ctx.stroke()

        ctx.setLineDash([10, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke()
        ctx.setLineDash([])

        ctx.beginPath(); ctx.arc(W/2, H/2, 40, 0, Math.PI*2)
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; ctx.stroke()

        ctx.font = 'bold 36px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillStyle = `${c1}d8`; ctx.fillText(String(s.p1s), W/2, H * 0.75)
        ctx.fillStyle = `${c2}d8`; ctx.fillText(String(s.p2s), W/2, H * 0.25)

        // P2 paddle (top, c2)
        ctx.beginPath(); ctx.arc(s.p2.x, s.p2.y, PAD_R, 0, Math.PI*2)
        ctx.fillStyle = c2; ctx.shadowColor = c2; ctx.shadowBlur = 16; ctx.fill()
        ctx.beginPath(); ctx.arc(s.p2.x, s.p2.y, PAD_R * 0.42, 0, Math.PI*2)
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.shadowBlur = 0; ctx.fill()

        // P1 paddle (bottom, c1)
        ctx.beginPath(); ctx.arc(s.p1.x, s.p1.y, PAD_R, 0, Math.PI*2)
        ctx.fillStyle = c1; ctx.shadowColor = c1; ctx.shadowBlur = 16; ctx.fill()
        ctx.beginPath(); ctx.arc(s.p1.x, s.p1.y, PAD_R * 0.42, 0, Math.PI*2)
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.shadowBlur = 0; ctx.fill()

        // Puck
        ctx.beginPath(); ctx.arc(s.puck.x, s.puck.y, PUCK_R, 0, Math.PI*2)
        ctx.fillStyle = '#dde8ff'; ctx.shadowColor = 'rgba(200,220,255,0.5)'; ctx.shadowBlur = 8; ctx.fill()
        ctx.beginPath(); ctx.arc(s.puck.x, s.puck.y, PUCK_R * 0.4, 0, Math.PI*2)
        ctx.fillStyle = 'rgba(100,120,160,0.6)'; ctx.shadowBlur = 0; ctx.fill()

        ctx.font = 'bold 11px Inter, system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ctx.fillStyle = `${c2}72`; ctx.fillText(mode === 'ai' ? `AI (${difficulty})` : 'P2', 8, 8)
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = `${c1}72`; ctx.fillText(mode === 'ai' ? 'You' : 'P1', 8, H - 8)
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

  const handleBack = () => { if (gameResultRef.current && onGameEnd) onGameEnd(gameResultRef.current); else onBack() }
  const handleNext = () => { if (gameResultRef.current && onGameEnd) onGameEnd(gameResultRef.current) }
  const handleRestart = () => {
    const s = stateRef.current; if (!s) return
    s.p1s = 0; s.p2s = 0; s.winner = null; s.phase = 'playing'; s.scoredTimer = 0
    gameResultRef.current = null
    s.puck = { x: s.w/2, y: s.h/2, vx: (Math.random()-0.5)*3, vy: (Math.random()-0.5)*3 }
    s.p1 = { x: s.w/2, y: s.h*0.78, vx: 0, vy: 0 }
    s.p2 = { x: s.w/2, y: s.h*0.22, vx: 0, vy: 0 }
    setScores([0, 0]); setGameResult(null)
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#061428' }}>
      <div className="flex items-center gap-3 px-4 pb-2 flex-shrink-0" style={{ background: 'rgba(6,20,40,0.95)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Air Hockey</h1>
        <div className="ml-auto flex gap-3 items-center">
          <span className="text-sm font-bold" style={{ color: c1 }}>{scores[0]}</span>
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>–</span>
          <span className="text-sm font-bold" style={{ color: c2 }}>{scores[1]}</span>
        </div>
      </div>
      <div className="canvas-area">
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', display: 'block' }} />
      </div>

      <AnimatePresence>
        {gameResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.75)', zIndex: 50 }}>
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="rounded-3xl p-8 text-center mx-5"
              style={{ background: '#0d1628', border: '2px solid rgba(255,255,255,0.12)', maxWidth: 300, width: '100%' }}>
              <div className="text-5xl mb-3">🏒</div>
              <h2 className="text-3xl font-black mb-1" style={{ color: gameResult === 'p1' ? c1 : c2 }}>
                {gameResult === 'p1' ? (mode === 'ai' ? 'You Win!' : 'P1 Wins!') : (mode === 'ai' ? 'AI Wins!' : 'P2 Wins!')}
              </h2>
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.45)' }}>{scores[0]} – {scores[1]} · First to {WIN_SCORE}</p>
              <div className="flex gap-3">
                <button onClick={handleBack} className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                  {tournamentMode ? 'Next' : 'Back'}
                </button>
                {!tournamentMode ? (
                  <button onClick={handleRestart} className="flex-1 py-3 rounded-2xl font-bold text-sm loft-btn-accent">Play Again</button>
                ) : (
                  <button onClick={handleNext} className="flex-1 py-3 rounded-2xl font-bold text-sm loft-btn-accent">Next Game</button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
