import { useEffect, useState } from 'react'
import { Settings2, Plus } from 'lucide-react'
import { getUserProgress } from '../db'
import { calcNextLevelXP, calcLevelXP, calcLevel } from '../workouts/utils'

interface Props {
  onSettings?: () => void
  showAdd?: boolean
  onAdd?: () => void
  pageTitle?: string
}

function CoinSVG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8" fill="url(#coinGrad)" />
      <circle cx="9" cy="9" r="6" fill="none" stroke="rgba(255,220,80,0.5)" strokeWidth="0.8" />
      <text x="9" y="13" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#7a4800">$</text>
      <defs>
        <radialGradient id="coinGrad" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffe066" />
          <stop offset="100%" stopColor="#e6a100" />
        </radialGradient>
      </defs>
    </svg>
  )
}

function FlameSVG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 22" className="flame-anim" fill="none">
      <path
        d="M9 21C5 21 2 18 2 14.5C2 11.5 4 9.5 4 9.5C4 9.5 4.5 12 6.5 12C5 10 5 7 7 4.5C7 6.5 9 8 9 8C9 8 10 5 10 3C13 5.5 16 9 16 14.5C16 18 13 21 9 21Z"
        fill="url(#flameGrad)"
      />
      <path
        d="M9 18C7.5 18 6 16.5 6 14.8C6 13.3 7 12.3 7 12.3C7 13.5 8 14 9 14C10 14 10.5 13 10.5 12C12 13 13 14 13 14.8C13 16.5 11.5 18 9 18Z"
        fill="url(#flameCore)"
      />
      <defs>
        <linearGradient id="flameGrad" x1="9" y1="21" x2="9" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="60%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id="flameCore" x1="9" y1="18" x2="9" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#fffbeb" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function LevelRing({ level, progress }: { level: number; progress: number }) {
  const r = 16
  const circ = 2 * Math.PI * r
  const dash = circ * Math.max(0, Math.min(1, progress))

  return (
    <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
      <svg width="40" height="40" className="absolute inset-0 -rotate-90">
        {/* track */}
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
        {/* progress */}
        <circle
          cx="20" cy="20" r={r} fill="none"
          stroke="var(--loft-accent)" strokeWidth="2.5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      {/* Avatar placeholder */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center"
        style={{ background: 'var(--loft-card2)', border: '1px solid var(--loft-border2)' }}
      >
        <span className="text-[9px] font-black" style={{ color: 'var(--loft-accent)' }}>
          {level}
        </span>
      </div>
    </div>
  )
}

export default function TopBar({ onSettings, showAdd, onAdd }: Props) {
  const [level, setLevel]    = useState(1)
  const [progress, setProgress] = useState(0)
  const [streak, setStreak]  = useState(0)
  const [coins, setCoins]    = useState(0)

  useEffect(() => {
    getUserProgress().then(p => {
      const lv = calcLevel(p.totalXP)
      const lvXP = calcLevelXP(lv)
      const nxXP = calcNextLevelXP(lv)
      setLevel(lv)
      setProgress(nxXP === lvXP ? 1 : (p.totalXP - lvXP) / (nxXP - lvXP))
      setStreak(p.currentStreak)
      setCoins(p.coins)
    })
  }, [])

  return (
    <div
      className="flex-shrink-0 flex items-center gap-3 px-4 py-2"
      style={{ background: 'var(--loft-bg2)', borderBottom: '1px solid var(--loft-border)' }}
    >
      {/* Level ring */}
      <LevelRing level={level} progress={progress} />

      {/* Level label */}
      <div className="flex flex-col leading-none">
        <span className="text-[10px] font-semibold" style={{ color: 'var(--loft-muted)' }}>LEVEL</span>
        <span className="text-sm font-black" style={{ color: 'var(--loft-text)' }}>Lv.&nbsp;{level}</span>
      </div>

      <div className="flex-1" />

      {/* Streak */}
      <div className="flex items-center gap-1">
        <FlameSVG size={18} />
        <span className="text-sm font-bold tabular-nums" style={{ color: '#f97316' }}>{streak}</span>
      </div>

      {/* Coins */}
      <div className="flex items-center gap-1">
        <CoinSVG />
        <span className="text-sm font-bold tabular-nums" style={{ color: '#fbbf24' }}>{coins}</span>
      </div>

      {/* Action button */}
      {showAdd && onAdd ? (
        <button
          onClick={onAdd}
          className="w-8 h-8 rounded-full flex items-center justify-center loft-btn-accent"
        >
          <Plus size={16} />
        </button>
      ) : (
        <button
          onClick={onSettings}
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}
        >
          <Settings2 size={16} style={{ color: 'var(--loft-muted)' }} />
        </button>
      )}
    </div>
  )
}
