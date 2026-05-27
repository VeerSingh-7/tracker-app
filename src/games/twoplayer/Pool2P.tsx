import { useEffect, useRef, useCallback } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { TwoPlayerGameProps } from './types'

// ─── Physics constants ────────────────────────────────────────────────────────
const SUBSTEPS       = 3      // collision sub-steps per rendered frame
const FRICTION       = 0.9835 // velocity multiplier applied once per frame
const STOP_SPEED     = 0.045  // px/frame — zero out when slower than this
const MAX_SPEED      = 22     // px/frame hard cap
const CUSHION_DAMPEN = 0.82   // energy retained on cushion bounce
// No ball-ball energy loss (perfectly elastic equal-mass collision)

// ─── Ball colours ─────────────────────────────────────────────────────────────
const BALL_COLOR: Record<number, string> = {
  0:  '#f5f5f0',  // cue
  1:  '#f5c518',  // solid yellow
  2:  '#1d4ed8',  // solid blue
  3:  '#dc2626',  // solid red
  4:  '#7c3aed',  // solid purple
  5:  '#ea580c',  // solid orange
  6:  '#15803d',  // solid green
  7:  '#78350f',  // solid brown
  8:  '#1a1a1a',  // 8-ball black
  9:  '#f5c518',  // stripe yellow
  10: '#1d4ed8',  // stripe blue
  11: '#dc2626',  // stripe red
  12: '#7c3aed',  // stripe purple
  13: '#ea580c',  // stripe orange
  14: '#15803d',  // stripe green
  15: '#78350f',  // stripe brown
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Ball {
  id:  number
  x:   number; y:  number
  vx:  number; vy: number
  r:   number
}

interface Pocket { x: number; y: number; r: number }

interface PoolState {
  w: number; h: number
  balls:   Ball[]
  potted:  number[]   // ids
  railW:   number
  ballR:   number
  playX1:  number; playX2:  number
  playY1:  number; playY2:  number
  pockets: Pocket[]
  spotX:      number
  headSpotY:  number
  footSpotY:  number
  centreSpotY: number
  headStringY: number
}

// ─── Layout ───────────────────────────────────────────────────────────────────
function computeLayout(W: number, H: number) {
  const railW = Math.round(Math.max(14, Math.min(22, W * 0.054)))
  const ballR  = Math.max(9, Math.min(16, ((W - railW * 2) / 22)))

  const playX1 = railW, playX2 = W - railW
  const playY1 = railW, playY2 = H - railW
  const playW  = playX2 - playX1
  const playH  = playY2 - playY1
  const spotX  = playX1 + playW / 2
  const midY   = playY1 + playH / 2

  // Standard pool spots — head at top, foot at bottom
  const headStringY = playY1 + playH * 0.25
  const headSpotY   = headStringY
  const centreSpotY = midY
  const footSpotY   = playY1 + playH * 0.70

  const pocketR = ballR * 1.38

  const pockets: Pocket[] = [
    { x: playX1, y: playY1, r: pocketR },       // top-left  corner
    { x: playX2, y: playY1, r: pocketR },       // top-right corner
    { x: playX1, y: midY,   r: pocketR },       // mid-left  side
    { x: playX2, y: midY,   r: pocketR },       // mid-right side
    { x: playX1, y: playY2, r: pocketR },       // bot-left  corner
    { x: playX2, y: playY2, r: pocketR },       // bot-right corner
  ]

  return {
    railW, ballR, pocketR,
    playX1, playX2, playY1, playY2, playW, playH,
    spotX, midY,
    headStringY, headSpotY, centreSpotY, footSpotY,
    pockets,
  }
}

// ─── Ball factory ──────────────────────────────────────────────────────────────
// Rack order: apex=1, 8-ball in centre of row 2, rest mixed
const RACK_ORDER = [1, 2, 9, 3, 8, 10, 4, 14, 7, 11, 12, 6, 13, 5, 15]

function createBalls(W: number, H: number): Ball[] {
  const L   = computeLayout(W, H)
  const { ballR, spotX, footSpotY, headSpotY } = L
  const SQ3 = Math.sqrt(3)
  const sep = ballR * 2.04   // slight gap prevents pre-collision touching
  const balls: Ball[] = []

  // Triangle rack (5 rows, apex at top = smallest y)
  let ri = 0
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const ox = (col - row / 2) * sep
      const oy = row * SQ3 * ballR + row * 0.4
      balls.push({
        id: RACK_ORDER[ri++],
        x: spotX + ox,
        y: footSpotY + oy,
        vx: 0, vy: 0,
        r: ballR,
      })
    }
  }

  // Cue ball at head spot
  balls.push({ id: 0, x: spotX, y: headSpotY, vx: 0, vy: 0, r: ballR })

  return balls
}

