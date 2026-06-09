import { Hash, KeySquare } from 'lucide-react'
import { PIN_LENGTHS, type LockType } from './secure'

export function LockTypeChooser({ onChoose }: { onChoose: (t: LockType) => void }) {
  const opts: { type: LockType; label: string; sub: string; icon: typeof Hash }[] = [
    { type: 'pin', label: 'PIN', sub: 'Numeric code (4–6 digits)', icon: Hash },
    { type: 'password', label: 'Password', sub: 'Letters, numbers & symbols', icon: KeySquare },
  ]
  return (
    <div className="space-y-3">
      {opts.map(({ type, label, sub, icon: Icon }) => (
        <button
          key={type}
          onClick={() => onChoose(type)}
          className="w-full rounded-2xl border p-4 flex items-center gap-4 text-left transition-opacity active:opacity-80"
          style={{ background: 'var(--loft-card2)', borderColor: 'var(--loft-border2)' }}
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(59,158,255,0.10)', border: '1px solid rgba(59,158,255,0.18)' }}
          >
            <Icon size={20} style={{ color: 'var(--loft-accent)' }} />
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--loft-text)' }}>{label}</p>
            <p className="text-sm" style={{ color: 'var(--loft-muted)' }}>{sub}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

export function PinLengthChooser({ onChoose }: { onChoose: (n: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {PIN_LENGTHS.map((n) => (
        <button
          key={n}
          onClick={() => onChoose(n)}
          className="rounded-2xl border py-5 flex flex-col items-center gap-0.5 transition-opacity active:opacity-80"
          style={{ background: 'var(--loft-card2)', borderColor: 'var(--loft-border2)' }}
        >
          <span className="text-2xl font-bold" style={{ color: 'var(--loft-text)' }}>{n}</span>
          <span className="text-xs" style={{ color: 'var(--loft-muted)' }}>digits</span>
        </button>
      ))}
    </div>
  )
}
