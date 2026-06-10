import { useState } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { Lock } from 'lucide-react'
import PinPad from './PinPad'
import { MASTER_PIN_LENGTH, verifyMasterPin } from './secure'

interface Props {
  onUnlock: () => void
}

export default function LockScreen({ onUnlock }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const shake = useAnimationControls()

  async function handleComplete(pin: string) {
    if (busy) return
    setBusy(true)
    if (await verifyMasterPin(pin)) {
      onUnlock()
    } else {
      setError('Incorrect PIN')
      setValue('')
      shake.start({ x: [0, -10, 10, -8, 8, -4, 4, 0], transition: { duration: 0.5 } })
      setBusy(false)
    }
  }

  function handleChange(v: string) {
    if (error) setError('')
    setValue(v)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 overflow-y-auto"
      style={{
        background: 'var(--loft-bg)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-sm rounded-3xl border p-6 my-auto"
        style={{ background: 'var(--loft-card)', borderColor: 'var(--loft-border2)', boxShadow: 'var(--loft-card-shadow)' }}
      >
        <motion.div animate={shake}>
          <div className="flex flex-col items-center text-center mb-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(59,158,255,0.12)', border: '1px solid rgba(59,158,255,0.22)', boxShadow: 'var(--loft-glow-sm)' }}
            >
              <Lock size={28} style={{ color: 'var(--loft-accent)' }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--loft-text)' }}>Tracker</h1>
            <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--loft-muted)' }}>Enter your PIN to unlock.</p>
          </div>

          <PinPad
            value={value}
            length={MASTER_PIN_LENGTH}
            onChange={handleChange}
            onComplete={handleComplete}
            disabled={busy}
          />

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm font-medium text-center mt-5"
              style={{ color: '#f87171' }}
            >
              {error}
            </motion.p>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}
