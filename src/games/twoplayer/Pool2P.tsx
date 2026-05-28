import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { TwoPlayerGameProps } from './types'
import { saveGameScore, getGameScore } from '../../db'

// ─── Physics constants ────────────────────────────────────────────────────────
const SUBSTEPS       = 3
const FRICTION       = 0.9835
const STOP_SPEED     = 0.045
const MAX_SPEED      = 22
const CUSHION_DAMPEN = 0.82

// ─── Shot / timing constants ──────────────────────────────────────────────────
const MAX_SHOT_SPEED       = MAX_SPEED * 0.92
const TURN_CHANGE_FRAMES   = 90
const GROUP_OVERLAY_FRAMES = 120

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
type FoulReason =
  | 'scratch'
  | 'cue_off_table'
  | 'wrong_ball_first'
  | 'eight_ball_first_illegal'
  | 'no_rail'
  | 'no_contact'
  | 'illegal_break'

const FOUL_TEXT: Record<FoulReason, string> = {
  scratch:                  'Cue ball pocketed',
  cue_off_table:            'Cue ball left the table',
  wrong_ball_first:         'Wrong ball contacted first',
  eight_ball_first_illegal: '8-ball hit first on open table',
  no_rail:                  'No cushion contact after shot',
  no_contact:               'No contact — air ball',
  illegal_break:            'Illegal break',
}

interface Ball {
  id: number
  x: number; y: number
  vx: number; vy: number
  r: number
  spin: number
}

interface Pocket { x: number; y: number; r: number }

type GamePhase = 'aiming' | 'shooting' | 'resolving' | 'turnChange' | 'ballInHand' | 'gameOver'
type BallGroup = 'solids' | 'stripes'

interface PoolState {
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
  aimAngle: number; aimPower: number
  aimDragging: boolean; powerDragging: boolean
  powerTouchStartY: number; powerAtDragStart: number

  // Game state
  phase: GamePhase
  turn: 1 | 2
  isBreak: boolean
  tableOpen: boolean
  p1Group: BallGroup | null; p2Group: BallGroup | null
  pottedThisTurn: number[]
  cuePottedThisTurn: boolean
  firstBallHitId: number | null
  wasOnEightAtShotStart: boolean
  turnChangeTimer: number
  groupOverlayTimer: number

  // Shot tracking (prompt 3)
  railContactAfterHit: boolean
  cushionsHitOnBreak: number[]

  // Foul (prompt 3)
  foulReason: FoulReason | null
  pendingBallInHand: boolean
  ballInHandRestricted: boolean
  ballInHandDragging: boolean

  // Game over (prompt 3)
  gameOver: boolean
  winner: 1 | 2 | null
  gameOverMsg: string
}

// ─── Layout ───────────────────────────────────────────────────────────────────
function computeLayout(W: number, H: number) {
  const railW = Math.round(Math.max(14, Math.min(22, W * 0.054)))
  const ballR  = Math.max(9, Math.min(16, (W - railW * 2) / 22))
  const playX1 = railW, playX2 = W - railW
  const playY1 = railW, playY2 = H - railW
  const playW  = playX2 - playX1, playH = playY2 - playY1
  const spotX  = playX1 + playW / 2
  const midY   = playY1 + playH / 2
  const headStringY = playY1 + playH * 0.25
  const headSpotY   = headStringY
  const centreSpotY = midY
  const footSpotY   = playY1 + playH * 0.70
  const pocketR = ballR * 1.38
  const pockets: Pocket[] = [
    { x: playX1, y: playY1, r: pocketR }, { x: playX2, y: playY1, r: pocketR },
    { x: playX1, y: midY,   r: pocketR }, { x: playX2, y: midY,   r: pocketR },
    { x: playX1, y: playY2, r: pocketR }, { x: playX2, y: playY2, r: pocketR },
  ]
  return { railW, ballR, playX1, playX2, playY1, playY2, spotX, midY,
           headStringY, headSpotY, centreSpotY, footSpotY, pockets }
}

const RACK_ORDER = [1, 2, 9, 3, 8, 10, 4, 11, 5, 12, 6, 13, 7, 14, 15]

function createBalls(W: number, H: number): Ball[] {
  const L = computeLayout(W, H)
  const { ballR, spotX, footSpotY, headSpotY } = L
  const sep = ballR * 2.04
  const balls: Ball[] = []
  let ri = 0
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const ox = (col - row / 2) * sep
      const oy = row * Math.sqrt(3) * ballR + row * 0.4
      balls.push({ id: RACK_ORDER[ri++], x: spotX + ox, y: footSpotY + oy,
                   vx: 0, vy: 0, r: ballR, spin: 0 })
    }
  }
  balls.push({ id: 0, x: spotX, y: headSpotY, vx: 0, vy: 0, r: ballR, spin: 0 })
  return balls
}

function buildState(W: number, H: number): PoolState {
  const L = computeLayout(W, H)
  return {
    w: W, h: H,
    balls: createBalls(W, H), potted: [],
    railW: L.railW, ballR: L.ballR,
    playX1: L.playX1, playX2: L.playX2, playY1: L.playY1, playY2: L.playY2,
    pockets: L.pockets, spotX: L.spotX,
    headSpotY: L.headSpotY, footSpotY: L.footSpotY,
    centreSpotY: L.centreSpotY, headStringY: L.headStringY,
    aimAngle: Math.PI / 2, aimPower: 0.55,
    aimDragging: false, powerDragging: false, powerTouchStartY: 0, powerAtDragStart: 0,
    phase: 'aiming', turn: 1, isBreak: true, tableOpen: true,
    p1Group: null, p2Group: null,
    pottedThisTurn: [], cuePottedThisTurn: false,
    firstBallHitId: null, wasOnEightAtShotStart: false,
    turnChangeTimer: 0, groupOverlayTimer: 0,
    railContactAfterHit: false, cushionsHitOnBreak: [],
    foulReason: null, pendingBallInHand: false,
    ballInHandRestricted: false, ballInHandDragging: false,
    gameOver: false, winner: null, gameOverMsg: '',
  }
}

// ─── Physics ──────────────────────────────────────────────────────────────────
function capSpeed(b: Ball) {
  const spd2 = b.vx * b.vx + b.vy * b.vy
  if (spd2 > MAX_SPEED * MAX_SPEED) {
    const s = MAX_SPEED / Math.sqrt(spd2); b.vx *= s; b.vy *= s
  }
}

