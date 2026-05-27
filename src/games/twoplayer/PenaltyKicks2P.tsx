import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { saveGameScore, getGameScore } from '../../db'
import type { TwoPlayerGameProps } from './types'

const SHOTS_EACH = 5
const ANNOUNCE_F = 80   // ~1.3s at 60fps
const PASS_F = 70       // "pass the phone" pause in 2P
const RESULT_F = 90     // show GOAL/SAVED/MISSED
const FLY_F = 55        // ball flight frames
const POWER_SPEED = 0.055
const AIM_SPEED = 0.048

type Zone = 0 | 1 | 2  // 0=left  1=centre  2=right
type Phase = 'announce' | 'save' | 'pass' | 'power' | 'aim' | 'flying' | 'result' | 'done'

interface PKState {
  phase: Phase
  turn: number
  p1Results: (boolean | null)[]
  p2Results: (boolean | null)[]
  savedZone: Zone | null
  powerPhase: number
  aimPhase: number
  lockedPower: number
  lockedAim: Zone
  flyT: number
  keeperCX: number        // current X
  keeperTX: number        // target X
  keeperDY: number        // Y offset (dive)
  ballX: number; ballY: number
  bTargetX: number; bTargetY: number
  bStartX: number; bStartY: number
  goalResult: 'goal' | 'saved' | 'missed' | null
  announceT: number
  passT: number
  resultT: number
  suddenDeath: boolean
  sdRound: number
  sdP1: boolean | null; sdP2: boolean | null
  winner: 'p1' | 'p2' | null
  p1History: Zone[]       // shot history for AI reads
  p2History: Zone[]
  aiSavePend: boolean; aiSaveAt: number
  aiPowerPend: boolean; aiPowerAt: number
  aiAimPend: boolean; aiAimAt: number
  frame: number
  w: number; h: number
}