function buildState(W: number, H: number): PoolState {
  const L = computeLayout(W, H)
  return {
    w: W, h: H,
    balls:   createBalls(W, H),
    potted:  [],
    railW:    L.railW,
    ballR:    L.ballR,
    playX1:   L.playX1, playX2:   L.playX2,
    playY1:   L.playY1, playY2:   L.playY2,
    pockets:  L.pockets,
    spotX:       L.spotX,
    headSpotY:   L.headSpotY,
    footSpotY:   L.footSpotY,
    centreSpotY: L.centreSpotY,
    headStringY: L.headStringY,
  }
}

// ─── Physics helpers ───────────────────────────────────────────────────────────
function capSpeed(b: Ball) {
  const spd2 = b.vx * b.vx + b.vy * b.vy
  if (spd2 > MAX_SPEED * MAX_SPEED) {
    const s = MAX_SPEED / Math.sqrt(spd2)
    b.vx *= s; b.vy *= s
  }
}

/** Returns true if ball is close enough to any pocket to skip wall bounce */
function nearAnyPocket(b: Ball, pockets: Pocket[]): boolean {
  const margin = b.r * 2.0
  for (const p of pockets) {
    const dx = b.x - p.x, dy = b.y - p.y
    if (dx * dx + dy * dy < margin * margin) return true
  }
  return false
}

function resolveWall(b: Ball, s: PoolState) {
  if (nearAnyPocket(b, s.pockets)) return  // pocket region — skip wall bounce

  if (b.x - b.r < s.playX1) {
    b.x  = s.playX1 + b.r
    b.vx = Math.abs(b.vx) * CUSHION_DAMPEN
  } else if (b.x + b.r > s.playX2) {
    b.x  = s.playX2 - b.r
    b.vx = -Math.abs(b.vx) * CUSHION_DAMPEN
  }

  if (b.y - b.r < s.playY1) {
    b.y  = s.playY1 + b.r
    b.vy = Math.abs(b.vy) * CUSHION_DAMPEN
  } else if (b.y + b.r > s.playY2) {
    b.y  = s.playY2 - b.r
    b.vy = -Math.abs(b.vy) * CUSHION_DAMPEN
  }
}

function resolveBallPair(a: Ball, b: Ball) {
  const dx   = b.x - a.x
  const dy   = b.y - a.y
  const dist2 = dx * dx + dy * dy
  const minD  = a.r + b.r

  if (dist2 >= minD * minD || dist2 < 0.0001) return

  const dist = Math.sqrt(dist2)
  // Collision normal (a → b)
  const nx = dx / dist, ny = dy / dist

  // Separate overlapping balls
  const overlap = (minD - dist) / 2
  a.x -= nx * overlap; a.y -= ny * overlap
  b.x += nx * overlap; b.y += ny * overlap

  // 2-D elastic collision, equal mass:
  // Swap normal velocity components
  const avn = a.vx * nx + a.vy * ny   // a's normal speed
  const bvn = b.vx * nx + b.vy * ny   // b's normal speed

  if (avn - bvn <= 0) return  // already separating

  // Transfer normal impulse
  a.vx += (bvn - avn) * nx
  a.vy += (bvn - avn) * ny
  b.vx += (avn - bvn) * nx
  b.vy += (avn - bvn) * ny

  capSpeed(a); capSpeed(b)
}