function nearAnyPocket(b: Ball, pockets: Pocket[]): boolean {
  const m = b.r * 2.0
  for (const p of pockets) {
    const dx = b.x - p.x, dy = b.y - p.y
    if (dx*dx + dy*dy < m*m) return true
  }
  return false
}

function resolveWall(b: Ball, s: PoolState) {
  if (nearAnyPocket(b, s.pockets)) return
  let hit = false
  if (b.x - b.r < s.playX1)      { b.x = s.playX1 + b.r; b.vx =  Math.abs(b.vx) * CUSHION_DAMPEN; hit = true }
  else if (b.x + b.r > s.playX2) { b.x = s.playX2 - b.r; b.vx = -Math.abs(b.vx) * CUSHION_DAMPEN; hit = true }
  if (b.y - b.r < s.playY1)      { b.y = s.playY1 + b.r; b.vy =  Math.abs(b.vy) * CUSHION_DAMPEN; hit = true }
  else if (b.y + b.r > s.playY2) { b.y = s.playY2 - b.r; b.vy = -Math.abs(b.vy) * CUSHION_DAMPEN; hit = true }
  if (hit) {
    if (s.firstBallHitId !== null) s.railContactAfterHit = true
    if (s.isBreak && !s.cushionsHitOnBreak.includes(b.id)) s.cushionsHitOnBreak.push(b.id)
  }
}

function resolveBallPair(a: Ball, b: Ball): boolean {
  const dx = b.x - a.x, dy = b.y - a.y
  const dist2 = dx*dx + dy*dy
  const minD  = a.r + b.r
  if (dist2 >= minD*minD || dist2 < 0.0001) return false
  const dist  = Math.sqrt(dist2)
  const nx = dx/dist, ny = dy/dist
  const overlap = (minD - dist) / 2
  a.x -= nx*overlap; a.y -= ny*overlap
  b.x += nx*overlap; b.y += ny*overlap
  const avn = a.vx*nx + a.vy*ny
  const bvn = b.vx*nx + b.vy*ny
  if (avn - bvn <= 0) return true
  a.vx += (bvn-avn)*nx; a.vy += (bvn-avn)*ny
  b.vx += (avn-bvn)*nx; b.vy += (avn-bvn)*ny
  capSpeed(a); capSpeed(b)
  return true
}

function updatePhysics(s: PoolState) {
  for (let sub = 0; sub < SUBSTEPS; sub++) {
    for (const b of s.balls) { b.x += b.vx/SUBSTEPS; b.y += b.vy/SUBSTEPS }
    const toRemove: number[] = []
    for (const b of s.balls)
      for (const p of s.pockets) {
        const dx = b.x-p.x, dy = b.y-p.y
        if (dx*dx+dy*dy < p.r*p.r) { toRemove.push(b.id); break }
      }
    if (toRemove.length) {
      for (const id of toRemove) {
        s.pottedThisTurn.push(id); s.potted.push(id)
        if (id === 0) s.cuePottedThisTurn = true
      }
      s.balls = s.balls.filter(b => !toRemove.includes(b.id))
    }
    for (const b of s.balls) resolveWall(b, s)
    const n = s.balls.length
    for (let i = 0; i < n; i++)
      for (let j = i+1; j < n; j++) {
        const hit = resolveBallPair(s.balls[i], s.balls[j])
        if (hit && s.firstBallHitId === null) {
          const ai = s.balls[i], bi = s.balls[j]
          if (ai.id === 0) s.firstBallHitId = bi.id
          else if (bi.id === 0) s.firstBallHitId = ai.id
        }
      }
  }
  for (const b of s.balls) {
    b.vx *= FRICTION; b.vy *= FRICTION
    if (b.vx*b.vx + b.vy*b.vy < STOP_SPEED*STOP_SPEED) { b.vx = 0; b.vy = 0 }
  }
}

function allStopped(s: PoolState): boolean {
  return s.balls.every(b => b.vx === 0 && b.vy === 0)
}

// ─── Game logic ───────────────────────────────────────────────────────────────
function countBallsLeft(s: PoolState, group: BallGroup): number {
  const ids = group === 'solids' ? [1,2,3,4,5,6,7] : [9,10,11,12,13,14,15]
  return ids.filter(id => s.balls.some(b => b.id === id)).length
}

function isShooterBall(s: PoolState, id: number): boolean {
  const g = s.turn === 1 ? s.p1Group : s.p2Group
  if (!g) return false
  return g === 'solids' ? (id >= 1 && id <= 7) : (id >= 9 && id <= 15)
}

function isValidCuePlacement(s: PoolState, x: number, y: number): boolean {
  const r = s.ballR
  if (x - r < s.playX1 || x + r > s.playX2) return false
  if (y - r < s.playY1 || y + r > s.playY2) return false
  if (s.ballInHandRestricted && y > s.headStringY - r) return false
  for (const b of s.balls) {
    if (b.id === 0) continue
    const dx = b.x - x, dy = b.y - y, minD = b.r + r
    if (dx*dx + dy*dy < minD*minD) return false
  }
  return true
}

function moveCueBallInHand(s: PoolState, x: number, y: number) {
  let cue = s.balls.find(b => b.id === 0)
  if (!cue) {
    cue = { id: 0, x: s.spotX, y: s.headSpotY, vx: 0, vy: 0, r: s.ballR, spin: 0 }
    s.balls.push(cue)
  }
  cue.x = Math.max(s.playX1 + s.ballR, Math.min(s.playX2 - s.ballR, x))
  cue.y = Math.max(s.playY1 + s.ballR, Math.min(s.playY2 - s.ballR, y))
  if (s.ballInHandRestricted) cue.y = Math.min(cue.y, s.headStringY - s.ballR)
}

function respawnCue(s: PoolState) {
  s.balls  = s.balls.filter(b => b.id !== 0)
  s.potted = s.potted.filter(id => id !== 0)
  // Place in kitchen centre as starting drag position
  const y = s.ballInHandRestricted
    ? (s.playY1 + s.headStringY) / 2
    : s.centreSpotY
  s.balls.push({ id: 0, x: s.spotX, y, vx: 0, vy: 0, r: s.ballR, spin: 0 })
}

function passTurn(s: PoolState) {
  s.turn = s.turn === 1 ? 2 : 1
  s.turnChangeTimer = TURN_CHANGE_FRAMES
  s.phase = 'turnChange'
}

