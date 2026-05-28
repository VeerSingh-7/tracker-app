import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { TwoPlayerGameProps } from './types'

// ─── Physics constants (unchanged from prompt 1) ─────────────────────────────
const SUBSTEPS       = 3
const FRICTION       = 0.9835
const STOP_SPEED     = 0.045
const MAX_SPEED      = 22
const CUSHION_DAMPEN = 0.82

// ─── Shot constants ────────────────────────────────────────────────────────────
const MAX_SHOT_SPEED = MAX_SPEED * 0.92   // full-power shot
const TURN_CHANGE_FRAMES = 90             // ~1.5 s at 60 fps
const GROUP_OVERLAY_FRAMES = 120          // ~2 s

// ─── Ball colours ─────────────────────────────────────────────────────────────
const BALL_COLOR: Record<number, string> = {
  0:  '#f5f5f0',
  1:  '#f5c518', 2:  '#1d4ed8', 3:  '#dc2626',
  4:  '#7c3aed', 5:  '#ea580c', 6:  '#15803d', 7:  '#78350f',
  8:  '#1a1a1a',
  9:  '#f5c518', 10: '#1d4ed8', 11: '#dc2626',
  12: '#7c3aed', 13: '#ea580c', 14: '#15803d', 15: '#78350f',
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Ball {
  id: number
  x: number; y: number
  vx: number; vy: number
  r: number
  spin: number   // cosmetic rotation angle (radians)
}

interface Pocket { x: number; y: number; r: number }

type GamePhase = 'aiming' | 'shooting' | 'resolving' | 'turnChange'
type BallGroup = 'solids' | 'stripes'

interface PoolState {
  // Layout (from prompt 1)
  w: number; h: number
  balls: Ball[]
  potted: number[]
  railW: number; ballR: number
  playX1: number; playX2: number
  playY1: number; playY2: number
  pockets: Pocket[]
  spotX: number
  headSpotY: number; footSpotY: number
  centreSpotY: number; headStringY: number

  // Aiming
  aimAngle: number
  aimPower: number
  aimDragging: boolean
  powerDragging: boolean
  powerTouchStartY: number
  powerAtDragStart: number

  // Game state
  phase: GamePhase
  turn: 1 | 2
  isBreak: boolean
  tableOpen: boolean
  p1Group: BallGroup | null
  p2Group: BallGroup | null
  pottedThisTurn: number[]
  cuePottedThisTurn: boolean
  firstBallHitId: number | null
  turnChangeTimer: number
  groupOverlayTimer: number   // frames to show "groups assigned" banner
}

// ─── Layout (unchanged) ───────────────────────────────────────────────────────
function computeLayout(W: number, H: number) {
  const railW = Math.round(Math.max(14, Math.min(22, W * 0.054)))
  const ballR  = Math.max(9, Math.min(16, (W - railW * 2) / 22))
  const playX1 = railW, playX2 = W - railW
  const playY1 = railW, playY2 = H - railW
  const playW  = playX2 - playX1
  const playH  = playY2 - playY1
  const spotX  = playX1 + playW / 2
  const midY   = playY1 + playH / 2
  const headStringY = playY1 + playH * 0.25
  const headSpotY   = headStringY
  const centreSpotY = midY
  const footSpotY   = playY1 + playH * 0.70
  const pocketR = ballR * 1.38
  const pockets: Pocket[] = [
    { x: playX1, y: playY1, r: pocketR },
    { x: playX2, y: playY1, r: pocketR },
    { x: playX1, y: midY,   r: pocketR },
    { x: playX2, y: midY,   r: pocketR },
    { x: playX1, y: playY2, r: pocketR },
    { x: playX2, y: playY2, r: pocketR },
  ]
  return { railW, ballR, pocketR, playX1, playX2, playY1, playY2,
           playW, playH, spotX, midY,
           headStringY, headSpotY, centreSpotY, footSpotY, pockets }
}

// ─── Rack ─────────────────────────────────────────────────────────────────────
// Legal 8-ball rack: apex=1, 8-ball in row-2 centre,
// back-left corner=6 (solid), back-right corner=15 (stripe)
const RACK_ORDER = [1, 2, 9, 3, 8, 10, 4, 11, 5, 12, 6, 13, 7, 14, 15]

function createBalls(W: number, H: number): Ball[] {
  const L = computeLayout(W, H)
  const { ballR, spotX, footSpotY, headSpotY } = L
  const SQ3 = Math.sqrt(3)
  const sep  = ballR * 2.04
  const balls: Ball[] = []
  let ri = 0
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const ox = (col - row / 2) * sep
      const oy = row * SQ3 * ballR + row * 0.4
      balls.push({ id: RACK_ORDER[ri++], x: spotX + ox, y: footSpotY + oy,
                   vx: 0, vy: 0, r: ballR, spin: 0 })
    }
  }
  // Cue ball at head spot, aiming at the apex
  balls.push({ id: 0, x: spotX, y: headSpotY, vx: 0, vy: 0, r: ballR, spin: 0 })
  return balls
}

