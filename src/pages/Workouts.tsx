import { useState, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TrackerTab from '../workouts/TrackerTab'
import LibraryTab from '../workouts/LibraryTab'
import ProgressTab from '../workouts/ProgressTab'
import BodygraphTab from '../workouts/BodygraphTab'
import AchievementsTab from '../workouts/AchievementsTab'
import DailyQuestTab from '../workouts/DailyQuestTab'
import HistoryTab from '../workouts/HistoryTab'
import ShopTab from '../workouts/ShopTab'
import TopBar from '../components/TopBar'
import type { WorkoutSubTab } from '../types'

const TABS: { id: WorkoutSubTab; label: string; emoji: string }[] = [
  { id: 'tracker',      label: 'Tracker',    emoji: '⚡' },
  { id: 'library',      label: 'Library',    emoji: '📚' },
  { id: 'progress',     label: 'Progress',   emoji: '📈' },
  { id: 'bodygraph',    label: 'Bodygraph',  emoji: '🫀' },
  { id: 'achievements', label: 'Badges',     emoji: '🏆' },
  { id: 'quest',        label: 'Quest',      emoji: '🎯' },
  { id: 'history',      label: 'History',    emoji: '📋' },
  { id: 'shop',         label: 'Shop',       emoji: '🛍️' },
]

const TAB_INDEX: Record<WorkoutSubTab, number> = Object.fromEntries(
  TABS.map((t, i) => [t.id, i])
) as Record<WorkoutSubTab, number>

const variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 28 : -28 }),
  center: { opacity: 1, x: 0 },
  exit:  (dir: number) => ({ opacity: 0, x: dir > 0 ? -28 : 28 }),
}

export default function Workouts() {
  const [activeTab, setActiveTab] = useState<WorkoutSubTab>('tracker')
  const [prevTab, setPrevTab]     = useState<WorkoutSubTab>('tracker')
  const navRef = useRef<HTMLDivElement>(null)

  const dir = TAB_INDEX[activeTab] - TAB_INDEX[prevTab]

  function changeTab(id: WorkoutSubTab) {
    if (id === activeTab) return
    setPrevTab(activeTab)
    setActiveTab(id)
    setTimeout(() => {
      const btn = navRef.current?.querySelector(`[data-tab="${id}"]`) as HTMLElement | null
      btn?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    }, 0)
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'tracker':      return <TrackerTab />
      case 'library':      return <LibraryTab onNavigate={changeTab} />
      case 'progress':     return <ProgressTab />
      case 'bodygraph':    return <BodygraphTab />
      case 'achievements': return <AchievementsTab />
      case 'quest':        return <DailyQuestTab />
      case 'history':      return <HistoryTab />
      case 'shop':         return <ShopTab />
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      {/* TopBar: level, streak, coins */}
      <TopBar />

      {/* Page header */}
      <div
        className="flex-shrink-0 px-5 pt-3 pb-3"
        style={{ background: 'var(--loft-bg2)', borderBottom: '1px solid var(--loft-border)' }}
      >
        <h1 className="text-xl font-extrabold tracking-tight mb-3" style={{ color: 'var(--loft-text)' }}>
          Workouts
        </h1>

        {/* Sub-tab pill strip */}
        <div
          ref={navRef}
          className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1"
        >
          {TABS.map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                data-tab={tab.id}
                onClick={() => changeTab(tab.id)}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200"
                style={active ? {
                  background: 'linear-gradient(135deg, var(--loft-accent), var(--loft-accent2))',
                  boxShadow: 'var(--loft-glow-sm)',
                  color: '#fff',
                } : {
                  background: 'var(--loft-card)',
                  color: 'var(--loft-muted)',
                  border: '1px solid var(--loft-border)',
                }}
              >
                <span className="text-sm leading-none">{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={activeTab}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="h-full overflow-y-auto scroll-area pb-tab-bar"
          >
            {renderTab()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
