import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Settings2, Dumbbell, Wallet, Gamepad2, Zap, TrendingUp, ChevronRight } from 'lucide-react'
import { format, startOfMonth, startOfWeek } from 'date-fns'
import Card from '../components/Card'
import { getWorkouts, getSpending, getIncome, getAllGameScores, getUserProgress } from '../db'
import { formatCurrency } from '../utils'
import { calcLevel } from '../workouts/utils'
import type { Tab } from '../types'

interface Props {
  onTabChange: (tab: Tab) => void
  onSettings: () => void
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard({ onTabChange, onSettings }: Props) {
  const [weekWorkouts, setWeekWorkouts] = useState(0)
  const [lastWorkout, setLastWorkout]   = useState<string | null>(null)
  const [monthNet, setMonthNet]         = useState<number | null>(null)
  const [gamesPlayed, setGamesPlayed]   = useState(0)
  const [userLevel, setUserLevel]       = useState(1)
  const [totalXP, setTotalXP]           = useState(0)
  const [streak, setStreak]             = useState(0)
  const [coins, setCoins]               = useState(0)

  useEffect(() => {
    const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
    const weekStart  = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

    getWorkouts().then(workouts => {
      if (workouts.length) setLastWorkout(workouts[0].date)
      setWeekWorkouts(workouts.filter(w => w.date >= weekStart).length)
    })

    Promise.all([getSpending(), getIncome()]).then(([spending, income]) => {
      const monthSpend  = spending.filter(s => s.date >= monthStart).reduce((sum, s) => sum + s.amount, 0)
      const monthIncome = income.filter(i => i.date >= monthStart).reduce((sum, i) => sum + i.amount, 0)
      setMonthNet(monthIncome - monthSpend)
    })

    getAllGameScores().then(scores => setGamesPlayed(scores.length))

    getUserProgress().then(p => {
      const lv = calcLevel(p.totalXP)
      setUserLevel(lv)
      setTotalXP(p.totalXP)
      setStreak(p.currentStreak)
      setCoins(p.coins)
    })
  }, [])

  const netPositive = monthNet !== null && monthNet >= 0

  const summaryCards = [
    {
      tab: 'workouts' as Tab,
      icon: Dumbbell,
      accent: '#818cf8',
      label: 'Workouts',
      value: weekWorkouts > 0
        ? `${weekWorkouts}`
        : lastWorkout
          ? format(new Date(lastWorkout + 'T00:00:00'), 'MMM d')
          : '—',
      sub: weekWorkouts > 0
        ? 'sessions this week'
        : lastWorkout ? 'last session' : 'Log a workout!',
    },
    {
      tab: 'money' as Tab,
      icon: Wallet,
      accent: netPositive ? '#34d399' : '#f87171',
      label: 'Money',
      value: monthNet !== null
        ? (monthNet >= 0 ? `+${formatCurrency(monthNet)}` : formatCurrency(monthNet))
        : '—',
      sub: 'net this month',
    },
    {
      tab: 'games' as Tab,
      icon: Gamepad2,
      accent: '#c084fc',
      label: 'Games',
      value: gamesPlayed > 0 ? `${gamesPlayed}/5` : '—',
      sub: gamesPlayed > 0 ? 'games played' : 'Play a game!',
    },
    {
      tab: 'workouts' as Tab,
      icon: Zap,
      accent: 'var(--loft-accent)',
      label: 'Level',
      value: `LVL ${userLevel}`,
      sub: totalXP > 0 ? `${totalXP.toLocaleString()} XP` : 'Earn XP',
    },
  ]

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      {/* Header */}
      <div
        className="flex-shrink-0 safe-top px-5 pt-5 pb-5"
        style={{ background: 'var(--loft-bg2)', borderBottom: '1px solid var(--loft-border)' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--loft-muted)' }}>
              {format(new Date(), 'EEEE, MMMM d')}
            </p>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--loft-text)' }}>
              {getGreeting()} 👋
            </h1>
          </div>
          <button
            onClick={onSettings}
            className="mt-1 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}
          >
            <Settings2 size={17} style={{ color: 'var(--loft-muted)' }} />
          </button>
        </div>

        {/* Quick stats */}
        <div
          className="mt-4 rounded-2xl grid grid-cols-3 border"
          style={{
            background: 'var(--loft-card)',
            borderColor: 'var(--loft-border)',
          }}
        >
          <div className="text-center py-3 px-2">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Dumbbell size={11} style={{ color: '#818cf8' }} />
              <p className="text-lg font-black" style={{ color: 'var(--loft-text)' }}>{weekWorkouts}</p>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--loft-muted)' }}>workouts/wk</p>
          </div>
          <div className="text-center py-3 px-2">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <TrendingUp size={11} style={{ color: netPositive ? '#34d399' : '#f87171' }} />
              <p className="text-lg font-black" style={{ color: netPositive ? '#34d399' : '#f87171' }}>
                {monthNet !== null
                  ? (monthNet >= 0 ? `+£${Math.round(monthNet)}` : `-£${Math.round(Math.abs(monthNet))}`)
                  : '—'}
              </p>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--loft-muted)' }}>net/month</p>
          </div>
          <div className="text-center py-3 px-2">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Zap size={11} style={{ color: 'var(--loft-accent)' }} />
              <p className="text-lg font-black" style={{ color: 'var(--loft-text)' }}>{userLevel}</p>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--loft-muted)' }}>XP level</p>
          </div>
        </div>
      </div>

      <div className="scroll-area flex-1 pb-tab-bar px-5 pt-5">
        {/* Streak + coins strip */}
        {(streak > 0 || coins > 0) && (
          <div className="flex gap-3 mb-5">
            {streak > 0 && (
              <div
                className="flex-1 flex items-center gap-2.5 rounded-2xl px-4 py-3 border"
                style={{ background: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.20)' }}
              >
                <span className="text-lg">🔥</span>
                <div>
                  <p className="text-sm font-black" style={{ color: '#f97316' }}>{streak} day streak</p>
                  <p className="text-xs" style={{ color: 'var(--loft-muted)' }}>Keep it up!</p>
                </div>
              </div>
            )}
            {coins > 0 && (
              <div
                className="flex-1 flex items-center gap-2.5 rounded-2xl px-4 py-3 border"
                style={{ background: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.20)' }}
              >
                <span className="text-lg">🪙</span>
                <div>
                  <p className="text-sm font-black" style={{ color: '#fbbf24' }}>{coins.toLocaleString()}</p>
                  <p className="text-xs" style={{ color: 'var(--loft-muted)' }}>coins</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary cards */}
        <p className="text-[11px] font-bold tracking-widest mb-3" style={{ color: 'var(--loft-faint)' }}>
          OVERVIEW
        </p>
        <div className="grid grid-cols-2 gap-3">
          {summaryCards.map(({ tab, icon: Icon, accent, label, value, sub }, i) => (
            <motion.div
              key={`${tab}-${label}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <Card onClick={() => onTabChange(tab)} className="relative overflow-hidden">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
                >
                  <Icon size={18} style={{ color: accent }} />
                </div>
                <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--loft-muted)' }}>{label}</p>
                <p
                  className="text-xl font-black leading-tight"
                  style={{ color: value === '—' ? 'var(--loft-faint)' : 'var(--loft-text)' }}
                >
                  {value}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--loft-muted)' }}>{sub}</p>
                <ChevronRight
                  size={14}
                  className="absolute top-4 right-4"
                  style={{ color: 'var(--loft-faint)' }}
                />
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