function buildState(W: number, H: number): PoolState {
  const L = computeLayout(W, H)
  return {
    w: W, h: H,
    balls:   createBalls(W, H),
    potted:  [],
    railW:    L.railW, ballR:    L.ballR,
    playX1:   L.playX1, playX2:   L.playX2,
    playY1:   L.playY1, playY2:   L.playY2,
    pockets:  L.pockets,
    spotX:        L.spotX,
    headSpotY:    L.headSpotY,
    footSpotY:    L.footSpotY,
    centreSpotY:  L.centreSpotY,
    headStringY:  L.headStringY,
    aimAngle:  Math.PI / 2,   // point down toward rack
    aimPower:  0.55,
    aimDragging: false, powerDragging: false,
    powerTouchStartY: 0, powerAtDragStart: 0,
    phase:    'aiming',
    turn:     1,
    isBreak:  true,
    tableOpen: true,
    p1Group:  null, p2Group: null,
    pottedThisTurn:   [],
    cuePottedThisTurn: false,
    firstBallHitId:   null,
    turnChangeTimer:  0,
    groupOverlayTimer: 0,
  }
}

// ─── Physics helpers (prompt 1, unchanged except resolveBallPair returns bool) ─
function capSpeed(b: Ball) {
  const spd2 = b.vx * b.vx + b.vy * b.vy
  if (spd2 > MAX_SPEED * MAX_SPEED) {
    const s = MAX_SPEED / Math.sqrt(spd2)
    b.vx *= s; b.vy *= s
  }
}

function nearAnyPocket(b: Ball, pockets: Pocket[]): boolean {
  const margin = b.r * 2.0
  for (const p of pockets) {
    const dx = b.x - p.x, dy = b.y - p.y
    if (dx * dx + dy * dy < margin * margin) return true
  }
  return false
}

function resolveWall(b: Ball, s: PoolState) {
  if (nearAnyPocket(b, s.pockets)) return
  if (b.x - b.r < s.playX1) { b.x = s.playX1 + b.r; b.vx = Math.abs(b.vx) * CUSHION_DAMPEN }
  else if (b.x + b.r > s.playX2) { b.x = s.playX2 - b.r; b.vx = -Math.abs(b.vx) * CUSHION_DAMPEN }
  if (b.y - b.r < s.playY1) { b.y = s.playY1 + b.r; b.vy = Math.abs(b.vy) * CUSHION_DAMPEN }
  else if (b.y + b.r > s.playY2) { b.y = s.playY2 - b.r; b.vy = -Math.abs(b.vy) * CUSHION_DAMPEN }
}

/** Returns true if a collision was resolved */
function resolveBallPair(a: Ball, b: Ball): boolean {
  const dx = b.x - a.x, dy = b.y - a.y
  const dist2 = dx * dx + dy * dy
  const minD  = a.r + b.r
  if (dist2 >= minD * minD || dist2 < 0.0001) return false
  const dist = Math.sqrt(dist2)
  const nx = dx / dist, ny = dy / dist
  const overlap = (minD - dist) / 2
  a.x -= nx * overlap; a.y -= ny * overlap
  b.x += nx * overlap; b.y += ny * overlap
  const avn = a.vx * nx + a.vy * ny
  const bvn = b.vx * nx + b.vy * ny
  if (avn - bvn <= 0) return true   // already separating (still a hit)
  a.vx += (bvn - avn) * nx; a.vy += (bvn - avn) * ny
  b.vx += (avn - bvn) * nx; b.vy += (avn - bvn) * ny
  capSpeed(a); capSpeed(b)
  return true
}