function assignGroups(s: PoolState, pottedNonCue: number[]) {
  if (!s.tableOpen || pottedNonCue.length === 0) return
  const firstId = pottedNonCue[0]
  const g: BallGroup = (firstId >= 1 && firstId <= 7) ? 'solids' : 'stripes'
  if (s.turn === 1) { s.p1Group = g; s.p2Group = g === 'solids' ? 'stripes' : 'solids' }
  else              { s.p2Group = g; s.p1Group = g === 'solids' ? 'stripes' : 'solids' }
  s.tableOpen = false
  s.groupOverlayTimer = GROUP_OVERLAY_FRAMES
}

function resetToBreak(s: PoolState) {
  s.balls = createBalls(s.w, s.h)
  s.potted = []
  s.turn = (s.turn === 1 ? 2 : 1) as 1 | 2
  s.isBreak = true; s.tableOpen = true
  s.p1Group = null; s.p2Group = null
  s.pottedThisTurn = []; s.cuePottedThisTurn = false
  s.firstBallHitId = null; s.wasOnEightAtShotStart = false
  s.railContactAfterHit = false; s.cushionsHitOnBreak = []
  s.foulReason = null; s.pendingBallInHand = false
  s.ballInHandRestricted = false; s.ballInHandDragging = false
  s.gameOver = false; s.winner = null; s.gameOverMsg = ''
  s.turnChangeTimer = TURN_CHANGE_FRAMES
  s.phase = 'turnChange'   // brief "P? re-breaks" overlay before handing over
  s.groupOverlayTimer = 0
  s.aimAngle = Math.PI / 2; s.aimPower = 0.55
  s.aimDragging = false; s.powerDragging = false
}

function detectFoul(
  s: PoolState,
  firstHit: number | null,
  onEight: boolean,
  shooterGroup: BallGroup | null,
  nonCuePotted: number[],
): FoulReason | null {
  if (s.cuePottedThisTurn) return 'scratch'
  if (firstHit === null) return 'no_contact'
  if (s.tableOpen) {
    if (firstHit === 8) return 'eight_ball_first_illegal'
  } else if (shooterGroup !== null) {
    if (onEight) {
      if (firstHit !== 8) return 'wrong_ball_first'
    } else {
      const hitIsOwn = shooterGroup === 'solids'
        ? (firstHit >= 1 && firstHit <= 7)
        : (firstHit >= 9 && firstHit <= 15)
      if (!hitIsOwn) return 'wrong_ball_first'
    }
  }
  // No rail AND nothing pocketed → foul
  const eightPottedNow = s.pottedThisTurn.includes(8)
  if (!s.railContactAfterHit && nonCuePotted.length === 0 && !eightPottedNow) return 'no_rail'
  return null
}

function endGame(
  s: PoolState, winner: 'p1' | 'p2', msg: string,
  trigger: () => void, onGameEnd?: (w: 'p1'|'p2'|'draw') => void,
) {
  s.phase = 'gameOver'; s.gameOver = true
  s.winner = winner === 'p1' ? 1 : 2; s.gameOverMsg = msg
  trigger(); onGameEnd?.(winner)
}

function resolveTurn(
  s: PoolState, trigger: () => void,
  onGameEnd?: (w: 'p1'|'p2'|'draw') => void,
) {
  const pottedIds    = [...s.pottedThisTurn]
  const eightPotted  = pottedIds.includes(8)
  const nonCuePotted = pottedIds.filter(id => id !== 0 && id !== 8)
  const firstHit     = s.firstBallHitId
  const shooterGroup = s.turn === 1 ? s.p1Group : s.p2Group
  const onEight      = s.wasOnEightAtShotStart
  const sLabel       = `P${s.turn}`, oLabel = `P${s.turn === 1 ? 2 : 1}`

  // ── BREAK ───────────────────────────────────────────────────────────────────
  if (s.isBreak) {
    s.isBreak = false
    if (eightPotted) { resetToBreak(s); trigger(); return }
    if (s.cuePottedThisTurn) {
      respawnCue(s)
      s.foulReason = 'scratch'; s.pendingBallInHand = true; s.ballInHandRestricted = true
      passTurn(s); trigger(); return
    }
    const legal = s.cushionsHitOnBreak.length >= 4 || nonCuePotted.length > 0
    if (!legal) {
      s.foulReason = 'illegal_break'; s.pendingBallInHand = true; s.ballInHandRestricted = true
      passTurn(s); trigger(); return
    }
    if (nonCuePotted.length > 0) { s.phase = 'aiming'; trigger(); return }
    passTurn(s); trigger(); return
  }

  // ── 8-BALL pocketed ─────────────────────────────────────────────────────────
  if (eightPotted) {
    if (s.cuePottedThisTurn) {
      endGame(s, s.turn === 1 ? 'p2' : 'p1',
        `${sLabel} scratched on the 8-ball — ${oLabel} wins!`, trigger, onGameEnd); return
    }
    const foulOnEight = detectFoul(s, firstHit, onEight, shooterGroup, nonCuePotted)
    if (foulOnEight !== null) {
      endGame(s, s.turn === 1 ? 'p2' : 'p1',
        `${sLabel} fouled on the 8-ball — ${oLabel} wins!`, trigger, onGameEnd); return
    }
    if (!onEight) {
      endGame(s, s.turn === 1 ? 'p2' : 'p1',
        `${sLabel} pocketed the 8-ball early — ${oLabel} wins!`, trigger, onGameEnd); return
    }
    endGame(s, s.turn === 1 ? 'p1' : 'p2',
      `${sLabel} cleared ${shooterGroup ?? 'their group'} and sank the 8-ball!`, trigger, onGameEnd)
    return
  }

  // ── FOUL detection (normal shot) ─────────────────────────────────────────────
  const foul = detectFoul(s, firstHit, onEight, shooterGroup, nonCuePotted)
  if (foul !== null) {
    if (s.tableOpen && nonCuePotted.length > 0) assignGroups(s, nonCuePotted)
    if (s.cuePottedThisTurn) respawnCue(s)
    s.foulReason = foul; s.pendingBallInHand = true; s.ballInHandRestricted = false
    passTurn(s); trigger(); return
  }

  // ── No foul — normal ────────────────────────────────────────────────────────
  if (s.tableOpen && nonCuePotted.length > 0) assignGroups(s, nonCuePotted)
  const myBallPotted = nonCuePotted.some(id => isShooterBall(s, id))
  if (myBallPotted) { s.phase = 'aiming'; trigger() }
  else              { passTurn(s); trigger() }
}