function updatePhysics(s: PoolState) {
  for (let sub = 0; sub < SUBSTEPS; sub++) {
    // 1. Move all balls (fractional step)
    for (const b of s.balls) {
      b.x += b.vx / SUBSTEPS
      b.y += b.vy / SUBSTEPS
    }

    // 2. Pocket detection (before wall so corner pockets work)
    const toRemove: number[] = []
    for (const b of s.balls) {
      for (const p of s.pockets) {
        const dx = b.x - p.x, dy = b.y - p.y
        if (dx * dx + dy * dy < p.r * p.r) {
          toRemove.push(b.id); break
        }
      }
    }
    if (toRemove.length) {
      for (const id of toRemove) s.potted.push(id)
      s.balls = s.balls.filter(b => !toRemove.includes(b.id))
    }

    // 3. Wall / cushion collisions
    for (const b of s.balls) resolveWall(b, s)

    // 4. Ball–ball collisions (all pairs)
    const n = s.balls.length
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        resolveBallPair(s.balls[i], s.balls[j])
      }
    }
  }

  // 5. Friction + stop (once per rendered frame)
  for (const b of s.balls) {
    b.vx *= FRICTION; b.vy *= FRICTION
    if (b.vx * b.vx + b.vy * b.vy < STOP_SPEED * STOP_SPEED) {
      b.vx = 0; b.vy = 0
    }
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function drawTable(ctx: CanvasRenderingContext2D, s: PoolState) {
  const { w: W, h: H, playX1, playX2, playY1, playY2, pockets, ballR } = s

  // ── Wooden rails ──
  const railGrad = ctx.createLinearGradient(0, 0, W, 0)
  railGrad.addColorStop(0,   '#6b3a1f')
  railGrad.addColorStop(0.5, '#8B4513')
  railGrad.addColorStop(1,   '#6b3a1f')
  ctx.fillStyle = railGrad
  ctx.fillRect(0, 0, W, H)

  // Rail highlight line
  ctx.strokeStyle = 'rgba(255,200,120,0.18)'
  ctx.lineWidth = 1
  ctx.strokeRect(2, 2, W - 4, H - 4)

  // ── Felt surface ──
  const feltGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.65)
  feltGrad.addColorStop(0,   '#0d6b32')
  feltGrad.addColorStop(0.6, '#0a5a2a')
  feltGrad.addColorStop(1,   '#084a22')
  ctx.fillStyle = feltGrad
  ctx.fillRect(playX1, playY1, playX2 - playX1, playY2 - playY1)

  // Subtle felt weave texture (horizontal lines)
  ctx.strokeStyle = 'rgba(0,0,0,0.04)'
  ctx.lineWidth = 1
  for (let y = playY1; y < playY2; y += 4) {
    ctx.beginPath(); ctx.moveTo(playX1, y); ctx.lineTo(playX2, y); ctx.stroke()
  }

  // ── Cushion inner bevel ──
  ctx.strokeStyle = 'rgba(30,160,70,0.4)'
  ctx.lineWidth = 2
  ctx.strokeRect(playX1 + 1, playY1 + 1, playX2 - playX1 - 2, playY2 - playY1 - 2)

  // ── Spots ──
  const spotR = ballR * 0.12
  const drawSpot = (x: number, y: number) => {
    ctx.beginPath(); ctx.arc(x, y, spotR, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill()
  }
  drawSpot(s.spotX, s.headSpotY)
  drawSpot(s.spotX, s.centreSpotY)
  drawSpot(s.spotX, s.footSpotY)

  // ── Head string ──
  ctx.setLineDash([4, 5])
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(playX1 + 2, s.headStringY)
  ctx.lineTo(playX2 - 2, s.headStringY)
  ctx.stroke()
  ctx.setLineDash([])

  // ── Pockets ──
  for (const p of pockets) {
    // Outer dark ring (leather)
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2)
    ctx.fillStyle = '#2a1a0a'; ctx.fill()

    // Pocket opening (black hole)
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    const pocketGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
    pocketGrad.addColorStop(0, '#111')
    pocketGrad.addColorStop(1, '#000')
    ctx.fillStyle = pocketGrad; ctx.fill()

    // Pocket rim highlight
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(100,60,20,0.6)'; ctx.lineWidth = 1.5; ctx.stroke()
  }
}