function updatePhysics(s: PoolState) {
  for (let sub = 0; sub < SUBSTEPS; sub++) {
    for (const b of s.balls) {
      b.x += b.vx / SUBSTEPS
      b.y += b.vy / SUBSTEPS
    }
    // Pockets
    const toRemove: number[] = []
    for (const b of s.balls) {
      for (const p of s.pockets) {
        const dx = b.x - p.x, dy = b.y - p.y
        if (dx * dx + dy * dy < p.r * p.r) { toRemove.push(b.id); break }
      }
    }
    if (toRemove.length) {
      for (const id of toRemove) {
        s.pottedThisTurn.push(id)
        s.potted.push(id)
        if (id === 0) s.cuePottedThisTurn = true
      }
      s.balls = s.balls.filter(b => !toRemove.includes(b.id))
    }
    // Walls
    for (const b of s.balls) resolveWall(b, s)
    // Ball–ball collisions (track first ball cue hits)
    const n = s.balls.length
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const hit = resolveBallPair(s.balls[i], s.balls[j])
        if (hit && s.firstBallHitId === null) {
          const ai = s.balls[i], bi = s.balls[j]
          if (ai.id === 0) s.firstBallHitId = bi.id
          else if (bi.id === 0) s.firstBallHitId = ai.id
        }
      }
    }
  }
  // Friction + stop
  for (const b of s.balls) {
    b.vx *= FRICTION; b.vy *= FRICTION
    if (b.vx * b.vx + b.vy * b.vy < STOP_SPEED * STOP_SPEED) { b.vx = 0; b.vy = 0 }
  }
}

function allStopped(s: PoolState): boolean {
  if (s.balls.length === 0) return true
  return s.balls.every(b => b.vx === 0 && b.vy === 0)
}

// ─── Game logic ───────────────────────────────────────────────────────────────
function respawnCue(s: PoolState) {
  // TODO prompt 3: ball-in-hand — player places cue anywhere behind head string
  s.balls = s.balls.filter(b => b.id !== 0)
  s.potted = s.potted.filter(id => id !== 0)
  s.balls.push({ id: 0, x: s.spotX, y: s.headSpotY, vx: 0, vy: 0, r: s.ballR, spin: 0 })
}

function passTurn(s: PoolState) {
  s.turn = s.turn === 1 ? 2 : 1
  s.turnChangeTimer = TURN_CHANGE_FRAMES
  s.phase = 'turnChange'
}

function countBallsLeft(s: PoolState, group: BallGroup): number {
  const ids = group === 'solids' ? [1,2,3,4,5,6,7] : [9,10,11,12,13,14,15]
  return ids.filter(id => s.balls.some(b => b.id === id)).length
}

function resolveTurn(s: PoolState, trigger: () => void) {
  // TODO prompt 3: full foul detection (wrong ball first, no-rail, etc.)
  const pottedNonCue = s.pottedThisTurn.filter(id => id !== 0 && id !== 8)

  // Scratch
  if (s.cuePottedThisTurn) {
    respawnCue(s)
    passTurn(s)
    trigger()
    return
  }

  // Break shot — always pass turn (prompt 3 will handle "continue if potted on break")
  if (s.isBreak) {
    s.isBreak = false
    s.tableOpen = true   // table stays open after break regardless
    passTurn(s)
    trigger()
    return
  }

  // Group assignment (first non-cue, non-8 ball potted after break)
  if (s.tableOpen && pottedNonCue.length > 0) {
    const firstId = pottedNonCue[0]
    const group: BallGroup = (firstId >= 1 && firstId <= 7) ? 'solids' : 'stripes'
    if (s.turn === 1) {
      s.p1Group = group
      s.p2Group = group === 'solids' ? 'stripes' : 'solids'
    } else {
      s.p2Group = group
      s.p1Group = group === 'solids' ? 'stripes' : 'solids'
    }
    s.tableOpen = false
    s.groupOverlayTimer = GROUP_OVERLAY_FRAMES
  }

  // Continue or pass
  const myGroup = s.turn === 1 ? s.p1Group : s.p2Group
  const ownBallPotted = pottedNonCue.some(id => {
    if (s.tableOpen) return true          // open table: any ball = continue
    if (!myGroup) return false
    return myGroup === 'solids' ? (id >= 1 && id <= 7) : (id >= 9 && id <= 15)
  })

  if (ownBallPotted) {
    s.phase = 'aiming'
    trigger()
  } else {
    passTurn(s)
    trigger()
  }
}

// ─── Ray-cast helpers (for aim line) ─────────────────────────────────────────
function rayCushionDist(cx: number, cy: number, angle: number, s: PoolState, r: number): number {
  const dx = Math.cos(angle), dy = Math.sin(angle)
  const ts: number[] = []
  if (Math.abs(dx) > 0.001) {
    ts.push((s.playX1 + r - cx) / dx)
    ts.push((s.playX2 - r - cx) / dx)
  }
  if (Math.abs(dy) > 0.001) {
    ts.push((s.playY1 + r - cy) / dy)
    ts.push((s.playY2 - r - cy) / dy)
  }
  const valid = ts.filter(t => t > r * 0.1)
  return valid.length ? Math.min(...valid) : 800
}