// ─── Ray-cast helpers ─────────────────────────────────────────────────────────
function rayCushionDist(cx: number, cy: number, angle: number, s: PoolState, r: number): number {
  const dx = Math.cos(angle), dy = Math.sin(angle)
  const ts: number[] = []
  if (Math.abs(dx) > 0.001) { ts.push((s.playX1+r-cx)/dx); ts.push((s.playX2-r-cx)/dx) }
  if (Math.abs(dy) > 0.001) { ts.push((s.playY1+r-cy)/dy); ts.push((s.playY2-r-cy)/dy) }
  const valid = ts.filter(t => t > r*0.1)
  return valid.length ? Math.min(...valid) : 800
}

function rayBallInfo(cx: number, cy: number, angle: number, balls: Ball[], cueR: number) {
  const dx = Math.cos(angle), dy = Math.sin(angle)
  let minDist = Infinity, hitId: number | null = null
  for (const b of balls) {
    if (b.id === 0) continue
    const ax = b.x-cx, ay = b.y-cy
    const t = ax*dx + ay*dy; if (t < cueR) continue
    const px = cx+t*dx, py = cy+t*dy
    const d2 = (px-b.x)**2 + (py-b.y)**2
    const rSum = cueR+b.r
    if (d2 < rSum*rSum) {
      const d = t - Math.sqrt(Math.max(0, rSum*rSum - d2))
      if (d > 0 && d < minDist) { minDist = d; hitId = b.id }
    }
  }
  return { dist: minDist, ballId: hitId }
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function drawTable(ctx: CanvasRenderingContext2D, s: PoolState) {
  const { w: W, h: H, playX1, playX2, playY1, playY2, pockets, ballR } = s
  const railGrad = ctx.createLinearGradient(0,0,W,0)
  railGrad.addColorStop(0,'#6b3a1f'); railGrad.addColorStop(0.5,'#8B4513'); railGrad.addColorStop(1,'#6b3a1f')
  ctx.fillStyle = railGrad; ctx.fillRect(0,0,W,H)
  ctx.strokeStyle = 'rgba(255,200,120,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(2,2,W-4,H-4)

  const feltGrad = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*0.65)
  feltGrad.addColorStop(0,'#0d6b32'); feltGrad.addColorStop(0.6,'#0a5a2a'); feltGrad.addColorStop(1,'#084a22')
  ctx.fillStyle = feltGrad; ctx.fillRect(playX1,playY1,playX2-playX1,playY2-playY1)
  ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 1
  for (let y = playY1; y < playY2; y += 4) {
    ctx.beginPath(); ctx.moveTo(playX1,y); ctx.lineTo(playX2,y); ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(30,160,70,0.4)'; ctx.lineWidth = 2
  ctx.strokeRect(playX1+1,playY1+1,playX2-playX1-2,playY2-playY1-2)

  const spotR = ballR*0.12
  const dot = (x: number, y: number) => {
    ctx.beginPath(); ctx.arc(x,y,spotR,0,Math.PI*2)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill()
  }
  dot(s.spotX,s.headSpotY); dot(s.spotX,s.centreSpotY); dot(s.spotX,s.footSpotY)

  ctx.setLineDash([4,5]); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(playX1+2,s.headStringY); ctx.lineTo(playX2-2,s.headStringY); ctx.stroke()
  ctx.setLineDash([])

  for (const p of pockets) {
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r+3,0,Math.PI*2); ctx.fillStyle='#2a1a0a'; ctx.fill()
    const pg = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r)
    pg.addColorStop(0,'#111'); pg.addColorStop(1,'#000')
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=pg; ctx.fill()
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2)
    ctx.strokeStyle='rgba(100,60,20,0.6)'; ctx.lineWidth=1.5; ctx.stroke()
  }
}

function drawKitchen(ctx: CanvasRenderingContext2D, s: PoolState) {
  ctx.fillStyle = 'rgba(255,220,50,0.07)'
  ctx.fillRect(s.playX1, s.playY1, s.playX2-s.playX1, s.headStringY-s.playY1)
  ctx.setLineDash([6,5]); ctx.strokeStyle = 'rgba(255,220,50,0.45)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(s.playX1+2,s.headStringY); ctx.lineTo(s.playX2-2,s.headStringY); ctx.stroke()
  ctx.setLineDash([])
  ctx.font = `bold ${Math.max(9,s.ballR*0.7)}px Arial`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255,220,50,0.45)'
  ctx.fillText('KITCHEN', s.spotX, (s.playY1+s.headStringY)/2)
}

function drawBall(ctx: CanvasRenderingContext2D, b: Ball) {
  const { x, y, r, id, spin } = b
  const isStripe = id >= 9 && id <= 15
  const isCue    = id === 0
  ctx.beginPath(); ctx.ellipse(x+1.5,y+2.5,r*0.88,r*0.4,0,0,Math.PI*2)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.clip()
  if (isCue) {
    const g = ctx.createRadialGradient(x-r*0.28,y-r*0.28,r*0.05,x,y,r)
    g.addColorStop(0,'#ffffff'); g.addColorStop(0.7,'#e8edf2'); g.addColorStop(1,'#c8d0d8')
    ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2)
    ctx.save(); ctx.translate(x,y); ctx.rotate(spin)
    ctx.beginPath(); ctx.arc(r*0.42,0,r*0.12,0,Math.PI*2)
    ctx.fillStyle='rgba(180,30,30,0.55)'; ctx.fill(); ctx.restore()
  } else if (isStripe) {
    ctx.fillStyle='#f5f5f2'; ctx.fillRect(x-r,y-r,r*2,r*2)
    ctx.save(); ctx.translate(x,y); ctx.rotate(spin)
    ctx.fillStyle=BALL_COLOR[id]; ctx.fillRect(-r,-r*0.41,r*2,r*0.82); ctx.restore()
  } else {
    const g = ctx.createRadialGradient(x-r*0.3,y-r*0.32,r*0.04,x,y,r)
    const col = BALL_COLOR[id]
    g.addColorStop(0,lighten(col,0.45)); g.addColorStop(0.5,col); g.addColorStop(1,darken(col,0.3))
    ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2)
  }
  ctx.beginPath(); ctx.ellipse(x-r*0.28,y-r*0.3,r*0.24,r*0.14,-0.4,0,Math.PI*2)
  ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.fill()
  ctx.restore()
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2)
  ctx.strokeStyle=isCue?'rgba(180,190,200,0.5)':'rgba(0,0,0,0.35)'; ctx.lineWidth=0.8; ctx.stroke()
  if (!isCue) {
    const discR = r*0.40
    ctx.save(); ctx.translate(x,y); ctx.rotate(spin)
    ctx.beginPath(); ctx.arc(0,0,discR,0,Math.PI*2)
    ctx.fillStyle=id===8?'#1a1a1a':'#f8f8f5'; ctx.fill()
    ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.lineWidth=0.5; ctx.stroke()
    const fs = Math.max(6,r*0.48)
    ctx.font=`bold ${fs}px "Arial Narrow",Arial,sans-serif`
    ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillStyle=id===8?'#ffffff':'#111111'
    ctx.fillText(String(id),0,fs*0.04); ctx.restore()
  }
}

