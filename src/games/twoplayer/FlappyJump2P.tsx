import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { saveGameScore, getGameScore } from '../../db'
import type { TwoPlayerGameProps, AIDifficulty } from './types'

const BIRD_X = 72
const BIRD_R = 14
const GRAVITY = 0.34
const JUMP_VY = -7.8
const PIPE_W = 50
const PIPE_GAP = 125
const SCROLL_SPD = 2.6
interface Bird {
  y: number; vy: number; alive: boolean; score: number
  deathFrame: number | null; flapped: boolean
}
interface Pipe {
  x: number; gapCenter: number; passed: boolean
}
interface FJState {
  w: number; h: number; hh: number
  p1: Bird; p2: Bird
  p1Pipes: Pipe[]; p2Pipes: Pipe[]
  frame: number
  phase: 'ready' | 'playing' | 'done'
  winner: 'p1' | 'p2' | 'draw' | null
  readyTimer: number
}

function makePipe(x: number, hh: number): Pipe {
  return { x, gapCenter: hh * (0.28 + Math.random() * 0.44), passed: false }
}

function aiFlap(bird: Bird, pipes: Pipe[], hh: number, difficulty: AIDifficulty, frame: number) {
  if (!bird.alive) return
  const next = pipes.find(p => p.x + PIPE_W > BIRD_X - 4)
  if (!next) {
    if (bird.y > hh * 0.6 && bird.vy > -2) bird.vy = JUMP_VY
    return
  }
  const target = next.gapCenter + (difficulty === 'easy' ? (Math.random()-0.5)*PIPE_GAP*0.6
    : difficulty === 'medium' ? (Math.random()-0.5)*PIPE_GAP*0.25 : (Math.random()-0.5)*20)
  const lookahead = difficulty === 'hard' ? 28 : difficulty === 'medium' ? 18 : 14
  let fy = bird.y, fvy = bird.vy
  for (let i = 0; i < lookahead; i++) { fvy += GRAVITY; fy += fvy }
  const margin = difficulty === 'hard' ? 8 : difficulty === 'medium' ? 22 : 38
  if (fy > target + margin || bird.y > target + 10) {
    if (bird.vy > JUMP_VY * 0.3 || bird.y > target + 25) bird.vy = JUMP_VY
  }
  // Easy occasionally misses
  if (difficulty === 'easy' && frame % 180 < 15) return
}

