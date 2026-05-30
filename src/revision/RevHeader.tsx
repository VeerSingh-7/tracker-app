import { ChevronLeft } from 'lucide-react'

// Shared header for nested Revision screens (back button + title + optional action).
export default function RevHeader({ title, subtitle, accent, onBack, right }: {
  title: string
  subtitle?: string
  accent?: string
  onBack: () => void
  right?: React.ReactNode
}) {
  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-3 pb-3"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)', background: 'var(--loft-bg2)', borderBottom: '1px solid var(--loft-border)' }}>
      <button onClick={onBack} className="p-2 rounded-xl flex-shrink-0" style={{ background: 'var(--loft-card)' }}>
        <ChevronLeft size={20} style={{ color: 'var(--loft-text)' }} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-bold truncate leading-tight" style={{ color: accent ?? 'var(--loft-text)' }}>{title}</h1>
        {subtitle && <p className="text-xs truncate" style={{ color: 'var(--loft-muted)' }}>{subtitle}</p>}
      </div>
      {right && <div className="flex-shrink-0 flex items-center gap-1.5">{right}</div>}
    </div>
  )
}