function drawAimSystem(ctx: CanvasRenderingContext2D, s: PoolState, cue: Ball) {
  const { aimAngle, aimPower } = s
  const { x: cx, y: cy, r } = cue
  const dx = Math.cos(aimAngle), dy = Math.sin(aimAngle)
  const { dist: ballDist, ballId } = rayBallInfo(cx,cy,aimAngle,s.balls,r)
  const cushDist = rayCushionDist(cx,cy,aimAngle,s,r)
  const dist = Math.min(ballDist,cushDist)
  const ex = cx+dx*dist, ey = cy+dy*dist
  ctx.setLineDash([7,6]); ctx.strokeStyle='rgba(255,255,255,0.30)'; ctx.lineWidth=1.5
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey); ctx.stroke(); ctx.setLineDash([])
  if (ballId !== null) {
    ctx.beginPath(); ctx.arc(ex,ey,r,0,Math.PI*2)
    ctx.fillStyle='rgba(255,255,255,0.12)'; ctx.fill()
    ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=1; ctx.stroke()
  }
  const pullback = r*1.2 + aimPower*r*2.0
  const stickLen = r*7.5
  const tipX=cx-dx*pullback, tipY=cy-dy*pullback
  const buttX=tipX-dx*stickLen, buttY=tipY-dy*stickLen
  const tipW=r*0.12, buttW=r*0.4, px=-dy, py=dx
  ctx.beginPath()
  ctx.moveTo(tipX+px*tipW,tipY+py*tipW); ctx.lineTo(tipX-px*tipW,tipY-py*tipW)
  ctx.lineTo(buttX-px*buttW,buttY-py*buttW); ctx.lineTo(buttX+px*buttW,buttY+py*buttW)
  ctx.closePath()
  const cueGrad = ctx.createLinearGradient(tipX,tipY,buttX,buttY)
  cueGrad.addColorStop(0,'#e8c870'); cueGrad.addColorStop(0.25,'#b07830')
  cueGrad.addColorStop(0.75,'#6b3a18'); cueGrad.addColorStop(1,'#3a1a08')
  ctx.fillStyle=cueGrad; ctx.fill()
  ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=0.5; ctx.stroke()
}

function drawPowerBar(ctx: CanvasRenderingContext2D, s: PoolState, W: number, H: number, powerZoneX: number) {
  const barW=10, barH=(s.playY2-s.playY1)*0.48
  const barX=powerZoneX+(W-powerZoneX-barW)/2, barY=(H-barH)/2
  ctx.beginPath(); ctx.roundRect(barX,barY,barW,barH,5)
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fill()
  ctx.strokeStyle='rgba(255,255,255,0.18)'; ctx.lineWidth=1; ctx.stroke()
  const fillH=barH*s.aimPower
  if (fillH>0) {
    const fillY=barY+barH-fillH
    ctx.save(); ctx.beginPath(); ctx.roundRect(barX,barY,barW,barH,5); ctx.clip()
    const fg=ctx.createLinearGradient(0,fillY+fillH,0,fillY)
    fg.addColorStop(0,'#22c55e'); fg.addColorStop(0.5,'#f59e0b'); fg.addColorStop(1,'#ef4444')
    ctx.fillStyle=fg; ctx.fillRect(barX,fillY,barW,fillH); ctx.restore()
  }
  const knobY=barY+barH*(1-s.aimPower)-4
  ctx.beginPath(); ctx.roundRect(barX-3,knobY,barW+6,8,4); ctx.fillStyle='#ffffff'; ctx.fill()
  ctx.font=`bold ${Math.max(8,barW*0.9)}px Arial`
  ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,0.55)'
  ctx.textBaseline='bottom'; ctx.fillText('PWR',barX+barW/2,barY-4)
  ctx.textBaseline='top'; ctx.fillText(`${Math.round(s.aimPower*100)}%`,barX+barW/2,barY+barH+4)
}

