import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { saveGameScore, getGameScore } from '../../db'
import type { TwoPlayerGameProps } from './types'

const PAD_W = 88
const PAD_H = 14
const BALL_R = 9
const PAD_OFFSET = 28
const WIN_SCORE = 7
const BASE_SPEED = 5.5

interface PongState {
  w: number; h: number
  bx: number; by: number; bvx: number; bvy: number
  p1x: number; p2x: number
  p1s: number; p2s: number
  speed: number; rally: number
  phase: 'countdown' | 'playing' | 'done'
  countdown: number; countTimer: number
  winner: 'p1' | 'p2' | null
  p1touch: number | null; p2touch: number | null
}

function resetBall(s: PongState) {
  s.bx = s.w / 2; s.by = s.h / 2
  const angle = (Math.random() * 0.6 + 0.2) * (Math.random() < 0.5 ? 1 : -1)
  const dir = s.p1s > s.p2s ? -1 : 1
  s.bvx = Math.sin(angle) * BASE_SPEED
  s.bvy = Math.cos(angle) * BASE_SPEED * dir
  s.speed = BASE_SPEED; s.rally = 0
  s.phase = 'countdown'; s.countdown = 3; s.countTimer = 0
}

export default function PingPong2P({ mode, difficulty = 'medium', onBack, onGameEnd, tournamentMode }: TwoPlayerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<PongState | null>(null)
  const [scores, setScores] = useState([0, 0])
  const [gameResult, setGameResult] = useState<'p1' | 'p2' | null>(null)
  const gameResultRef = useRef<'p1' | 'p2' | null>(null)

  const saveScore = async (w: 'p1' | 'p2') => {
    const id = `pingpong_${mode === 'ai' ? `ai_${difficulty}` : '2p'}`
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
      if (!rect.width || !rect.height) { rafId = requestAnimationFrame(initAndRun); return }

      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')!; ctx.scale(dpr, dpr)
      const W = rect.width, H = rect.height

      // Preserve score if reinitializing mid-game (e.g. orientation change)
      const prev = stateRef.current
      const s: PongState = {
        w: W, h: H, bx: W/2, by: H/2, bvx: 0, bvy: 0,
        p1x: W/2, p2x: W/2,
        p1s: prev?.p1s ?? 0, p2s: prev?.p2s ?? 0,
        speed: BASE_SPEED, rally: 0,
        phase: 'countdown', countdown: 3, countTimer: 0,
        winner: prev?.winner ?? null,
        p1touch: null, p2touch: null,
      }
      if (s.winner) { s.phase = 'done' } else { resetBall(s) }
      stateRef.current = s

      const onTouchStart = (e: TouchEvent) => {
        e.preventDefault()
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i]
          const ty = t.clientY - rect.top
          // P1 = bottom 40%, P2 = top 40% (with 20% middle buffer)
          if (ty > H * 0.60) s.p1touch = t.identifier
          else if (ty < H * 0.40 && mode === '2p') s.p2touch = t.identifier
        }
      }
      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault()
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i]
          const tx = t.clientX - rect.left
          if (t.identifier === s.p1touch) s.p1x = Math.max(PAD_W/2, Math.min(W - PAD_W/2, tx))
          if (t.identifier === s.p2touch) s.p2x = Math.max(PAD_W/2, Math.min(W - PAD_W/2, tx))
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
        if (my > H * 0.60) s.p1x = Math.max(PAD_W/2, Math.min(W - PAD_W/2, mx))
        else if (my < H * 0.40 && mode === '2p') s.p2x = Math.max(PAD_W/2, Math.min(W - PAD_W/2, mx))
      }
      addEv('touchstart', onTouchStart, { passive: false })
      addEv('touchmove', onTouchMove, { passive: false })
      addEv('touchend', onTouchEnd, { passive: false })
      addEv('mousemove', onMouseMove)

      const aiSpeed = difficulty === 'easy' ? 0.03 : difficulty === 'medium' ? 0.055 : 0.092

      const update = () => {
        if (s.phase === 'countdown') {
          s.countTimer++
          if (s.countTimer >= 60) { s.countdown--; s.countTimer = 0 }
          if (s.countdown <= 0) s.phase = 'playing'
          return
        }
        if (s.phase !== 'playing') return

        if (mode === 'ai') {
          // Track ball when coming toward AI, return to center otherwise
          const targetX = s.bvy < 0 ? s.bx : W / 2
          const miss = difficulty === 'easy' && Math.random() < 0.004
          if (!miss) {
            const diff = targetX - s.p2x
            const spd = Math.abs(diff) * aiSpeed
            s.p2x += Math.sign(diff) * Math.min(spd, Math.abs(diff))
            s.p2x = Math.max(PAD_W/2, Math.min(W - PAD_W/2, s.p2x))
          }
        }

        s.bx += s.bvx; s.by += s.bvy
        if (s.bx - BALL_R < 0) { s.bx = BALL_R; s.bvx = Math.abs(s.bvx) }
        if (s.bx + BALL_R > W) { s.bx = W - BALL_R; s.bvx = -Math.abs(s.bvx) }

        const p1y = H - PAD_OFFSET
        if (s.bvy > 0 && s.by + BALL_R >= p1y - PAD_H/2 && s.by - BALL_R <= p1y + PAD_H/2
            && s.bx >= s.p1x - PAD_W/2 && s.bx <= s.p1x + PAD_W/2) {
          const hit = (s.bx - s.p1x) / (PAD_W/2)
          s.speed = Math.min(s.speed + 0.25, 11)
          s.bvx = hit * s.speed * 0.75
          s.bvy = -Math.sqrt(Math.max(0, s.speed * s.speed - s.bvx * s.bvx))
          s.by = p1y - PAD_H/2 - BALL_R; s.rally++
        }
        const p2y = PAD_OFFSET
        if (s.bvy < 0 && s.by - BALL_R <= p2y + PAD_H/2 && s.by + BALL_R >= p2y - PAD_H/2
            && s.bx >= s.p2x - PAD_W/2 && s.bx <= s.p2x + PAD_W/2) {
          const hit = (s.bx - s.p2x) / (PAD_W/2)
          s.speed = Math.min(s.speed + 0.25, 11)
          s.bvx = hit * s.speed * 0.75
          s.bvy = Math.sqrt(Math.max(0, s.speed * s.speed - s.bvx * s.bvx))
          s.by = p2y + PAD_H/2 + BALL_R; s.rally++
        }

        if (s.by > H + BALL_R) {
          s.p2s++; setScores([s.p1s, s.p2s])
          if (s.p2s >= WIN_SCORE) { s.winner = 'p2'; s.phase = 'done'; gameResultRef.current = 'p2'; setGameResult('p2'); saveScore('p2') }
          else resetBall(s)
        }
        if (s.by < -BALL_R) {
          s.p1s++; setScores([s.p1s, s.p2s])
          if (s.p1s >= WIN_SCORE) { s.winner = 'p1'; s.phase = 'done'; gameResultRef.current = 'p1'; setGameResult('p1'); saveScore('p1') }
          else resetBall(s)
        }
      }

      const render = () => {
        ctx.clearRect(0, 0, W, H)
        const bg = ctx.createLinearGradient(0, 0, 0, H)
        bg.addColorStop(0, '#0a1a2e'); bg.addColorStop(1, '#051020')
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

        ctx.setLineDash([12, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke()
        ctx.setLineDash([])

        // Touch zone hints
        ctx.fillStyle = 'rgba(59,130,246,0.04)'; ctx.fillRect(0, 0, W, H * 0.40)
        ctx.fillStyle = 'rgba(239,68,68,0.04)'; ctx.fillRect(0, H * 0.60, W, H * 0.40)

        ctx.font = 'bold 52px Inter, system-ui'; ctx.textBaseline = 'middle'
        ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.textAlign = 'left'
        ctx.fillText(String(s.p1s), 20, H/2)
        ctx.fillStyle = 'rgba(59,130,246,0.9)'; ctx.textAlign = 'right'
        ctx.fillText(String(s.p2s), W - 20, H/2)

        const p2y = PAD_OFFSET
        ctx.beginPath(); ctx.roundRect(s.p2x - PAD_W/2, p2y - PAD_H/2, PAD_W, PAD_H, 7)
        ctx.fillStyle = '#3b82f6'; ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0

        const p1y = H - PAD_OFFSET
        ctx.beginPath(); ctx.roundRect(s.p1x - PAD_W/2, p1y - PAD_H/2, PAD_W, PAD_H, 7)
        ctx.fillStyle = '#ef4444'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0

        if (s.phase !== 'done') {
          ctx.beginPath(); ctx.arc(s.bx, s.by, BALL_R, 0, Math.PI * 2)
          ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(255,255,255,0.6)'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0
        }

        if (s.phase === 'countdown' && s.countdown > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H)
          ctx.font = 'bold 80px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(59,158,255,0.8)'; ctx.shadowBlur = 20
          ctx.fillText(String(s.countdown), W/2, H/2); ctx.shadowBlur = 0
        }

        ctx.font = 'bold 12px Inter, system-ui'; ctx.textAlign = 'center'
        ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(59,130,246,0.5)'
        ctx.fillText(mode === 'ai' ? `AI (${difficulty})` : 'P2 — drag top', W/2, 8)
        ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(239,68,68,0.5)'
        ctx.fillText(mode === 'ai' ? 'You — drag bottom' : 'P1 — drag bottom', W/2, H - 8)
      }

      const loop = () => { update(); render(); rafId = requestAnimationFrame(loop) }
      rafId = requestAnimationFrame(loop)
    }

    // Use ResizeObserver to re-init when canvas gets proper dimensions or is rotated
    let resizeTimer = 0
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(initAndRun, 150)
    })
    ro.observe(canvas)
    initAndRun()

    return () => { cleanup(); ro.disconnect(); clearTimeout(resizeTimer) }
  }, [mode, difficulty])

  const handleBack = () => { if (gameResultRef.current && onGameEnd) onGameEnd(gameResultRef.current); else onBack() }
  const handleNext = () => { if (gameResultRef.current && onGameEnd) onGameEnd(gameResultRef.current) }
  const handleRestart = () => {
    const s = stateRef.current; if (!s) return
    s.p1s = 0; s.p2s = 0; s.p1x = s.w/2; s.p2x = s.w/2
    s.winner = null; gameResultRef.current = null
    resetBall(s); setScores([0, 0]); setGameResult(null)
  }

  return (
    <div className="h-full flex flex-col relative" style={{ background: '#051020' }}>
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 safe-top" style={{ background: 'rgba(5,16,32,0.95)' }}>
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Ping Pong</h1>
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
              <div className="text-5xl mb-3">🏓</div>
              <h2 className="text-3xl font-black mb-1" style={{ color: gameResult === 'p1' ? '#ef4444' : '#3b82f6' }}>
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