function rayBallInfo(cx: number, cy: number, angle: number, balls: Ball[], cueR: number): { dist: number; ballId: number | null } {
  const dx = Math.cos(angle), dy = Math.sin(angle)
  let minDist = Infinity, hitId: number | null = null
  for (const b of balls) {
    if (b.id === 0) continue
    const ax = b.x - cx, ay = b.y - cy
    const t = ax * dx + ay * dy
    if (t < cueR) continue
    const px = cx + t * dx, py = cy + t * dy
    const d2 = (px - b.x) ** 2 + (py - b.y) ** 2
    const rSum = cueR + b.r
    if (d2 < rSum * rSum) {
      const d = t - Math.sqrt(Math.max(0, rSum * rSum - d2))
      if (d > 0 && d < minDist) { minDist = d; hitId = b.id }
    }
  }
  return { dist: minDist, ballId: hitId }
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function drawTable(ctx: CanvasRenderingContext2D, s: PoolState) {
  const { w: W, h: H, playX1, playX2, playY1, playY2, pockets, ballR } = s

  // Rails
  const railGrad = ctx.createLinearGradient(0, 0, W, 0)
  railGrad.addColorStop(0, '#6b3a1f'); railGrad.addColorStop(0.5, '#8B4513'); railGrad.addColorStop(1, '#6b3a1f')
  ctx.fillStyle = railGrad; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(255,200,120,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(2, 2, W-4, H-4)

  // Felt
  const feltGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H) * 0.65)
  feltGrad.addColorStop(0, '#0d6b32'); feltGrad.addColorStop(0.6, '#0a5a2a'); feltGrad.addColorStop(1, '#084a22')
  ctx.fillStyle = feltGrad; ctx.fillRect(playX1, playY1, playX2-playX1, playY2-playY1)
  ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 1
  for (let y = playY1; y < playY2; y += 4) {
    ctx.beginPath(); ctx.moveTo(playX1, y); ctx.lineTo(playX2, y); ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(30,160,70,0.4)'; ctx.lineWidth = 2
  ctx.strokeRect(playX1+1, playY1+1, playX2-playX1-2, playY2-playY1-2)

  // Spots
  const spotR = ballR * 0.12
  const dot = (x: number, y: number) => {
    ctx.beginPath(); ctx.arc(x, y, spotR, 0, Math.PI*2)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill()
  }
  dot(s.spotX, s.headSpotY); dot(s.spotX, s.centreSpotY); dot(s.spotX, s.footSpotY)

  // Head string
  ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(playX1+2, s.headStringY); ctx.lineTo(playX2-2, s.headStringY); ctx.stroke()
  ctx.setLineDash([])

  // Pockets
  for (const p of pockets) {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r+3, 0, Math.PI*2); ctx.fillStyle = '#2a1a0a'; ctx.fill()
    const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
    pg.addColorStop(0, '#111'); pg.addColorStop(1, '#000')
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fillStyle = pg; ctx.fill()
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2)
    ctx.strokeStyle = 'rgba(100,60,20,0.6)'; ctx.lineWidth = 1.5; ctx.stroke()
  }
}