export default function FlappyJump2P({ mode, difficulty = 'medium', onBack, onGameEnd, tournamentMode }: TwoPlayerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<FJState | null>(null)
  const rafRef = useRef<number>(0)
  const [display, setDisplay] = useState({ p1Score: 0, p2Score: 0 })
  const [gameResult, setGameResult] = useState<'p1' | 'p2' | 'draw' | null>(null)

  const saveScore = async (w: 'p1' | 'p2' | 'draw') => {
    const id = `flappyjump_${mode === 'ai' ? `ai_${difficulty}` : '2p'}`
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
    const W = rect.width, H = rect.height, HH = H / 2

    const s: FJState = {
      w: W, h: H, hh: HH,
      p1: { y: HH * 0.5, vy: 0, alive: true, score: 0, deathFrame: null, flapped: false },
      p2: { y: HH * 0.5, vy: 0, alive: true, score: 0, deathFrame: null, flapped: false },
      p1Pipes: [makePipe(W + 40, HH)],
      p2Pipes: [makePipe(W + 40, HH)],
      frame: 0, phase: 'ready', winner: null, readyTimer: 0,
    }
    stateRef.current = s

    const tap = (y: number) => {
      if (s.phase === 'ready') { s.phase = 'playing'; return }
      if (s.phase !== 'playing') return
      // Top half = P1 (red), bottom half = P2 (blue)
      if (y < H/2 && s.p1.alive) s.p1.vy = JUMP_VY
      else if (y >= H/2 && s.p2.alive && mode === '2p') s.p2.vy = JUMP_VY
    }
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      for (let i = 0; i < e.changedTouches.length; i++) {
        tap(e.changedTouches[i].clientY - rect.top)
      }
    }
    const onMouseDown = (e: MouseEvent) => tap(e.clientY - rect.top)

    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('mousedown', onMouseDown)

    const updateBird = (bird: Bird, pipes: Pipe[]) => {
      if (!bird.alive) return
      bird.vy += GRAVITY; bird.y += bird.vy
      // Ceiling / floor
      if (bird.y - BIRD_R < 0) { bird.y = BIRD_R; bird.vy = 0 }
      if (bird.y + BIRD_R > HH) { bird.alive = false; bird.deathFrame = s.frame; return }
      // Pipe collision
      for (const p of pipes) {
        if (p.x + PIPE_W < BIRD_X - BIRD_R || p.x > BIRD_X + BIRD_R) continue
        const gapTop = p.gapCenter - PIPE_GAP/2
        const gapBot = p.gapCenter + PIPE_GAP/2
        if (bird.y - BIRD_R < gapTop || bird.y + BIRD_R > gapBot) {
          bird.alive = false; bird.deathFrame = s.frame; return
        }
      }
    }

    const updatePipes = (pipes: Pipe[], bird: Bird) => {
      for (const p of pipes) {
        p.x -= SCROLL_SPD
        if (!p.passed && p.x + PIPE_W < BIRD_X) { p.passed = true; bird.score++ }
      }
      // Remove off-screen
      while (pipes.length && pipes[0].x + PIPE_W < 0) pipes.shift()
      // Add new
      if (pipes.length === 0 || pipes[pipes.length-1].x < W - W*0.55) {
        pipes.push(makePipe(W + 20, HH))
      }
    }

    const drawHalf = (offsetY: number, bird: Bird, pipes: Pipe[], color: string, label: string) => {
      ctx.save()
      ctx.beginPath(); ctx.rect(0, offsetY, W, HH); ctx.clip()

      // Sky gradient
      const sky = ctx.createLinearGradient(0, offsetY, 0, offsetY + HH)
      sky.addColorStop(0, offsetY === 0 ? '#1a2e5a' : '#1a3a20')
      sky.addColorStop(1, offsetY === 0 ? '#0e1e3a' : '#0e2014')
      ctx.fillStyle = sky; ctx.fillRect(0, offsetY, W, HH)

      // Pipes
      ctx.shadowBlur = 0
      for (const p of pipes) {
        const gapTop = p.gapCenter - PIPE_GAP/2
        const gapBot = p.gapCenter + PIPE_GAP/2
        // Top pipe
        ctx.fillStyle = '#2d8a3e'
        ctx.fillRect(p.x, offsetY, PIPE_W, gapTop)
        ctx.fillStyle = '#3daa4e'
        ctx.fillRect(p.x - 4, offsetY + gapTop - 18, PIPE_W + 8, 18)
        // Bottom pipe
        ctx.fillStyle = '#2d8a3e'
        ctx.fillRect(p.x, offsetY + gapBot, PIPE_W, HH - gapBot)
        ctx.fillStyle = '#3daa4e'
        ctx.fillRect(p.x - 4, offsetY + gapBot, PIPE_W + 8, 18)
      }

      // Bird
      if (bird.alive) {
        const by = offsetY + bird.y
        const tilt = Math.max(-0.5, Math.min(0.5, bird.vy * 0.06))
        ctx.save(); ctx.translate(BIRD_X, by); ctx.rotate(tilt)
        // Body
        ctx.beginPath(); ctx.arc(0, 0, BIRD_R, 0, Math.PI*2)
        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.fill()
        // Eye
        ctx.shadowBlur = 0
        ctx.beginPath(); ctx.arc(5, -3, 4, 0, Math.PI*2)
        ctx.fillStyle = '#fff'; ctx.fill()
        ctx.beginPath(); ctx.arc(6, -3, 2.2, 0, Math.PI*2)
        ctx.fillStyle = '#111'; ctx.fill()
        // Beak
        ctx.beginPath(); ctx.moveTo(BIRD_R, 0); ctx.lineTo(BIRD_R+8, -2); ctx.lineTo(BIRD_R+8, 3); ctx.closePath()
        ctx.fillStyle = '#f97316'; ctx.fill()
        ctx.restore()
      } else {
        // Dead — X eyes
        const by = offsetY + (bird.deathFrame !== null ? Math.min(bird.y + (s.frame - bird.deathFrame!) * 0.8, HH - 4) : bird.y)
        ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillStyle = color; ctx.globalAlpha = 0.6
        ctx.fillText('💀', BIRD_X, by)
        ctx.globalAlpha = 1
      }

      // Score
      ctx.font = 'bold 28px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4
      ctx.fillText(String(bird.score), W/2, offsetY + 8)
      ctx.shadowBlur = 0

      // Label
      ctx.font = 'bold 11px Inter, system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillStyle = `${color}88`; ctx.fillText(label, 8, offsetY + 8)

      ctx.restore()
    }

    const render = () => {
      ctx.clearRect(0, 0, W, H)
      // Top half: P1 red
      drawHalf(0, s.p1, s.p1Pipes, '#ef4444', mode === 'ai' ? 'You' : 'P1')
      // Bottom half: P2 blue
      drawHalf(HH, s.p2, s.p2Pipes, '#3b82f6', mode === 'ai' ? `AI (${difficulty})` : 'P2')

      // Divider
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(0, HH - 1.5, W, 3)

      // Ready overlay
      if (s.phase === 'ready') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H)
        ctx.font = 'bold 22px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(59,158,255,0.7)'; ctx.shadowBlur = 12
        ctx.fillText('TAP TO START', W/2, H/2)
        ctx.shadowBlur = 0; ctx.font = '14px Inter, system-ui'
        ctx.fillStyle = 'rgba(239,68,68,0.8)'; ctx.fillText('Tap top half → Red flies', W/2, H/2 - 60)
        ctx.fillStyle = 'rgba(59,130,246,0.8)'; ctx.fillText(mode === '2p' ? 'Tap bottom half → Blue flies' : 'AI controls Blue', W/2, H/2 + 60)
      }
    }

    const loop = () => {
      if (s.phase === 'playing') {
        // AI
        if (mode === 'ai') aiFlap(s.p2, s.p2Pipes, HH, difficulty, s.frame)

        updateBird(s.p1, s.p1Pipes)
        updateBird(s.p2, s.p2Pipes)
        updatePipes(s.p1Pipes, s.p1)
        updatePipes(s.p2Pipes, s.p2)

        s.frame++
        setDisplay({ p1Score: s.p1.score, p2Score: s.p2.score })

        // Check game over
        if (!s.p1.alive || !s.p2.alive) {
          const bothDead = !s.p1.alive && !s.p2.alive
          if (bothDead) {
            const diff = Math.abs((s.p1.deathFrame ?? 0) - (s.p2.deathFrame ?? 0))
            let w: 'p1' | 'p2' | 'draw'
            if (diff <= 3) w = s.p1.score > s.p2.score ? 'p1' : s.p2.score > s.p1.score ? 'p2' : 'draw'
            else w = (s.p1.deathFrame ?? 0) > (s.p2.deathFrame ?? 0) ? 'p1' : 'p2'
            s.winner = w; s.phase = 'done'; setGameResult(w); saveScore(w)
          } else if (!s.p1.alive) {
            s.winner = 'p2'; s.phase = 'done'; setGameResult('p2'); saveScore('p2')
          } else {
            s.winner = 'p1'; s.phase = 'done'; setGameResult('p1'); saveScore('p1')
          }
        }
      }
      render()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('mousedown', onMouseDown)
    }
  }, [mode, difficulty])

  const handleBack = () => { if (gameResult && onGameEnd) onGameEnd(gameResult); else onBack() }
  const handleNext = () => { if (gameResult && onGameEnd) onGameEnd(gameResult) }
  const handleRestart = () => {
    const s = stateRef.current; if (!s) return
    const W = s.w, HH = s.hh
    s.p1 = { y: HH*0.5, vy: 0, alive: true, score: 0, deathFrame: null, flapped: false }
    s.p2 = { y: HH*0.5, vy: 0, alive: true, score: 0, deathFrame: null, flapped: false }
    s.p1Pipes = [makePipe(W + 40, HH)]
    s.p2Pipes = [makePipe(W + 40, HH)]
    s.frame = 0; s.phase = 'ready'; s.winner = null
    setDisplay({ p1Score: 0, p2Score: 0 }); setGameResult(null)
  }

  return (
    <div className="h-full flex flex-col relative" style={{ background: '#0e1e3a' }}>
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 safe-top" style={{ background: 'rgba(10,18,38,0.95)' }}>
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Flappy Jump</h1>
        <div className="ml-auto flex gap-3 items-center">
          <span className="text-sm font-bold" style={{ color: '#ef4444' }}>{display.p1Score}</span>
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>–</span>
          <span className="text-sm font-bold" style={{ color: '#3b82f6' }}>{display.p2Score}</span>
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
              <div className="text-5xl mb-3">🐦</div>
              <h2 className="text-3xl font-black mb-1"
                style={{ color: gameResult === 'p1' ? '#ef4444' : gameResult === 'p2' ? '#3b82f6' : 'var(--loft-text)' }}>
                {gameResult === 'draw' ? "It's a Draw!"
                  : gameResult === 'p1' ? (mode === 'ai' ? 'You Win!' : 'Red Wins!')
                  : (mode === 'ai' ? 'AI Wins!' : 'Blue Wins!')}
              </h2>
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Red {display.p1Score} – {display.p2Score} Blue
              </p>
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