export default function PenaltyKicks2P({
  mode, difficulty = 'medium', p1Color = 'red',
  onBack, onGameEnd, tournamentMode,
}: TwoPlayerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<PKState | null>(null)
  const [scores, setScores] = useState([0, 0])
  const [gameResult, setGameResult] = useState<'p1' | 'p2' | null>(null)
  const gameResultRef = useRef<'p1' | 'p2' | null>(null)

  const c1 = p1Color === 'red' ? '#ef4444' : '#3b82f6'
  const c2 = p1Color === 'red' ? '#3b82f6' : '#ef4444'

  const saveScore = async (w: 'p1' | 'p2') => {
    const id = `penalty_${mode === 'ai' ? `ai_${difficulty}` : '2p'}`
    const existing = await getGameScore(id)
    const wins = (existing?.bestScore ?? 0) + (w === 'p1' ? 1 : 0)
    await saveGameScore({ gameId: id, bestScore: wins, lastPlayed: new Date().toISOString() })
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let rafId = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evL: { ev: string; fn: (e: any) => void; opts?: AddEventListenerOptions }[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addEv = (ev: string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
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
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')!; ctx.scale(dpr, dpr)
      const W = rect.width, H = rect.height

      // ── Layout constants ──────────────────────────────────────────────────
      const goalW = W * 0.72
      const goalX = (W - goalW) / 2
      const goalY = H * 0.06
      const goalH = H * 0.30
      const goalMX = goalX + goalW / 2
      const spotX = W / 2
      const spotY = H * 0.58
      const ballStartX = spotX
      const ballStartY = spotY - 12
      const keeperFeetY = goalY + goalH

      // ── Build/restore state ───────────────────────────────────────────────
      const prev = stateRef.current
      const s: PKState = {
        phase: 'announce',
        turn: prev?.turn ?? 0,
        p1Results: prev?.p1Results ?? Array(SHOTS_EACH).fill(null),
        p2Results: prev?.p2Results ?? Array(SHOTS_EACH).fill(null),
        savedZone: null, powerPhase: 0, aimPhase: 0,
        lockedPower: 0.5, lockedAim: 1,
        flyT: 0,
        keeperCX: goalMX, keeperTX: goalMX, keeperDY: 0,
        ballX: ballStartX, ballY: ballStartY,
        bTargetX: ballStartX, bTargetY: goalY + goalH * 0.5,
        bStartX: ballStartX, bStartY: ballStartY,
        goalResult: null,
        announceT: 0, passT: 0, resultT: 0,
        suddenDeath: prev?.suddenDeath ?? false,
        sdRound: prev?.sdRound ?? 0,
        sdP1: prev?.sdP1 ?? null, sdP2: prev?.sdP2 ?? null,
        winner: prev?.winner ?? null,
        p1History: prev?.p1History ?? [],
        p2History: prev?.p2History ?? [],
        aiSavePend: false, aiSaveAt: 0,
        aiPowerPend: false, aiPowerAt: 0,
        aiAimPend: false, aiAimAt: 0,
        frame: 0, w: W, h: H,
      }
      if (s.winner) s.phase = 'done'
      stateRef.current = s

      // ── Helpers ───────────────────────────────────────────────────────────
      function p1Shoots(turn: number) { return turn % 2 === 0 }

      function aiPickSaveZone(): Zone {
        const shooterHist = p1Shoots(s.turn) ? s.p1History : s.p2History
        if (difficulty === 'easy') return Math.floor(Math.random() * 3) as Zone
        if (difficulty === 'medium' && shooterHist.length >= 2 && Math.random() < 0.38)
          return shooterHist[shooterHist.length - 1]
        if (difficulty === 'hard' && shooterHist.length >= 2 && Math.random() < 0.55) {
          const last = shooterHist.slice(-2)
          return last[0] === last[1] ? last[1] : last[1]
        }
        return Math.floor(Math.random() * 3) as Zone
      }

      function aiPickPower(): number {
        if (difficulty === 'easy') return 0.30 + Math.random() * 0.45
        if (difficulty === 'medium') return 0.50 + Math.random() * 0.35
        return 0.60 + Math.random() * 0.25
      }

      function aiPickAim(): Zone {
        if (difficulty === 'easy') return (Math.random() < 0.45 ? 1 : Math.floor(Math.random() * 3)) as Zone
        if (difficulty === 'medium') return Math.floor(Math.random() * 3) as Zone
        return (Math.random() < 0.72 ? (Math.random() < 0.5 ? 0 : 2) : 1) as Zone
      }

      function computeOutcome(power: number, aim: Zone, save: Zone): 'goal' | 'saved' | 'missed' {
        if (power > 0.87 && Math.random() < (power - 0.84) * 2.8) return 'missed'
        if ((aim === 0 || aim === 2) && power < 0.22 && Math.random() < 0.45) return 'missed'
        if (aim === save) return 'saved'
        return 'goal'
      }

      function getBallTarget(aim: Zone, result: 'goal' | 'saved' | 'missed'): { x: number; y: number } {
        if (result === 'missed') {
          return Math.random() < 0.6
            ? { x: goalX + goalW * (0.3 + Math.random() * 0.4), y: goalY - goalH * 0.45 }  // high
            : { x: aim === 0 ? goalX - goalW * 0.3 : goalX + goalW * 1.3, y: goalY + goalH * 0.5 }  // wide
        }
        const targets: { x: number; y: number }[] = [
          { x: goalX + goalW * 0.18, y: goalY + goalH * 0.42 },
          { x: goalX + goalW * 0.50, y: goalY + goalH * 0.65 },
          { x: goalX + goalW * 0.82, y: goalY + goalH * 0.42 },
        ]
        return targets[aim]
      }

      function setupTurn() {
        s.phase = 'announce'; s.announceT = 0
        s.savedZone = null; s.flyT = 0
        s.keeperCX = goalMX; s.keeperTX = goalMX; s.keeperDY = 0
        s.ballX = ballStartX; s.ballY = ballStartY
        s.goalResult = null
        s.aiSavePend = false; s.aiPowerPend = false; s.aiAimPend = false
      }

      function endGame(winner: 'p1' | 'p2') {
        s.winner = winner; s.phase = 'done'
        gameResultRef.current = winner; setGameResult(winner); saveScore(winner)
      }

      function resolveTurn() {
        const isP1 = p1Shoots(s.turn)
        const goal = s.goalResult === 'goal'
        const hist = isP1 ? s.p1History : s.p2History
        hist.push(s.lockedAim)
        if (hist.length > 6) hist.shift()

        if (!s.suddenDeath) {
          const idx = Math.floor(s.turn / 2)
          if (isP1) s.p1Results[idx] = goal
          else s.p2Results[idx] = goal
          const p1g = s.p1Results.filter(r => r === true).length
          const p2g = s.p2Results.filter(r => r === true).length
          setScores([p1g, p2g])
          s.turn++
          if (s.turn >= SHOTS_EACH * 2) {
            if (p1g > p2g) { endGame('p1'); return }
            if (p2g > p1g) { endGame('p2'); return }
            s.suddenDeath = true; s.sdRound = 1; s.sdP1 = null; s.sdP2 = null
          }
        } else {
          if (isP1) {
            s.sdP1 = goal
          } else {
            s.sdP2 = goal
            if (s.sdP1 === true && s.sdP2 === false) { endGame('p1'); return }
            if (s.sdP1 === false && s.sdP2 === true) { endGame('p2'); return }
            s.sdP1 = null; s.sdP2 = null; s.sdRound++
          }
          s.turn++
        }
        if (s.phase !== 'done') setupTurn()
      }

      // ── Tap handler ────────────────────────────────────────────────────────
      function handleTap(tapX: number) {
        const { phase } = s
        if (phase === 'save') {
          let zone: Zone = tapX < W / 3 ? 0 : tapX < W * 2 / 3 ? 1 : 2
          s.savedZone = zone
          s.keeperTX = zone === 0 ? goalX + goalW * 0.18
                      : zone === 1 ? goalMX
                      : goalX + goalW * 0.82
          // 2P: show "pass" screen; AI mode: go straight to power
          if (mode === '2p') {
            s.phase = 'pass'; s.passT = 0
          } else {
            s.phase = 'power'
            // Schedule AI shooter if needed
            if (!p1Shoots(s.turn)) {
              const pw = aiPickPower()
              s.lockedPower = pw
              s.aiPowerPend = true
              s.aiPowerAt = s.frame + (difficulty === 'easy' ? 45 : difficulty === 'medium' ? 28 : 14)
            }
          }
        } else if (phase === 'power') {
          s.lockedPower = Math.sin(s.powerPhase) * 0.5 + 0.5
          s.phase = 'aim'
          s.aiAimPend = false  // ensure no leftover
        } else if (phase === 'aim') {
          const raw = Math.sin(s.aimPhase)
          s.lockedAim = raw < -0.33 ? 0 : raw > 0.33 ? 2 : 1
          const result = computeOutcome(s.lockedPower, s.lockedAim, s.savedZone!)
          s.goalResult = result
          const tgt = getBallTarget(s.lockedAim, result)
          s.bTargetX = tgt.x; s.bTargetY = tgt.y
          s.bStartX = ballStartX; s.bStartY = ballStartY
          if (result === 'saved') {
            s.keeperDY = -18
          }
          s.phase = 'flying'; s.flyT = 0
        }
      }

      const onTouch = (e: TouchEvent) => {
        e.preventDefault()
        if (e.changedTouches.length > 0) {
          const r = canvas.getBoundingClientRect()
          handleTap(e.changedTouches[0].clientX - r.left)
        }
      }
      const onMouse = (e: MouseEvent) => {
        const r = canvas.getBoundingClientRect()
        handleTap(e.clientX - r.left)
      }
      addEv('touchstart', onTouch, { passive: false })
      addEv('click', onMouse)

      // ── Draw helpers ────────────────────────────────────────────────────────
      function drawBackground() {
        // Sky
        const sky = ctx.createLinearGradient(0, 0, 0, H * 0.16)
        sky.addColorStop(0, '#0f2a4a'); sky.addColorStop(1, '#1a4070')
        ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.16)

        // Crowd silhouette
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.beginPath(); ctx.moveTo(0, H * 0.16)
        for (let x = 0; x <= W; x += 8) {
          const bump = 6 + Math.sin(x * 0.31) * 3.5 + Math.sin(x * 0.13) * 2.5
          ctx.lineTo(x, H * 0.16 - bump)
        }
        ctx.lineTo(W, H * 0.16); ctx.closePath(); ctx.fill()

        // Grass
        const grass = ctx.createLinearGradient(0, H * 0.16, 0, H)
        grass.addColorStop(0, '#1a5c28'); grass.addColorStop(1, '#0d3a18')
        ctx.fillStyle = grass; ctx.fillRect(0, H * 0.16, W, H)

        // Pitch stripes
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)'
          ctx.fillRect(0, H * 0.16 + i * H * 0.84 / 5, W, H * 0.84 / 5)
        }

        // Penalty box
        const boxW = goalW + W * 0.10; const boxX = (W - boxW) / 2
        const boxTop = goalY + goalH; const boxH = H * 0.28
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5; ctx.setLineDash([])
        ctx.strokeRect(boxX, boxTop, boxW, boxH)

        // Penalty arc
        ctx.beginPath(); ctx.arc(W / 2, spotY, H * 0.08, -Math.PI * 0.72, Math.PI + Math.PI * 0.72, true)
        ctx.stroke()

        // Penalty spot
        ctx.fillStyle = 'rgba(255,255,255,0.75)'
        ctx.beginPath(); ctx.arc(spotX, spotY, 4, 0, Math.PI * 2); ctx.fill()
      }

      function drawGoal() {
        const pw = 5
        // Net background
        ctx.fillStyle = 'rgba(0,0,0,0.22)'
        ctx.fillRect(goalX + pw, goalY, goalW - pw * 2, goalH)
        // Net hatching
        ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 0.7
        const sp = 13
        for (let x = goalX + pw; x < goalX + goalW - pw; x += sp) {
          ctx.beginPath(); ctx.moveTo(x, goalY); ctx.lineTo(x, goalY + goalH); ctx.stroke()
        }
        for (let y = goalY; y < goalY + goalH; y += sp) {
          ctx.beginPath(); ctx.moveTo(goalX + pw, y); ctx.lineTo(goalX + goalW - pw, y); ctx.stroke()
        }
        // Posts
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(goalX, goalY, pw, goalH + pw)
        ctx.fillRect(goalX + goalW - pw, goalY, pw, goalH + pw)
        ctx.fillRect(goalX, goalY, goalW, pw)
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillRect(goalX, goalY + goalH, goalW, 2.5)
      }

      function drawKeeper(cx: number, dy: number, color: string) {
        const fy = keeperFeetY
        ctx.save(); ctx.translate(cx, fy + dy)

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        ctx.beginPath(); ctx.ellipse(0, 10, 16, 5, 0, 0, Math.PI * 2); ctx.fill()

        // Body
        ctx.fillStyle = color
        ctx.beginPath(); ctx.roundRect(-11, -32, 22, 32, 4); ctx.fill()

        // Shorts
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath(); ctx.roundRect(-11, -14, 22, 10, 2); ctx.fill()

        // Legs
        ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-8, 13); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(8, 13); ctx.stroke()

        // Arms (extend toward dive side)
        const side = cx < goalMX ? -1 : cx > goalMX ? 1 : 0
        const ext = Math.min(Math.abs(cx - goalMX) / (goalW * 0.28), 1)
        ctx.lineWidth = 6
        ctx.beginPath(); ctx.moveTo(-11, -24)
        ctx.lineTo(-11 - 12 - side * ext * 12, -24 - ext * 10 * (side === -1 ? 1 : 0.4)); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(11, -24)
        ctx.lineTo(11 + 12 + side * ext * 12, -24 - ext * 10 * (side === 1 ? 1 : 0.4)); ctx.stroke()

        // Head
        ctx.fillStyle = '#f3d5b5'
        ctx.beginPath(); ctx.arc(0, -40, 9, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = color
        ctx.beginPath(); ctx.arc(0, -40, 9, Math.PI, Math.PI * 2); ctx.fill()

        ctx.restore()
      }

      function drawShooter(color: string, phase: Phase) {
        const sx = W / 2 + 22, sy = H * 0.70
        ctx.save(); ctx.translate(sx, sy)

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        ctx.beginPath(); ctx.ellipse(-4, 10, 16, 5, 0, 0, Math.PI * 2); ctx.fill()

        // Body
        ctx.fillStyle = color
        ctx.beginPath(); ctx.roundRect(-10, -28, 20, 28, 4); ctx.fill()

        // Shorts
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.beginPath(); ctx.roundRect(-10, -12, 20, 9, 2); ctx.fill()

        // Legs
        ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round'
        const kicking = phase === 'flying' || phase === 'result'
        ctx.beginPath(); ctx.moveTo(5, 0)
        ctx.lineTo(kicking ? -14 : 6, kicking ? -8 : 13); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-5, 13); ctx.stroke()

        // Arms
        ctx.lineWidth = 6
        ctx.beginPath(); ctx.moveTo(10, -20); ctx.lineTo(22, -12); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(-10, -20); ctx.lineTo(-20, -26); ctx.stroke()

        // Head
        ctx.fillStyle = '#f3d5b5'
        ctx.beginPath(); ctx.arc(0, -36, 9, 0, Math.PI * 2); ctx.fill()

        ctx.restore()
      }

      function drawBall(bx: number, by: number, sc = 1) {
        const r = 11 * sc
        ctx.save(); ctx.translate(bx, by)
        ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 7
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = '#222'
        for (const [px, py] of [[0, 0], [r * 0.42, -r * 0.36], [-r * 0.42, -r * 0.36], [r * 0.5, r * 0.22], [-r * 0.5, r * 0.22]]) {
          ctx.beginPath(); ctx.arc(px, py, r * 0.26, 0, Math.PI * 2); ctx.fill()
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
        ctx.restore()
      }

      function drawPowerMeter() {
        if (s.phase !== 'power') return
        const mw = W * 0.74; const mx = (W - mw) / 2; const my = H * 0.82; const mh = 24
        const fill = Math.sin(s.powerPhase) * 0.5 + 0.5
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 12); ctx.fill()
        const pc = fill < 0.4 ? '#4ade80' : fill < 0.75 ? '#fbbf24' : '#ef4444'
        ctx.fillStyle = pc; ctx.beginPath(); ctx.roundRect(mx + 2, my + 2, (mw - 4) * fill, mh - 4, 10); ctx.fill()
        ctx.font = 'bold 11px Inter, system-ui'; ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText('POWER — TAP TO LOCK', W / 2, my - 7)
      }

      function drawAimBar() {
        if (s.phase !== 'aim') return
        const bw = goalW; const bx = goalX; const by = H * 0.74; const bh = 26
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 13); ctx.fill()
        const raw = Math.sin(s.aimPhase)
        const zones = [
          { label: 'LEFT', x: bx, w: bw / 3, active: raw < -0.33 },
          { label: 'CENTRE', x: bx + bw / 3, w: bw / 3, active: raw >= -0.33 && raw <= 0.33 },
          { label: 'RIGHT', x: bx + bw * 2 / 3, w: bw / 3, active: raw > 0.33 },
        ]
        zones.forEach((z, i) => {
          if (z.active) {
            ctx.fillStyle = '#06b6d4'; ctx.globalAlpha = 0.28
            ctx.beginPath()
            const r = i === 0 ? [13, 0, 0, 13] : i === 2 ? [0, 13, 13, 0] : [0]
            ctx.roundRect(z.x, by, z.w, bh, r as number[]); ctx.fill(); ctx.globalAlpha = 1
          }
          ctx.font = 'bold 10px Inter, system-ui'; ctx.textAlign = 'center'
          ctx.fillStyle = z.active ? '#fff' : 'rgba(255,255,255,0.45)'
          ctx.fillText(z.label, z.x + z.w / 2, by + bh / 2 + 4)
        })
        // Cursor dot
        const curX = bx + (raw * 0.5 + 0.5) * bw
        ctx.fillStyle = '#06b6d4'; ctx.shadowColor = '#06b6d4'; ctx.shadowBlur = 10
        ctx.beginPath(); ctx.arc(curX, by - 7, 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
        ctx.font = 'bold 11px Inter, system-ui'; ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText('AIM — TAP TO SHOOT', W / 2, by + bh + 13)
      }

      function drawSaveZoneButtons() {
        if (s.phase !== 'save') return
        const btnY = H * 0.81; const btnH = H * 0.12
        const labels = ['← LEFT', '↕ CENTRE', 'RIGHT →']
        for (let i = 0; i < 3; i++) {
          const bx = i * (W / 3); const bw = W / 3
          ctx.fillStyle = 'rgba(255,255,255,0.10)'
          ctx.beginPath(); ctx.roundRect(bx + 5, btnY, bw - 10, btnH, 12); ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.roundRect(bx + 5, btnY, bw - 10, btnH, 12); ctx.stroke()
          ctx.font = 'bold 13px Inter, system-ui'; ctx.textAlign = 'center'
          ctx.fillStyle = '#fff'; ctx.fillText(labels[i], bx + bw / 2, btnY + btnH / 2 + 5)
        }
      }

      function drawOverlayText(text: string, sub: string, color: string) {
        ctx.fillStyle = 'rgba(0,0,0,0.58)'; ctx.fillRect(0, 0, W, H)
        ctx.textAlign = 'center'
        ctx.font = 'bold 28px Inter, system-ui'; ctx.fillStyle = color
        ctx.shadowColor = color; ctx.shadowBlur = 18
        ctx.fillText(text, W / 2, H * 0.43); ctx.shadowBlur = 0
        ctx.font = '14px Inter, system-ui'
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(sub, W / 2, H * 0.52)
      }

      function drawScoreDots() {
        const spacing = 16
        for (let i = 0; i < SHOTS_EACH; i++) {
          const r = s.p1Results[i]
          ctx.fillStyle = r === null ? 'rgba(255,255,255,0.18)' : r ? '#4ade80' : '#f87171'
          ctx.beginPath(); ctx.arc(14 + i * spacing, 14, 5, 0, Math.PI * 2); ctx.fill()
        }
        for (let i = 0; i < SHOTS_EACH; i++) {
          const r = s.p2Results[i]
          ctx.fillStyle = r === null ? 'rgba(255,255,255,0.18)' : r ? '#4ade80' : '#f87171'
          ctx.beginPath(); ctx.arc(W - 14 - i * spacing, 14, 5, 0, Math.PI * 2); ctx.fill()
        }
      }

      // ── Update ──────────────────────────────────────────────────────────────
      const update = () => {
        s.frame++
        const isP1 = p1Shoots(s.turn)
        const aiIsSaving = mode === 'ai' && isP1   // AI saves when P1 shoots
        const aiIsShooting = mode === 'ai' && !isP1  // AI shoots on P2 turns

        // Keeper slides toward target only during flying/result
        if (s.phase === 'flying' || s.phase === 'result') {
          const spd = 14
          const dx = s.keeperTX - s.keeperCX
          s.keeperCX += Math.abs(dx) < spd ? dx : Math.sign(dx) * spd
          // Dive Y arc
          const prog = s.phase === 'flying' ? s.flyT / FLY_F : 1
          s.keeperDY = s.goalResult === 'saved' ? -Math.sin(prog * Math.PI) * 20 : 0
        }

        if (s.phase === 'announce') {
          s.announceT++
          if (s.announceT >= ANNOUNCE_F) {
            s.phase = 'save'
            if (aiIsSaving) {
              const delay = difficulty === 'easy' ? 50 : difficulty === 'medium' ? 30 : 14
              s.aiSavePend = true; s.aiSaveAt = s.frame + delay
            }
          }
          return
        }

        if (s.phase === 'save') {
          if (s.aiSavePend && s.frame >= s.aiSaveAt) {
            s.savedZone = aiPickSaveZone()
            s.keeperTX = s.savedZone === 0 ? goalX + goalW * 0.18
                        : s.savedZone === 1 ? goalMX : goalX + goalW * 0.82
            s.aiSavePend = false
            s.phase = 'power'
            if (aiIsShooting) {
              s.lockedPower = aiPickPower()
              s.aiPowerPend = true
              s.aiPowerAt = s.frame + (difficulty === 'easy' ? 45 : difficulty === 'medium' ? 28 : 14)
            }
          }
          return
        }

        if (s.phase === 'pass') {
          s.passT++
          if (s.passT >= PASS_F) {
            s.phase = 'power'
            if (aiIsShooting) {
              s.lockedPower = aiPickPower()
              s.aiPowerPend = true
              s.aiPowerAt = s.frame + (difficulty === 'easy' ? 45 : difficulty === 'medium' ? 28 : 14)
            }
          }
          return
        }

        if (s.phase === 'power') {
          s.powerPhase += POWER_SPEED
          if (s.aiPowerPend && s.frame >= s.aiPowerAt) {
            s.aiPowerPend = false
            s.phase = 'aim'
            s.lockedAim = aiPickAim()
            s.aiAimPend = true
            s.aiAimAt = s.frame + (difficulty === 'easy' ? 35 : difficulty === 'medium' ? 22 : 10)
          }
          return
        }

        if (s.phase === 'aim') {
          s.aimPhase += AIM_SPEED
          if (s.aiAimPend && s.frame >= s.aiAimAt) {
            s.aiAimPend = false
            const result = computeOutcome(s.lockedPower, s.lockedAim, s.savedZone!)
            s.goalResult = result
            const tgt = getBallTarget(s.lockedAim, result)
            s.bTargetX = tgt.x; s.bTargetY = tgt.y
            s.bStartX = ballStartX; s.bStartY = ballStartY
            if (result === 'saved') s.keeperDY = -18
            s.phase = 'flying'; s.flyT = 0
          }
          return
        }

        if (s.phase === 'flying') {
          s.flyT++
          const t = s.flyT / FLY_F
          // Bezier arc through a control point above the goal
          const cpX = (s.bStartX + s.bTargetX) / 2
          const cpY = goalY - 50
          s.ballX = (1 - t) * (1 - t) * s.bStartX + 2 * (1 - t) * t * cpX + t * t * s.bTargetX
          s.ballY = (1 - t) * (1 - t) * s.bStartY + 2 * (1 - t) * t * cpY + t * t * s.bTargetY
          if (s.flyT >= FLY_F) { s.phase = 'result'; s.resultT = 0 }
          return
        }

        if (s.phase === 'result') {
          s.resultT++
          if (s.resultT >= RESULT_F) resolveTurn()
          return
        }
      }

      // ── Render ──────────────────────────────────────────────────────────────
      const render = () => {
        ctx.clearRect(0, 0, W, H)
        drawBackground()
        drawGoal()

        const isP1 = p1Shoots(s.turn)
        const keeperColor = isP1 ? c2 : c1  // defender is the other player
        const shooterColor = isP1 ? c1 : c2

        drawKeeper(s.keeperCX, s.keeperDY, keeperColor)

        if (s.phase !== 'announce') {
          const ballVisible = s.phase === 'flying' || s.phase === 'result'
          if (ballVisible) {
            drawBall(s.ballX, s.ballY, 1 - s.flyT / FLY_F * 0.15)
          } else {
            drawBall(ballStartX, ballStartY, 1)
          }
          drawShooter(shooterColor, s.phase)
        }

        drawPowerMeter()
        drawAimBar()
        drawSaveZoneButtons()

        // Overlays
        if (s.phase === 'announce') {
          const shotLabel = s.suddenDeath ? `Sudden Death${s.sdRound > 1 ? ` (Round ${s.sdRound})` : ''}` : `Shot ${Math.floor(s.turn / 2) + 1} / ${SHOTS_EACH}`
          const shooter = isP1 ? (mode === 'ai' ? 'YOUR TURN' : 'PLAYER 1 SHOOTS') : (mode === 'ai' ? 'AI SHOOTS' : 'PLAYER 2 SHOOTS')
          drawOverlayText(shooter, shotLabel, shooterColor)
        }

        if (s.phase === 'save') {
          ctx.textAlign = 'center'
          ctx.font = 'bold 15px Inter, system-ui'
          const defLabel = isP1 ? (mode === 'ai' ? 'AI Goalkeeper — diving...' : 'Player 2 — choose your dive') : (mode === 'ai' ? 'Defend! Choose dive zone' : 'Player 1 — choose your dive')
          ctx.fillStyle = keeperColor; ctx.fillText(defLabel, W / 2, H * 0.76)
        }

        if (s.phase === 'pass') {
          const shootLabel = isP1 ? (mode === 'ai' ? '' : 'PASS TO PLAYER 1') : (mode === 'ai' ? '' : 'PASS TO PLAYER 2')
          if (shootLabel) drawOverlayText(shootLabel, 'Goalkeeper has committed — don\'t peek!', shooterColor)
        }

        if (s.phase === 'result' && s.goalResult) {
          const txt = s.goalResult === 'goal' ? '⚽  GOAL!' : s.goalResult === 'saved' ? '🧤  SAVED!' : '❌  MISSED!'
          const col = s.goalResult === 'goal' ? '#4ade80' : s.goalResult === 'saved' ? '#60a5fa' : '#f87171'
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, H * 0.35, W, H * 0.22)
          ctx.textAlign = 'center'
          ctx.font = 'bold 36px Inter, system-ui'
          ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 22
          ctx.fillText(txt, W / 2, H * 0.48); ctx.shadowBlur = 0
        }

        // HUD scores
        ctx.font = 'bold 12px Inter, system-ui'; ctx.textAlign = 'left'
        ctx.fillStyle = c1; ctx.fillText('P1', 6, 28)
        ctx.textAlign = 'right'; ctx.fillStyle = c2; ctx.fillText('P2', W - 6, 28)
        drawScoreDots()
      }

      const loop = () => { update(); render(); rafId = requestAnimationFrame(loop) }
      rafId = requestAnimationFrame(loop)
    }

    let resizeT = 0
    const ro = new ResizeObserver(() => { clearTimeout(resizeT); resizeT = window.setTimeout(initAndRun, 150) })
    ro.observe(canvas); initAndRun()
    return () => { cleanup(); ro.disconnect(); clearTimeout(resizeT) }
  }, [mode, difficulty, p1Color])

  const handleBack = () => { if (gameResultRef.current && onGameEnd) onGameEnd(gameResultRef.current); else onBack() }
  const handleRestart = () => {
    const s = stateRef.current; if (!s) return
    Object.assign(s, {
      phase: 'announce', turn: 0,
      p1Results: Array(SHOTS_EACH).fill(null), p2Results: Array(SHOTS_EACH).fill(null),
      savedZone: null, powerPhase: 0, aimPhase: 0,
      winner: null, suddenDeath: false, sdRound: 0, sdP1: null, sdP2: null,
      p1History: [], p2History: [], announceT: 0, resultT: 0, flyT: 0,
      aiSavePend: false, aiPowerPend: false, aiAimPend: false,
    })
    gameResultRef.current = null; setScores([0, 0]); setGameResult(null)
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#0a2a14' }}>
      <div className="flex items-center gap-3 px-4 pb-2 flex-shrink-0"
        style={{ background: 'rgba(10,42,20,0.95)', paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white">Penalty Kicks</h1>
        <div className="ml-auto flex gap-3 items-center">
          <span className="text-sm font-bold" style={{ color: c1 }}>{scores[0]}</span>
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>–</span>
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
            style={{ background: 'rgba(0,0,0,0.78)', zIndex: 50 }}>
            <motion.div initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="rounded-3xl p-8 text-center mx-5"
              style={{ background: '#0d1a0d', border: '2px solid rgba(255,255,255,0.12)', maxWidth: 300, width: '100%' }}>
              <div className="text-5xl mb-3">⚽</div>
              <h2 className="text-3xl font-black mb-1" style={{ color: gameResult === 'p1' ? c1 : c2 }}>
                {gameResult === 'p1' ? (mode === 'ai' ? 'You Win!' : 'P1 Wins!') : (mode === 'ai' ? 'AI Wins!' : 'P2 Wins!')}
              </h2>
              <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>{scores[0]} – {scores[1]}</p>
              <div className="flex gap-3">
                <button onClick={handleBack} className="flex-1 py-3 rounded-2xl font-bold text-sm"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                  {tournamentMode ? 'Next' : 'Back'}
                </button>
                {!tournamentMode
                  ? <button onClick={handleRestart} className="flex-1 py-3 rounded-2xl font-bold text-sm loft-btn-accent">Play Again</button>
                  : <button onClick={() => { if (gameResultRef.current && onGameEnd) onGameEnd(gameResultRef.current) }} className="flex-1 py-3 rounded-2xl font-bold text-sm loft-btn-accent">Next Game</button>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