function drawBall(ctx: CanvasRenderingContext2D, b: Ball) {
  const { x, y, r, id, spin } = b
  const isStripe = id >= 9 && id <= 15
  const isCue    = id === 0

  // Shadow
  ctx.beginPath(); ctx.ellipse(x+1.5, y+2.5, r*0.88, r*0.4, 0, 0, Math.PI*2)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill()

  // Ball body (clipped to circle)
  ctx.save()
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.clip()

  if (isCue) {
    const g = ctx.createRadialGradient(x-r*0.28, y-r*0.28, r*0.05, x, y, r)
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#e8edf2'); g.addColorStop(1, '#c8d0d8')
    ctx.fillStyle = g; ctx.fillRect(x-r, y-r, r*2, r*2)
    // Spin dot
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin)
    ctx.beginPath(); ctx.arc(r*0.42, 0, r*0.12, 0, Math.PI*2)
    ctx.fillStyle = 'rgba(180,30,30,0.55)'; ctx.fill()
    ctx.restore()
  } else if (isStripe) {
    ctx.fillStyle = '#f5f5f2'; ctx.fillRect(x-r, y-r, r*2, r*2)
    // Rotating stripe band
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin)
    ctx.fillStyle = BALL_COLOR[id]; ctx.fillRect(-r, -r*0.41, r*2, r*0.82)
    ctx.restore()
  } else {
    // Solid with radial gradient
    const g = ctx.createRadialGradient(x-r*0.3, y-r*0.32, r*0.04, x, y, r)
    const col = BALL_COLOR[id]
    g.addColorStop(0, lighten(col, 0.45)); g.addColorStop(0.5, col); g.addColorStop(1, darken(col, 0.3))
    ctx.fillStyle = g; ctx.fillRect(x-r, y-r, r*2, r*2)
  }

  // Gloss (fixed position — doesn't rotate)
  ctx.beginPath(); ctx.ellipse(x-r*0.28, y-r*0.3, r*0.24, r*0.14, -0.4, 0, Math.PI*2)
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill()

  ctx.restore()

  // Outline
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2)
  ctx.strokeStyle = isCue ? 'rgba(180,190,200,0.5)' : 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke()

  // Rotating number disc
  if (!isCue) {
    const discR = r * 0.40
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin)
    ctx.beginPath(); ctx.arc(0, 0, discR, 0, Math.PI*2)
    ctx.fillStyle = id === 8 ? '#1a1a1a' : '#f8f8f5'; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.5; ctx.stroke()
    const fs = Math.max(6, r*0.48)
    ctx.font = `bold ${fs}px "Arial Narrow",Arial,sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = id === 8 ? '#ffffff' : '#111111'
    ctx.fillText(String(id), 0, fs*0.04)
    ctx.restore()
  }
}

function drawAimSystem(ctx: CanvasRenderingContext2D, s: PoolState, cue: Ball) {
  const { aimAngle, aimPower } = s
  const { x: cx, y: cy, r } = cue
  const dx = Math.cos(aimAngle), dy = Math.sin(aimAngle)

  // Raycast: first ball or cushion
  const { dist: ballDist, ballId } = rayBallInfo(cx, cy, aimAngle, s.balls, r)
  const cushDist = rayCushionDist(cx, cy, aimAngle, s, r)
  const dist = Math.min(ballDist, cushDist)
  const ex = cx + dx * dist, ey = cy + dy * dist

  // Aim line (dashed)
  ctx.setLineDash([7, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([])

  // Ghost cue ball at contact point
  if (ballId !== null) {
    ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI*2)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke()
  }

  // Cue stick (drawn behind the cue ball, opposite to aim direction)
  const pullback  = r * 1.2 + aimPower * r * 2.0  // more pullback = harder hit
  const stickLen  = r * 7.5
  const tipX  = cx - dx * pullback
  const tipY  = cy - dy * pullback
  const buttX = tipX  - dx * stickLen
  const buttY = tipY  - dy * stickLen

  // Tapered cue: thin at tip, thick at butt
  const tipW  = r * 0.12, buttW = r * 0.4

  // Draw cue as a quadrilateral
  const px = -dy, py = dx  // perpendicular
  ctx.beginPath()
  ctx.moveTo(tipX  + px * tipW,  tipY  + py * tipW)
  ctx.lineTo(tipX  - px * tipW,  tipY  - py * tipW)
  ctx.lineTo(buttX - px * buttW, buttY - py * buttW)
  ctx.lineTo(buttX + px * buttW, buttY + py * buttW)
  ctx.closePath()
  const cueGrad = ctx.createLinearGradient(tipX, tipY, buttX, buttY)
  cueGrad.addColorStop(0,   '#e8c870')   // tip — light maple
  cueGrad.addColorStop(0.25,'#b07830')   // shaft
  cueGrad.addColorStop(0.75,'#6b3a18')   // butt
  cueGrad.addColorStop(1,   '#3a1a08')   // end
  ctx.fillStyle = cueGrad; ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.5; ctx.stroke()
}

function drawPowerBar(ctx: CanvasRenderingContext2D, s: PoolState, W: number, H: number, powerZoneX: number) {
  const barW  = 10
  const barH  = (s.playY2 - s.playY1) * 0.48
  const barX  = powerZoneX + (W - powerZoneX - barW) / 2
  const barY  = (H - barH) / 2

  // Track
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 5)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke()

  // Fill
  const fillH = barH * s.aimPower
  if (fillH > 0) {
    const fillY = barY + barH - fillH
    ctx.save(); ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 5); ctx.clip()
    const fg = ctx.createLinearGradient(0, fillY + fillH, 0, fillY)
    fg.addColorStop(0,   '#22c55e')
    fg.addColorStop(0.5, '#f59e0b')
    fg.addColorStop(1,   '#ef4444')
    ctx.fillStyle = fg; ctx.fillRect(barX, fillY, barW, fillH)
    ctx.restore()
  }

  // Handle knob
  const knobY = barY + barH * (1 - s.aimPower) - 4
  ctx.beginPath(); ctx.roundRect(barX - 3, knobY, barW + 6, 8, 4)
  ctx.fillStyle = '#ffffff'; ctx.fill()

  // Labels
  ctx.font = `bold ${Math.max(8, barW * 0.9)}px Arial`
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.textBaseline = 'bottom'; ctx.fillText('PWR', barX + barW/2, barY - 4)
  ctx.textBaseline = 'top'
  ctx.fillText(`${Math.round(s.aimPower * 100)}%`, barX + barW/2, barY + barH + 4)
}

function drawOverlay(ctx: CanvasRenderingContext2D, s: PoolState, W: number, H: number, c1: string, c2: string) {
  // Turn-change overlay
  if (s.phase === 'turnChange' && s.turnChangeTimer > 0) {
    const alpha = Math.min(1, s.turnChangeTimer / 20) * 0.78
    ctx.fillStyle = `rgba(0,0,0,${alpha})`; ctx.fillRect(0, 0, W, H)
    const playerColor = s.turn === 1 ? c1 : c2
    const label = s.turn === 1 ? "Player 1's Turn" : "Player 2's Turn"
    ctx.font = `bold ${Math.round(W * 0.072)}px Arial, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = playerColor
    ctx.shadowColor = playerColor; ctx.shadowBlur = 20
    ctx.fillText(label, W/2, H/2)
    ctx.shadowBlur = 0

    if (!s.tableOpen && (s.turn === 1 ? s.p1Group : s.p2Group)) {
      const grp = (s.turn === 1 ? s.p1Group : s.p2Group)!.toUpperCase()
      ctx.font = `${Math.round(W * 0.042)}px Arial`
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(grp, W/2, H/2 + W*0.09)
    }
  }

  // Group just assigned overlay
  if (s.groupOverlayTimer > 0) {
    const fade = Math.min(1, s.groupOverlayTimer / 20)
    const a1 = s.p1Group === 'solids' ? 'SOLIDS' : 'STRIPES'
    const a2 = s.p2Group === 'solids' ? 'SOLIDS' : 'STRIPES'
    ctx.fillStyle = `rgba(0,0,0,${fade * 0.7})`; ctx.fillRect(0, 0, W, H)
    const fs = Math.round(W * 0.055)
    ctx.font = `bold ${fs}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = `rgba(255,255,255,${fade})`
    ctx.fillText('Groups Assigned!', W/2, H/2 - fs*1.6)
    ctx.fillStyle = c1; ctx.fillText(`P1: ${a1}`, W/2, H/2 - fs*0.3)
    ctx.fillStyle = c2; ctx.fillText(`P2: ${a2}`, W/2, H/2 + fs*1.1)
    s.groupOverlayTimer--
  }
}

// ─── Colour helpers (unchanged from prompt 1) ─────────────────────────────────
function lighten(hex: string, t: number) { return blendToward(hex, '#ffffff', t) }
function darken(hex: string, t: number)  { return blendToward(hex, '#000000', t) }
function blendToward(hex: string, target: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.replace('#','').slice(i, i+2), 16)
  const r1=p(hex,0), g1=p(hex,2), b1=p(hex,4)
  const r2=p(target,0), g2=p(target,2), b2=p(target,4)
  const l = (a:number,b:number) => Math.round(a+(b-a)*t)
  return `rgb(${l(r1,r2)},${l(g1,g2)},${l(b1,b2)})`
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Pool2P({ p1Color = 'red', onBack }: TwoPlayerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef  = useRef<PoolState | null>(null)
  const [tick, setTick] = useState(0)
  const triggerUi = useCallback(() => setTick(t => t + 1), [])

  const handleShoot = useCallback(() => {
    const s = stateRef.current
    if (!s || s.phase !== 'aiming') return
    const cue = s.balls.find(b => b.id === 0); if (!cue) return
    const speed = Math.max(0.08, s.aimPower) * MAX_SHOT_SPEED
    cue.vx = Math.cos(s.aimAngle) * speed
    cue.vy = Math.sin(s.aimAngle) * speed
    s.phase = 'shooting'
    s.pottedThisTurn = []
    s.cuePottedThisTurn = false
    s.firstBallHitId = null
    triggerUi()
  }, [triggerUi])

  const c1 = p1Color === 'red' ? '#ef4444' : '#3b82f6'
  const c2 = p1Color === 'red' ? '#3b82f6' : '#ef4444'

  // Read current game state for header (updated via triggerUi)
  const gs = stateRef.current
  const phase    = gs?.phase    ?? 'aiming'
  const turn     = gs?.turn     ?? 1
  const p1Group  = gs?.p1Group  ?? null
  const p2Group  = gs?.p2Group  ?? null
  const tableOpen = gs?.tableOpen ?? true
  const isBreak  = gs?.isBreak  ?? true
  const p1Left   = gs && p1Group ? countBallsLeft(gs, p1Group) : 7
  const p2Left   = gs && p2Group ? countBallsLeft(gs, p2Group) : 7
  const curColor = turn === 1 ? c1 : c2

  // Suppress unused tick read (used only to force re-renders)
  void tick

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return

    let rafId = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evL: { ev: string; fn: any; opts?: AddEventListenerOptions }[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addEv = (ev: string, fn: any, opts?: AddEventListenerOptions) => {
      canvas.addEventListener(ev, fn, opts); evL.push({ ev, fn, opts })
    }
    const cleanup = () => {
      cancelAnimationFrame(rafId)
      evL.forEach(({ ev, fn, opts }) => canvas.removeEventListener(ev, fn, opts))
      evL.length = 0
    }

    const initAndRun = () => {
      cleanup()
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 50 || rect.height < 100) { rafId = requestAnimationFrame(initAndRun); return }
      const dpr = window.devicePixelRatio || 1
      canvas.width  = rect.width  * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      const W = rect.width, H = rect.height

      stateRef.current = buildState(W, H)
      triggerUi()

      // Power bar x threshold (right 20% of canvas = power zone)
      const powerZoneX = W * 0.80

      // ── Touch handlers ──────────────────────────────────────────────────────
      const onTouchStart = (e: TouchEvent) => {
        e.preventDefault()
        const s = stateRef.current; if (!s || s.phase !== 'aiming') return
        const t = e.changedTouches[0]
        const tx = t.clientX - rect.left, ty = t.clientY - rect.top
        if (tx > powerZoneX) {
          s.powerDragging = true
          s.powerTouchStartY = ty; s.powerAtDragStart = s.aimPower
        } else {
          s.aimDragging = true
          const cue = s.balls.find(b => b.id === 0)
          if (cue) s.aimAngle = Math.atan2(ty - cue.y, tx - cue.x)
        }
      }
      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault()
        const s = stateRef.current; if (!s || s.phase !== 'aiming') return
        const t = e.changedTouches[0]
        const tx = t.clientX - rect.left, ty = t.clientY - rect.top
        if (s.powerDragging) {
          const dy = (s.powerTouchStartY - ty) / (H * 0.5)
          s.aimPower = Math.max(0, Math.min(1, s.powerAtDragStart + dy))
        } else if (s.aimDragging) {
          const cue = s.balls.find(b => b.id === 0)
          if (cue) s.aimAngle = Math.atan2(ty - cue.y, tx - cue.x)
        }
      }
      const onTouchEnd = (e: TouchEvent) => {
        e.preventDefault()
        const s = stateRef.current; if (!s) return
        s.aimDragging = false; s.powerDragging = false
      }
      addEv('touchstart', onTouchStart, { passive: false })
      addEv('touchmove',  onTouchMove,  { passive: false })
      addEv('touchend',   onTouchEnd,   { passive: false })

      // ── Mouse handlers (desktop) ────────────────────────────────────────────
      let mouseDown = false
      const onMouseDown = (e: MouseEvent) => {
        const s = stateRef.current; if (!s || s.phase !== 'aiming') return
        mouseDown = true
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        if (mx > powerZoneX) {
          s.powerDragging = true; s.powerTouchStartY = my; s.powerAtDragStart = s.aimPower
        } else {
          s.aimDragging = true
          const cue = s.balls.find(b => b.id === 0)
          if (cue) s.aimAngle = Math.atan2(my - cue.y, mx - cue.x)
        }
      }
      const onMouseMove = (e: MouseEvent) => {
        if (!mouseDown) return
        const s = stateRef.current; if (!s || s.phase !== 'aiming') return
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        if (s.powerDragging) {
          const dy = (s.powerTouchStartY - my) / (H * 0.5)
          s.aimPower = Math.max(0, Math.min(1, s.powerAtDragStart + dy))
        } else if (s.aimDragging) {
          const cue = s.balls.find(b => b.id === 0)
          if (cue) s.aimAngle = Math.atan2(my - cue.y, mx - cue.x)
        }
      }
      const onMouseUp = () => {
        mouseDown = false
        const s = stateRef.current; if (!s) return
        s.aimDragging = false; s.powerDragging = false
      }
      addEv('mousedown', onMouseDown)
      addEv('mousemove', onMouseMove)
      addEv('mouseup',   onMouseUp)

      // ── Main loop ───────────────────────────────────────────────────────────
      const loop = () => {
        const s = stateRef.current; if (!s) return

        if (s.phase === 'shooting' || s.phase === 'resolving') {
          updatePhysics(s)
          // Visual spin: proportional to speed
          for (const b of s.balls) {
            const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
            b.spin += (spd / b.r) * 0.4
          }
          if (s.phase === 'shooting') s.phase = 'resolving'  // mark as in-flight
          if (allStopped(s)) resolveTurn(s, triggerUi)

        } else if (s.phase === 'turnChange') {
          s.turnChangeTimer--
          if (s.turnChangeTimer <= 0) { s.phase = 'aiming'; triggerUi() }

        } else if (s.phase === 'aiming') {
          // Spin decay when standing still
          for (const b of s.balls) b.spin *= 0.94
        }

        // ── Draw ──────────────────────────────────────────────────────────────
        ctx.clearRect(0, 0, W, H)
        drawTable(ctx, s)

        // Aim system (draw before balls so line appears under them)
        if (s.phase === 'aiming') {
          const cue = s.balls.find(b => b.id === 0)
          if (cue) drawAimSystem(ctx, s, cue)
        }

        for (const b of s.balls) drawBall(ctx, b)

        if (s.phase === 'aiming') drawPowerBar(ctx, s, W, H, powerZoneX)

        drawOverlay(ctx, s, W, H, c1, c2)

        rafId = requestAnimationFrame(loop)
      }
      rafId = requestAnimationFrame(loop)
    }

    let resizeTimer = 0
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer); resizeTimer = window.setTimeout(initAndRun, 150)
    })
    ro.observe(canvas)
    initAndRun()
    return () => { cleanup(); ro.disconnect(); clearTimeout(resizeTimer) }
  }, [p1Color, triggerUi])

  // Phase label
  const phaseLabel = phase === 'aiming'
    ? (isBreak ? '🎱 BREAK' : 'AIMING')
    : (phase === 'resolving' || phase === 'shooting') ? '⏳ IN MOTION'
    : 'NEXT PLAYER'

  return (
    <div className="h-full flex flex-col" style={{ background: '#2a1a0a' }}>
      {/* ── Header ── */}
      <div className="flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top)', background: 'rgba(26,14,4,0.97)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <ChevronLeft size={20} className="text-white" />
          </button>
          <span className="text-base font-bold text-white">Pool</span>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.45)' }}>
            {phaseLabel}
          </span>
          <div className="ml-auto flex items-center gap-3">
            {/* P1 info */}
            <div className="text-right">
              <div className="text-xs font-bold" style={{ color: c1 }}>P1</div>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.38)' }}>
                {tableOpen ? 'OPEN' : `${p1Group === 'solids' ? '●' : '◑'} ${p1Left}`}
              </div>
            </div>
            <div className="text-xs font-black" style={{ color: 'rgba(255,255,255,0.22)' }}>vs</div>
            {/* P2 info */}
            <div className="text-left">
              <div className="text-xs font-bold" style={{ color: c2 }}>P2</div>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.38)' }}>
                {tableOpen ? 'OPEN' : `${p2Group === 'solids' ? '●' : '◑'} ${p2Left}`}
              </div>
            </div>
          </div>
        </div>
        {/* Current turn strip */}
        <div className="px-3 pb-2">
          <span className="text-xs font-bold px-3 py-1 rounded-full"
            style={{ background: `${curColor}22`, color: curColor }}>
            {turn === 1 ? 'P1' : 'P2'}'s turn
            {!tableOpen && (turn === 1 ? p1Group : p2Group)
              ? ` · ${(turn === 1 ? p1Group : p2Group)!.toUpperCase()}`
              : tableOpen ? ' · OPEN TABLE' : ''}
          </span>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="canvas-area" style={{ position: 'relative' }}>
        <canvas ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', display: 'block' }} />

        {/* SHOOT button */}
        {phase === 'aiming' && (
          <button onClick={handleShoot} style={{
            position: 'absolute', bottom: 20, left: '38%', transform: 'translateX(-50%)',
            background: '#f5c518', color: '#111', fontWeight: 800, fontSize: 15,
            padding: '12px 28px', borderRadius: 28, border: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.65)',
            zIndex: 20, letterSpacing: '0.04em',
          }}>
            🎱 SHOOT
          </button>
        )}
      </div>
    </div>
  )
}
