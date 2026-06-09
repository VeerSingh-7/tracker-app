import { Delete } from 'lucide-react'

interface Props {
  value: string
  length: number
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  disabled?: boolean
}

const keyStyle = { background: 'var(--loft-card2)', color: 'var(--loft-text)', border: '1px solid var(--loft-border2)' }

// Numeric keypad + filled dots. Auto-fires onComplete once `length` digits are entered.
export default function PinPad({ value, length, onChange, onComplete, disabled }: Props) {
  function press(d: string) {
    if (disabled || value.length >= length) return
    const next = value + d
    onChange(next)
    if (next.length === length) onComplete?.(next)
  }
  function back() {
    if (disabled) return
    onChange(value.slice(0, -1))
  }

  return (
    <div className="flex flex-col items-center gap-7">
      {/* PIN-length dots */}
      <div className="flex gap-3.5">
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length
          return (
            <div
              key={i}
              className="w-3.5 h-3.5 rounded-full transition-all"
              style={{
                background: filled ? 'var(--loft-accent)' : 'transparent',
                border: `1.5px solid ${filled ? 'var(--loft-accent)' : 'var(--loft-border2)'}`,
                boxShadow: filled ? 'var(--loft-glow-sm)' : 'none',
              }}
            />
          )
        })}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[270px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            disabled={disabled}
            className="aspect-square rounded-2xl text-2xl font-semibold transition-opacity active:opacity-60 disabled:opacity-50"
            style={keyStyle}
          >
            {k}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => press('0')}
          disabled={disabled}
          className="aspect-square rounded-2xl text-2xl font-semibold transition-opacity active:opacity-60 disabled:opacity-50"
          style={keyStyle}
        >
          0
        </button>
        <button
          type="button"
          onClick={back}
          disabled={disabled || value.length === 0}
          aria-label="Delete"
          className="aspect-square rounded-2xl flex items-center justify-center transition-opacity active:opacity-60 disabled:opacity-30"
          style={{ color: 'var(--loft-muted)' }}
        >
          <Delete size={24} />
        </button>
      </div>
    </div>
  )
}