function drawBall(ctx: CanvasRenderingContext2D, b: Ball) {
  const { x, y, r, id } = b
  const isStripe = id >= 9 && id <= 15
  const isCue    = id === 0

  // ── Shadow ──
  ctx.beginPath(); ctx.ellipse(x + 1.5, y + 2.5, r * 0.88, r * 0.4, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill()

  // ── Ball body ──
  ctx.save()
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip()

  if (isCue) {
    // Plain white with subtle blue tint
    const g = ctx.createRadialGradient(x - r * 0.28, y - r * 0.28, r * 0.05, x, y, r)
    g.addColorStop(0,   '#ffffff')
    g.addColorStop(0.7, '#e8edf2')
    g.addColorStop(1,   '#c8d0d8')
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2)
  } else if (isStripe) {
    // White base
    ctx.fillStyle = '#f5f5f2'; ctx.fillRect(x - r, y - r, r * 2, r * 2)
    // Coloured band across middle (40% of diameter)
    const bandH = r * 0.82
    ctx.fillStyle = BALL_COLOR[id]
    ctx.fillRect(x - r, y - bandH / 2, r * 2, bandH)
  } else {
    // Solid colour ball
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.32, r * 0.04, x, y, r)
    const col = BALL_COLOR[id]
    g.addColorStop(0,   lighten(col, 0.45))
    g.addColorStop(0.5, col)
    g.addColorStop(1,   darken(col, 0.3))
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  // Gloss specular
  ctx.beginPath(); ctx.ellipse(x - r * 0.28, y - r * 0.3, r * 0.24, r * 0.14, -0.4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill()

  ctx.restore()

  // ── Outline ──
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.strokeStyle = isCue ? 'rgba(180,190,200,0.5)' : 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 0.8; ctx.stroke()

  // ── Number disc (not on cue) ──
  if (!isCue) {
    const discR = r * 0.40
    ctx.beginPath(); ctx.arc(x, y, discR, 0, Math.PI * 2)
    ctx.fillStyle = id === 8 ? '#1a1a1a' : '#f8f8f5'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5; ctx.stroke()

    // Number text
    const fontSize = Math.max(6, r * 0.48)
    ctx.font = `bold ${fontSize}px "Arial Narrow", Arial, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = id === 8 ? '#ffffff' : '#111111'
    ctx.fillText(String(id), x, y + fontSize * 0.04)
  }
}

// Tiny colour helpers (hex → lighten/darken)
function lighten(hex: string, amt: number): string {
  return blendToward(hex, '#ffffff', amt)
}
function darken(hex: string, amt: number): string {
  return blendToward(hex, '#000000', amt)
}
function blendToward(hex: string, target: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  const r1 = p(hex.replace('#', ''), 0), g1 = p(hex.replace('#', ''), 2), b1 = p(hex.replace('#', ''), 4)
  const r2 = p(target.replace('#', ''), 0), g2 = p(target.replace('#', ''), 2), b2 = p(target.replace('#', ''), 4)
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `rgb(${lerp(r1, r2)},${lerp(g1, g2)},${lerp(b1, b2)})`
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Pool2P({ onBack }: TwoPlayerGameProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const stateRef   = useRef<PoolState | null>(null)

  // Exposed imperative actions (mutate stateRef directly — no React re-render needed)
  const fireCueBall = useCallback(() => {
    const s = stateRef.current; if (!s) return
    // Remove any existing cue ball instance, then add fresh one at head spot
    s.balls = s.balls.filter(b => b.id !== 0)
    s.potted = s.potted.filter(id => id !== 0)
    s.balls.push({
      id: 0, r: s.ballR,
      x: s.spotX, y: s.headSpotY,
      vx: (Math.random() - 0.5) * 0.4,
      vy: MAX_SPEED * 0.77,   // strong but sub-cap shot toward rack
    })
  }, [])

  const resetTable = useCallback(() => {
    const s = stateRef.current; if (!s) return
    s.balls  = createBalls(s.w, s.h)
    s.potted = []
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return

    let rafId = 0
    const evL: { ev: string; fn: EventListenerOrEventListenerObject; opts?: AddEventListenerOptions }[] = []

    const cleanup = () => {
      cancelAnimationFrame(rafId)
      evL.forEach(({ ev, fn, opts }) => canvas.removeEventListener(ev, fn, opts))
      evL.length = 0
    }

    const initAndRun = () => {
      cleanup()
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 50 || rect.height < 100) {
        rafId = requestAnimationFrame(initAndRun); return
      }

      const dpr = window.devicePixelRatio || 1
      canvas.width  = rect.width  * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      const W = rect.width, H = rect.height

      // Build fresh state (on re-init we reset — fine for test harness)
      stateRef.current = buildState(W, H)
      const s = stateRef.current

      const loop = () => {
        updatePhysics(s)

        // ── Draw ──
        ctx.clearRect(0, 0, W, H)
        drawTable(ctx, s)

        // Draw balls back-to-front (by y, but since pool is top-down we just draw them all)
        for (const b of s.balls) drawBall(ctx, b)

        // Potted tally (debug: tiny chips in bottom rail)
        if (s.potted.length > 0) {
          ctx.font = `bold ${Math.max(9, s.ballR * 0.55)}px Arial`
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
          ctx.fillStyle = 'rgba(255,255,255,0.55)'
          const label = `Potted: ${s.potted.join(' ')}`
          ctx.fillText(label, s.playX1 + 4, H - s.railW / 2)
        }

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
  }, [])   // no deps — stable

  return (
    <div className="h-full flex flex-col" style={{ background: '#2a1a0a' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pb-2 flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)', background: 'rgba(30,18,6,0.96)' }}
      >
        <button
          onClick={onBack}
          className="p-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Pool — Physics Test</h1>
        <span
          className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(245,197,24,0.2)', color: '#f5c518' }}
        >
          WIP
        </span>
      </div>

      {/* Canvas area */}
      <div className="canvas-area" style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            touchAction: 'none', display: 'block',
          }}
        />

        {/* Test harness buttons */}
        <div
          style={{
            position: 'absolute', bottom: 14, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', gap: 12,
            zIndex: 10, pointerEvents: 'none',
          }}
        >
          <button
            onClick={fireCueBall}
            style={{
              pointerEvents: 'auto',
              background: 'rgba(245,197,24,0.88)',
              color: '#111',
              fontWeight: 800,
              fontSize: 13,
              padding: '8px 18px',
              borderRadius: 20,
              border: 'none',
              boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
              letterSpacing: '0.02em',
            }}
          >
            🎱 FIRE CUE BALL
          </button>
          <button
            onClick={resetTable}
            style={{
              pointerEvents: 'auto',
              background: 'rgba(60,60,60,0.88)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              padding: '8px 18px',
              borderRadius: 20,
              border: 'none',
              boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
            }}
          >
            ↺ RESET
          </button>
        </div>
      </div>
    </div>
  )
}
