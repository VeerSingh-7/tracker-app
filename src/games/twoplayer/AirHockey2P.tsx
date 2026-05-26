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
  p1: Vec & { vx: number; vy: number; px: number; py: number }
  p2: Vec & { vx: number; vy: number; px: number; py: number }
  p1s: number; p2s: number
  phase: 'playing' | 'scored' | 'done'
  winner: 'p1' | 'p2' | null
  scoredTimer: number
  p1TouchId: number | null; p2TouchId: number | null
  goalW: number
}

export default function AirHockey2P({ mode, difficulty = 'medium', onBack, onGameEnd, tournamentMode }: TwoPlayerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<AHState | null>(null)
  const rafRef = useRef<number>(0)
  const [scores, setScores] = useState([0, 0])
  const [gameResult, setGameResult] = useState<'p1' | 'p2' | null>(null)

  const saveScore = async (w: 'p1' | 'p2') => {
    const id = `airhockey_${mode === 'ai' ? `ai_${difficulty}` : '2p'}`
    const existing = await getGameScore(id)
    const wins = (existing?.bestScore ?? 0) + (w === 'p1' ? 1 : 0)
    await saveGameScore({ gameId: id, bestScore: wins, lastPlayed: new Date().toISOString() })
  }

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    const W = rect.width, H = rect.height
    const goalW = W * GOAL_RATIO

    const s: AHState = {
      w: W, h: H, goalW,
      puck: { x: W/2, y: H/2, vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4 },
      p1: { x: W/2, y: H*0.78, vx: 0, vy: 0, px: W/2, py: H*0.78 },
      p2: { x: W/2, y: H*0.22, vx: 0, vy: 0, px: W/2, py: H*0.22 },
      p1s: 0, p2s: 0,
      phase: 'playing', winner: null, scoredTimer: 0,
      p1TouchId: null, p2TouchId: null,
    }
    stateRef.current = s

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

    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd, { passive: false })
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseup', onMouseUp)

    const aiSpd = difficulty === 'easy' ? 2.5 : difficulty === 'medium' ? 4.5 : 7

    const circlePaddleCollision = (pad: typeof s.p1, pk: typeof s.puck) => {
      const dx = pk.x - pad.x, dy = pk.y - pad.y
      const dist = Math.sqrt(dx*dx + dy*dy)
      const minDist = PAD_R + PUCK_R
      if (dist < minDist && dist > 0.01) {
        const nx = dx/dist, ny = dy/dist
        // Push out
        pk.x = pad.x + nx * minDist * 1.02
        pk.y = pad.y + ny * minDist * 1.02
        // Velocity: reflect + add paddle momentum
        const relVx = pk.vx - pad.vx, relVy = pk.vy - pad.vy
        const dot = relVx*nx + relVy*ny
        if (dot < 0) {
          pk.vx -= (1 + 0.85) * dot * nx + pad.vx * 0.6
          pk.vy -= (1 + 0.85) * dot * ny + pad.vy * 0.6
          // Clamp speed
          const spd = Math.sqrt(pk.vx*pk.vx + pk.vy*pk.vy)
          const maxSpd = 16
          if (spd > maxSpd) { pk.vx = pk.vx/spd*maxSpd; pk.vy = pk.vy/spd*maxSpd }
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

      // AI
      if (mode === 'ai') {
        const puck = s.puck
        let targetX: number, targetY: number
        if (puck.y < H/2) {
          // Puck in AI half — attack
          targetX = puck.x; targetY = Math.max(PAD_R, Math.min(H/2 - PAD_R, puck.y - PAD_R * 1.5))
        } else {
          // Defend goal
          targetX = W/2; targetY = H*0.2
        }
        const dx = targetX - s.p2.x, dy = targetY - s.p2.y
        const d = Math.sqrt(dx*dx + dy*dy)
        if (d > 1) {
          const mv = Math.min(aiSpd, d)
          s.p2.vx = dx/d * mv; s.p2.vy = dy/d * mv
          s.p2.x += s.p2.vx; s.p2.y += s.p2.vy
        }
      }

      // Move puck
      s.puck.x += s.puck.vx; s.puck.y += s.puck.vy
      s.puck.vx *= FRICTION; s.puck.vy *= FRICTION

      // Wall bounce
      if (s.puck.x - PUCK_R < 0) { s.puck.x = PUCK_R; s.puck.vx = Math.abs(s.puck.vx) * WALL_BOUNCE }
      if (s.puck.x + PUCK_R > W) { s.puck.x = W - PUCK_R; s.puck.vx = -Math.abs(s.puck.vx) * WALL_BOUNCE }

      // Top/bottom wall (except goal area)
      const gL = (W - s.goalW) / 2, gR = (W + s.goalW) / 2
      const inGoal = s.puck.x > gL && s.puck.x < gR

      if (!inGoal) {
        if (s.puck.y - PUCK_R < 0) { s.puck.y = PUCK_R; s.puck.vy = Math.abs(s.puck.vy) * WALL_BOUNCE }
        if (s.puck.y + PUCK_R > H) { s.puck.y = H - PUCK_R; s.puck.vy = -Math.abs(s.puck.vy) * WALL_BOUNCE }
      }

      // Goal check
      if (inGoal) {
        if (s.puck.y < -PUCK_R) {
          s.p2s++; setScores([s.p1s, s.p2s])
          if (s.p2s >= WIN_SCORE) { s.winner = 'p2'; s.phase = 'done'; setGameResult('p2'); saveScore('p2') }
          else { s.phase = 'scored'; s.scoredTimer = 0 }
        }
        if (s.puck.y > H + PUCK_R) {
          s.p1s++; setScores([s.p1s, s.p2s])
          if (s.p1s >= WIN_SCORE) { s.winner = 'p1'; s.phase = 'done'; setGameResult('p1'); saveScore('p1') }
          else { s.phase = 'scored'; s.scoredTimer = 0 }
        }
      }

      // Paddle collisions
      circlePaddleCollision(s.p1, s.puck)
      circlePaddleCollision(s.p2, s.puck)
    }

    const render = () => {
      ctx.clearRect(0, 0, W, H)

      // Table surface
      const tableBg = ctx.createLinearGradient(0, 0, 0, H)
      tableBg.addColorStop(0, '#0c2040'); tableBg.addColorStop(1, '#061428')
      ctx.fillStyle = tableBg; ctx.fillRect(0, 0, W, H)

      // Table border
      ctx.strokeStyle = 'rgba(59,158,255,0.3)'; ctx.lineWidth = 3
      ctx.strokeRect(3, 3, W-6, H-6)

      const gL = (W - s.goalW) / 2, gR = (W + s.goalW) / 2

      // Top goal (P2 scores here → P1 point)
      ctx.fillStyle = 'rgba(239,68,68,0.15)'; ctx.fillRect(gL, 0, s.goalW, 20)
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(gL, 0); ctx.lineTo(gL, 20); ctx.lineTo(gR, 20); ctx.lineTo(gR, 0); ctx.stroke()

      // Bottom goal (P1 scores here → P2 point)
      ctx.fillStyle = 'rgba(59,130,246,0.15)'; ctx.fillRect(gL, H-20, s.goalW, 20)
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(gL, H); ctx.lineTo(gL, H-20); ctx.lineTo(gR, H-20); ctx.lineTo(gR, H); ctx.stroke()

      // Center line
      ctx.setLineDash([10, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke()
      ctx.setLineDash([])

      // Center circle
      ctx.beginPath(); ctx.arc(W/2, H/2, 40, 0, Math.PI*2)
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; ctx.stroke()

      // Scores
      ctx.font = 'bold 36px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(239,68,68,0.85)'; ctx.fillText(String(s.p1s), W/2, H * 0.75)
      ctx.fillStyle = 'rgba(59,130,246,0.85)'; ctx.fillText(String(s.p2s), W/2, H * 0.25)

      // P2 paddle (blue/AI)
      ctx.beginPath(); ctx.arc(s.p2.x, s.p2.y, PAD_R, 0, Math.PI*2)
      ctx.fillStyle = '#3b82f6'; ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 16; ctx.fill()
      ctx.beginPath(); ctx.arc(s.p2.x, s.p2.y, PAD_R * 0.42, 0, Math.PI*2)
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.shadowBlur = 0; ctx.fill()

      // P1 paddle (red)
      ctx.beginPath(); ctx.arc(s.p1.x, s.p1.y, PAD_R, 0, Math.PI*2)
      ctx.fillStyle = '#ef4444'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 16; ctx.fill()
      ctx.beginPath(); ctx.arc(s.p1.x, s.p1.y, PAD_R * 0.42, 0, Math.PI*2)
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.shadowBlur = 0; ctx.fill()

      // Puck
      ctx.beginPath(); ctx.arc(s.puck.x, s.puck.y, PUCK_R, 0, Math.PI*2)
      ctx.fillStyle = '#dde8ff'; ctx.shadowColor = 'rgba(200,220,255,0.5)'; ctx.shadowBlur = 8; ctx.fill()
      ctx.beginPath(); ctx.arc(s.puck.x, s.puck.y, PUCK_R * 0.4, 0, Math.PI*2)
      ctx.fillStyle = 'rgba(100,120,160,0.6)'; ctx.shadowBlur = 0; ctx.fill()

      // Labels
      ctx.font = 'bold 11px Inter, system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgba(59,130,246,0.45)'; ctx.fillText(mode === 'ai' ? `AI (${difficulty})` : 'P2', 8, 8)
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = 'rgba(239,68,68,0.45)'; ctx.fillText(mode === 'ai' ? 'You' : 'P1', 8, H - 8)
    }

    const loop = () => { update(); render(); rafRef.current = requestAnimationFrame(loop) }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onMouseUp)
    }
  }, [mode, difficulty])

  const handleBack = () => { if (gameResult && onGameEnd) onGameEnd(gameResult); else onBack() }
  const handleNext = () => { if (gameResult && onGameEnd) onGameEnd(gameResult) }
  const handleRestart = () => {
    const s = stateRef.current; if (!s) return
    s.p1s = 0; s.p2s = 0; s.winner = null; s.phase = 'playing'; s.scoredTimer = 0
    s.puck = { x: s.w/2, y: s.h/2, vx: (Math.random()-0.5)*3, vy: (Math.random()-0.5)*3 }
    s.p1 = { x: s.w/2, y: s.h*0.78, vx: 0, vy: 0, px: s.w/2, py: s.h*0.78 }
    s.p2 = { x: s.w/2, y: s.h*0.22, vx: 0, vy: 0, px: s.w/2, py: s.h*0.22 }
    setScores([0, 0]); setGameResult(null)
  }

  return (
    <div className="h-full flex flex-col relative" style={{ background: '#061428' }}>
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 safe-top" style={{ background: 'rgba(6,20,40,0.95)' }}>
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Air Hockey</h1>
        <div className="ml-auto flex gap-3 items-center">
          <span className="text-sm font-bold" style={{ color: '#ef4444' }}>{scores[0]}</span>
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>–</span>
          <span className="text-sm font-bold" style={{ color: '#3b82f6' }}>{scores[1]}</span>
        </div>
      </div>
      <canvas ref={canvasRef} className="flex-1 w-full" style={{ display: 'block', touchAction: 'none' }} />

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
              <h2 className="text-3xl font-black mb-1" style={{ color: gameResult === 'p1' ? '#ef4444' : '#3b82f6' }}>
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
