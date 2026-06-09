import { LayoutDashboard, Dumbbell, Wallet, Gamepad2 } from 'lucide-react'
import type { Tab } from '../types'

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }> }[] = [
  { id: 'dashboard', label: 'Home',     icon: LayoutDashboard },
  { id: 'workouts',  label: 'Workouts', icon: Dumbbell },
  { id: 'money',     label: 'Money',    icon: Wallet },
  { id: 'games',     label: 'Games',    icon: Gamepad2 },
]

interface Props {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

export default function TabBar({ activeTab, onTabChange }: Props) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 h-tab-bar flex items-start pt-2 pb-safe"
      style={{ background: 'rgba(10,14,26,0.92)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const active = activeTab === id
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className="flex-1 flex flex-col items-center gap-0.5 py-1 transition-colors"
          >
            <div
              className={`p-1.5 rounded-2xl transition-all ${active ? 'loft-glow-ring' : ''}`}
              style={active ? { background: 'rgba(59,158,255,0.15)' } : {}}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.4 : 1.7}
                style={{ color: active ? 'var(--loft-accent)' : 'var(--loft-faint)' }}
              />
            </div>
            <span
              className="text-[10px] font-semibold"
              style={{ color: active ? 'var(--loft-accent)' : 'var(--loft-faint)' }}
            >
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