function drawOverlay(ctx: CanvasRenderingContext2D, s: PoolState, W: number, H: number, c1: string, c2: string) {
  if (s.phase === 'turnChange' && s.turnChangeTimer > 0) {
    const alpha = Math.min(1, s.turnChangeTimer/20)*0.82
    ctx.fillStyle=`rgba(0,0,0,${alpha})`; ctx.fillRect(0,0,W,H)
    ctx.textAlign='center'; ctx.textBaseline='middle'
    const hasFoul = !!s.foulReason
    const shift = hasFoul ? W*0.04 : 0

    if (hasFoul) {
      ctx.font=`bold ${Math.round(W*0.06)}px Arial`
      ctx.fillStyle='#ef4444'; ctx.shadowColor='#ef4444'; ctx.shadowBlur=14
      ctx.fillText('⚠ FOUL', W/2, H/2-W*0.13); ctx.shadowBlur=0
      ctx.font=`${Math.round(W*0.037)}px Arial`
      ctx.fillStyle='rgba(255,160,160,0.9)'
      ctx.fillText(FOUL_TEXT[s.foulReason!], W/2, H/2-W*0.065)
    }

    const playerColor = s.turn===1 ? c1 : c2
    ctx.font=`bold ${Math.round(W*0.07)}px Arial`
    ctx.fillStyle=playerColor; ctx.shadowColor=playerColor; ctx.shadowBlur=18
    ctx.fillText(`Player ${s.turn}'s Turn`, W/2, H/2+shift); ctx.shadowBlur=0

    if (!s.tableOpen && (s.turn===1 ? s.p1Group : s.p2Group)) {
      const grp=(s.turn===1?s.p1Group:s.p2Group)!.toUpperCase()
      ctx.font=`${Math.round(W*0.04)}px Arial`; ctx.fillStyle='rgba(255,255,255,0.6)'
      ctx.fillText(grp, W/2, H/2+shift+W*0.09)
    }
    if (s.pendingBallInHand) {
      ctx.font=`${Math.round(W*0.038)}px Arial`; ctx.fillStyle='#f5c518'
      const bihtxt = s.ballInHandRestricted ? 'Ball in hand (kitchen only)' : 'Ball in hand — place anywhere'
      ctx.fillText(bihtxt, W/2, H/2+shift+W*0.16)
    }
  }

  if (s.groupOverlayTimer > 0) {
    const fade = Math.min(1, s.groupOverlayTimer/20)
    ctx.fillStyle=`rgba(0,0,0,${fade*0.7})`; ctx.fillRect(0,0,W,H)
    const fs=Math.round(W*0.055)
    ctx.font=`bold ${fs}px Arial`; ctx.textAlign='center'; ctx.textBaseline='middle'
    ctx.fillStyle=`rgba(255,255,255,${fade})`; ctx.fillText('Groups Assigned!',W/2,H/2-fs*1.6)
    ctx.fillStyle=c1; ctx.fillText(`P1: ${(s.p1Group??'').toUpperCase()}`,W/2,H/2-fs*0.3)
    ctx.fillStyle=c2; ctx.fillText(`P2: ${(s.p2Group??'').toUpperCase()}`,W/2,H/2+fs*1.1)
    s.groupOverlayTimer--
  }
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
function lighten(hex: string, t: number) { return blendToward(hex,'#ffffff',t) }
function darken(hex: string, t: number)  { return blendToward(hex,'#000000',t) }
function blendToward(hex: string, target: string, t: number): string {
  const p=(h:string,i:number)=>parseInt(h.replace('#','').slice(i,i+2),16)
  const r1=p(hex,0),g1=p(hex,2),b1=p(hex,4)
  const r2=p(target,0),g2=p(target,2),b2=p(target,4)
  const l=(a:number,b:number)=>Math.round(a+(b-a)*t)
  return `rgb(${l(r1,r2)},${l(g1,g2)},${l(b1,b2)})`
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Pool2P({ p1Color='red', onBack, onGameEnd }: TwoPlayerGameProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const stateRef     = useRef<PoolState | null>(null)
  const onGameEndRef = useRef(onGameEnd)
  const savedRef     = useRef(false)
  const [tick, setTick] = useState(0)
  const triggerUi = useCallback(() => setTick(t => t+1), [])

  useEffect(() => { onGameEndRef.current = onGameEnd }, [onGameEnd])

  // Save score when game ends
  useEffect(() => {
    const gs = stateRef.current
    if (gs?.gameOver && gs.winner && !savedRef.current) {
      savedRef.current = true
      const w = gs.winner
      getGameScore('pool_2p').then(ex => {
        const base = ex ?? { gameId:'pool_2p', bestScore:0, lastPlayed:'' }
        saveGameScore({
          gameId: 'pool_2p',
          bestScore: base.bestScore + (w===1?1:0),
          lastPlayed: new Date().toISOString(),
          extra: { ...(base.extra??{}), p2Wins: (((base.extra?.p2Wins as number)??0)+(w===2?1:0)) },
        })
      })
    }
  }, [tick])

  const handleShoot = useCallback(() => {
    const s = stateRef.current; if (!s || s.phase !== 'aiming') return
    const cue = s.balls.find(b => b.id===0); if (!cue) return
    const speed = Math.max(0.08, s.aimPower) * MAX_SHOT_SPEED
    cue.vx = Math.cos(s.aimAngle)*speed; cue.vy = Math.sin(s.aimAngle)*speed
    s.phase = 'shooting'; s.pottedThisTurn = []; s.cuePottedThisTurn = false
    s.firstBallHitId = null; s.railContactAfterHit = false; s.cushionsHitOnBreak = []
    s.foulReason = null
    const sg = s.turn===1 ? s.p1Group : s.p2Group
    s.wasOnEightAtShotStart = !s.tableOpen && sg!==null && countBallsLeft(s,sg)===0
    triggerUi()
  }, [triggerUi])

  const handlePlaceBall = useCallback(() => {
    const s = stateRef.current; if (!s || s.phase !== 'ballInHand') return
    const cue = s.balls.find(b => b.id===0); if (!cue) return
    if (!isValidCuePlacement(s,cue.x,cue.y)) return
    s.phase = 'aiming'; s.ballInHandDragging = false
    s.pendingBallInHand = false; s.ballInHandRestricted = false; s.foulReason = null
    triggerUi()
  }, [triggerUi])

  const handlePlayAgain = useCallback(() => {
    savedRef.current = false
    const s = stateRef.current; if (!s) return
    stateRef.current = buildState(s.w, s.h); triggerUi()
  }, [triggerUi])

  const c1 = p1Color==='red' ? '#ef4444' : '#3b82f6'
  const c2 = p1Color==='red' ? '#3b82f6' : '#ef4444'

  // Header state derived from current game state (re-read on each render)
  const gs        = stateRef.current
  const phase     = gs?.phase    ?? 'aiming'
  const turn      = gs?.turn     ?? 1
  const p1Group   = gs?.p1Group  ?? null
  const p2Group   = gs?.p2Group  ?? null
  const tableOpen = gs?.tableOpen ?? true
  const isBreak   = gs?.isBreak  ?? true
  const foulReason= gs?.foulReason ?? null
  const bihRestricted = gs?.ballInHandRestricted ?? false
  const gameWinner= gs?.winner   ?? null
  const gameOverMsg = gs?.gameOverMsg ?? ''
  const p1Left  = gs && p1Group ? countBallsLeft(gs, p1Group) : 7
  const p2Left  = gs && p2Group ? countBallsLeft(gs, p2Group) : 7
  const p1OnEight = !tableOpen && p1Group!==null && gs ? countBallsLeft(gs,p1Group)===0 : false
  const p2OnEight = !tableOpen && p2Group!==null && gs ? countBallsLeft(gs,p2Group)===0 : false
  const curOnEight = turn===1 ? p1OnEight : p2OnEight
  const curColor = turn===1 ? c1 : c2
  void tick

  const phaseLabel = phase==='aiming'
    ? (isBreak ? '🎱 BREAK' : 'AIMING')
    : (phase==='shooting'||phase==='resolving') ? '⏳ IN MOTION'
    : phase==='ballInHand' ? '✋ BALL IN HAND'
    : phase==='gameOver'   ? '🏆 GAME OVER'
    : 'NEXT PLAYER'

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    let rafId = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evL: { ev:string; fn:any; opts?: AddEventListenerOptions }[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addEv = (ev:string, fn:any, opts?: AddEventListenerOptions) => {
      canvas.addEventListener(ev,fn,opts); evL.push({ev,fn,opts})
    }
    const cleanup = () => {
      cancelAnimationFrame(rafId)
      evL.forEach(({ev,fn,opts})=>canvas.removeEventListener(ev,fn,opts)); evL.length=0
    }

    const initAndRun = () => {
      cleanup()
      const rect = canvas.getBoundingClientRect()
      if (rect.width<50||rect.height<100) { rafId=requestAnimationFrame(initAndRun); return }
      const dpr = window.devicePixelRatio||1
      canvas.width=rect.width*dpr; canvas.height=rect.height*dpr
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr,dpr)
      const W=rect.width, H=rect.height
      stateRef.current = buildState(W,H); triggerUi()

      const powerZoneX = W*0.80

      // ── Touch ────────────────────────────────────────────────────────────────
      const onTouchStart = (e: TouchEvent) => {
        e.preventDefault()
        const s = stateRef.current; if (!s) return
        const t = e.changedTouches[0]
        const tx=t.clientX-rect.left, ty=t.clientY-rect.top
        if (s.phase==='ballInHand') { s.ballInHandDragging=true; moveCueBallInHand(s,tx,ty); return }
        if (s.phase!=='aiming') return
        if (tx>powerZoneX) { s.powerDragging=true; s.powerTouchStartY=ty; s.powerAtDragStart=s.aimPower }
        else {
          s.aimDragging=true
          const cue=s.balls.find(b=>b.id===0)
          if (cue) s.aimAngle=Math.atan2(ty-cue.y,tx-cue.x)
        }
      }
      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault()
        const s = stateRef.current; if (!s) return
        const t = e.changedTouches[0]
        const tx=t.clientX-rect.left, ty=t.clientY-rect.top
        if (s.phase==='ballInHand'&&s.ballInHandDragging) { moveCueBallInHand(s,tx,ty); return }
        if (s.phase!=='aiming') return
        if (s.powerDragging) {
          const dy=(s.powerTouchStartY-ty)/(H*0.5)
          s.aimPower=Math.max(0,Math.min(1,s.powerAtDragStart+dy))
        } else if (s.aimDragging) {
          const cue=s.balls.find(b=>b.id===0)
          if (cue) s.aimAngle=Math.atan2(ty-cue.y,tx-cue.x)
        }
      }
      const onTouchEnd = (e: TouchEvent) => {
        e.preventDefault()
        const s=stateRef.current; if (!s) return
        s.aimDragging=false; s.powerDragging=false; s.ballInHandDragging=false
      }
      addEv('touchstart',onTouchStart,{passive:false})
      addEv('touchmove', onTouchMove, {passive:false})
      addEv('touchend',  onTouchEnd,  {passive:false})

      // ── Mouse ─────────────────────────────────────────────────────────────────
      let mouseDown = false
      const onMouseDown = (e: MouseEvent) => {
        const s=stateRef.current; if (!s) return
        mouseDown=true
        const mx=e.clientX-rect.left, my=e.clientY-rect.top
        if (s.phase==='ballInHand') { s.ballInHandDragging=true; moveCueBallInHand(s,mx,my); return }
        if (s.phase!=='aiming') return
        if (mx>powerZoneX) { s.powerDragging=true; s.powerTouchStartY=my; s.powerAtDragStart=s.aimPower }
        else {
          s.aimDragging=true
          const cue=s.balls.find(b=>b.id===0)
          if (cue) s.aimAngle=Math.atan2(my-cue.y,mx-cue.x)
        }
      }
      const onMouseMove = (e: MouseEvent) => {
        if (!mouseDown) return
        const s=stateRef.current; if (!s) return
        const mx=e.clientX-rect.left, my=e.clientY-rect.top
        if (s.phase==='ballInHand'&&s.ballInHandDragging) { moveCueBallInHand(s,mx,my); return }
        if (s.phase!=='aiming') return
        if (s.powerDragging) {
          const dy=(s.powerTouchStartY-my)/(H*0.5)
          s.aimPower=Math.max(0,Math.min(1,s.powerAtDragStart+dy))
        } else if (s.aimDragging) {
          const cue=s.balls.find(b=>b.id===0)
          if (cue) s.aimAngle=Math.atan2(my-cue.y,mx-cue.x)
        }
      }
      const onMouseUp = () => {
        mouseDown=false
        const s=stateRef.current; if (!s) return
        s.aimDragging=false; s.powerDragging=false; s.ballInHandDragging=false
      }
      addEv('mousedown',onMouseDown)
      addEv('mousemove',onMouseMove)
      addEv('mouseup',  onMouseUp)

      // ── Main loop ─────────────────────────────────────────────────────────────
      const loop = () => {
        const s=stateRef.current; if (!s) return

        if (s.phase==='gameOver') {
          ctx.clearRect(0,0,W,H); drawTable(ctx,s)
          for (const b of s.balls) drawBall(ctx,b)
          rafId=requestAnimationFrame(loop); return
        }

        if (s.phase==='shooting'||s.phase==='resolving') {
          updatePhysics(s)
          for (const b of s.balls) { const spd=Math.sqrt(b.vx*b.vx+b.vy*b.vy); b.spin+=(spd/b.r)*0.4 }
          if (s.phase==='shooting') s.phase='resolving'
          if (allStopped(s)) resolveTurn(s,triggerUi,onGameEndRef.current)
        } else if (s.phase==='turnChange') {
          s.turnChangeTimer--
          if (s.turnChangeTimer<=0) {
            if (s.pendingBallInHand) {
              if (!s.balls.find(b=>b.id===0)) {
                const y=s.ballInHandRestricted?(s.playY1+s.headStringY)/2:s.centreSpotY
                s.balls.push({id:0,x:s.spotX,y,vx:0,vy:0,r:s.ballR,spin:0})
              }
              s.phase='ballInHand'
            } else {
              s.phase='aiming'
            }
            triggerUi()
          }
        } else if (s.phase==='aiming'||s.phase==='ballInHand') {
          for (const b of s.balls) b.spin*=0.94
        }

        // ── Draw ────────────────────────────────────────────────────────────────
        ctx.clearRect(0,0,W,H)
        drawTable(ctx,s)

        if (s.phase==='ballInHand'&&s.ballInHandRestricted) drawKitchen(ctx,s)

        if (s.phase==='aiming') {
          const cue=s.balls.find(b=>b.id===0)
          if (cue) drawAimSystem(ctx,s,cue)
        }

        for (const b of s.balls) {
          if (s.phase==='ballInHand'&&b.id===0) {
            const valid=isValidCuePlacement(s,b.x,b.y)
            ctx.beginPath(); ctx.arc(b.x,b.y,b.r+4,0,Math.PI*2)
            ctx.strokeStyle=valid?'rgba(50,255,50,0.55)':'rgba(255,50,50,0.75)'
            ctx.lineWidth=2.5; ctx.stroke()
          }
          drawBall(ctx,b)
        }

        if (s.phase==='aiming') drawPowerBar(ctx,s,W,H,powerZoneX)
        drawOverlay(ctx,s,W,H,c1,c2)

        rafId=requestAnimationFrame(loop)
      }
      rafId=requestAnimationFrame(loop)
    }

    let resizeTimer=0
    const ro=new ResizeObserver(()=>{ clearTimeout(resizeTimer); resizeTimer=window.setTimeout(initAndRun,150) })
    ro.observe(canvas); initAndRun()
    return ()=>{ cleanup(); ro.disconnect(); clearTimeout(resizeTimer) }
  }, [p1Color,triggerUi])   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex flex-col" style={{background:'#2a1a0a'}}>
      {/* ── Header ── */}
      <div className="flex-shrink-0"
        style={{paddingTop:'env(safe-area-inset-top)',background:'rgba(26,14,4,0.97)',borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={onBack} className="p-2 rounded-xl" style={{background:'rgba(255,255,255,0.08)'}}>
            <ChevronLeft size={20} className="text-white" />
          </button>
          <span className="text-base font-bold text-white">Pool</span>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{background:'rgba(255,255,255,0.07)',color:'rgba(255,255,255,0.45)'}}>
            {phaseLabel}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-bold" style={{color:c1}}>
                P1 {p1OnEight ? '🎱' : ''}
              </div>
              <div className="text-xs" style={{color:'rgba(255,255,255,0.38)'}}>
                {tableOpen ? 'OPEN' : `${p1Group==='solids'?'●':'◑'} ${p1Left}`}
              </div>
            </div>
            <div className="text-xs font-black" style={{color:'rgba(255,255,255,0.22)'}}>vs</div>
            <div className="text-left">
              <div className="text-xs font-bold" style={{color:c2}}>
                P2 {p2OnEight ? '🎱' : ''}
              </div>
              <div className="text-xs" style={{color:'rgba(255,255,255,0.38)'}}>
                {tableOpen ? 'OPEN' : `${p2Group==='solids'?'●':'◑'} ${p2Left}`}
              </div>
            </div>
          </div>
        </div>

        {/* Turn strip */}
        <div className="px-3 pb-1 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold px-3 py-1 rounded-full"
            style={{background:`${curColor}22`,color:curColor}}>
            {turn===1?'P1':'P2'}'s turn
            {!tableOpen&&(turn===1?p1Group:p2Group)
              ? ` · ${(turn===1?p1Group:p2Group)!.toUpperCase()}`
              : tableOpen?' · OPEN TABLE':''}
          </span>
          {curOnEight && phase==='aiming' && !foulReason && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{background:'rgba(245,197,24,0.18)',color:'#f5c518'}}>
              🎱 ON THE 8-BALL
            </span>
          )}
        </div>

        {/* Status line */}
        {foulReason && (
          <div className="px-3 pb-2">
            <span className="text-xs font-bold" style={{color:'#ef4444'}}>
              ⚠ FOUL: {FOUL_TEXT[foulReason]}
            </span>
          </div>
        )}
        {phase==='ballInHand' && !foulReason && (
          <div className="px-3 pb-2">
            <span className="text-xs" style={{color:'#f5c518'}}>
              ✋ Drag the cue ball{bihRestricted?' (kitchen only — above head string)':' anywhere on the table'}, then tap PLACE
            </span>
          </div>
        )}
      </div>

      {/* ── Canvas area ── */}
      <div className="canvas-area" style={{position:'relative'}}>
        <canvas ref={canvasRef}
          style={{position:'absolute',inset:0,width:'100%',height:'100%',touchAction:'none',display:'block'}} />

        {/* SHOOT button */}
        {phase==='aiming' && (
          <button onClick={handleShoot} style={{
            position:'absolute',bottom:20,left:'38%',transform:'translateX(-50%)',
            background:'#f5c518',color:'#111',fontWeight:800,fontSize:15,
            padding:'12px 28px',borderRadius:28,border:'none',
            boxShadow:'0 4px 20px rgba(0,0,0,0.65)',zIndex:20,letterSpacing:'0.04em',
          }}>
            🎱 SHOOT
          </button>
        )}

        {/* PLACE BALL button */}
        {phase==='ballInHand' && (
          <button onClick={handlePlaceBall} style={{
            position:'absolute',bottom:20,left:'38%',transform:'translateX(-50%)',
            background:'#22c55e',color:'#fff',fontWeight:800,fontSize:15,
            padding:'12px 28px',borderRadius:28,border:'none',
            boxShadow:'0 4px 20px rgba(0,0,0,0.65)',zIndex:20,letterSpacing:'0.04em',
          }}>
            ✓ PLACE BALL
          </button>
        )}

        {/* Game-over overlay */}
        {phase==='gameOver' && (
          <div style={{
            position:'absolute',inset:0,zIndex:30,
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
            background:'rgba(0,0,0,0.88)',
          }}>
            <div style={{fontSize:20,marginBottom:8}}>🎱</div>
            <div style={{
              fontSize:32,fontWeight:800,marginBottom:10,
              color:gameWinner===1?c1:c2,
              textShadow:`0 0 24px ${gameWinner===1?c1:c2}`,
            }}>
              {gameWinner===1?'P1':'P2'} Wins!
            </div>
            <div style={{
              fontSize:14,color:'rgba(255,255,255,0.65)',marginBottom:36,
              textAlign:'center',padding:'0 28px',lineHeight:1.5,
            }}>
              {gameOverMsg}
            </div>
            <button onClick={handlePlayAgain} style={{
              background:'#f5c518',color:'#111',fontWeight:800,fontSize:16,
              padding:'14px 44px',borderRadius:32,border:'none',
              boxShadow:'0 4px 20px rgba(0,0,0,0.5)',marginBottom:14,cursor:'pointer',
            }}>
              Play Again
            </button>
            <button onClick={onBack} style={{
              background:'rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.7)',
              fontWeight:600,fontSize:14,padding:'12px 36px',borderRadius:32,
              border:'1px solid rgba(255,255,255,0.15)',cursor:'pointer',
            }}>
              Back to Games
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
