import { useState } from 'react'
import PasswordField from './PasswordField'
import PinPad from './PinPad'
import type { LockType } from './secure'

interface Props {
  lockType: LockType
  pinLength: number
  ctaLabel: string
  busy?: boolean
  onValid: (value: string) => void
}

const fieldLabel = (text: string) => (
  <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--loft-faint)' }}>{text}</p>
)

// Enter + confirm a NEW credential of a known type/length, then hand the validated
// value to the parent. Shared by first-time setup, recovery reset and Settings.
export default function CredentialEntry({ lockType, pinLength, ctaLabel, busy, onValid }: Props) {
  const [value, setValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [stage, setStage] = useState<'enter' | 'confirm'>('enter')
  const [error, setError] = useState('')

  if (lockType === 'password') {
    const submit = () => {
      setError('')
      if (value.length < 4) return setError('Password must be at least 4 characters')
      if (value !== confirm) return setError("Passwords don't match")
      onValid(value)
    }
    return (
      <div className="space-y-4">
        <div>
          {fieldLabel('New password')}
          <PasswordField value={value} onChange={setValue} placeholder="New password" autoFocus />
        </div>
        <div>
          {fieldLabel('Confirm password')}
          <PasswordField value={confirm} onChange={setConfirm} placeholder="Re-enter password" onEnter={submit} />
        </div>
        <button
          onClick={submit}
          disabled={busy}
          className="w-full py-3.5 rounded-xl font-semibold text-base transition-opacity disabled:opacity-60"
          style={{ background: 'var(--loft-accent)', color: '#04111f' }}
        >
          {ctaLabel}
        </button>
        {error && <p className="text-sm font-medium text-center" style={{ color: '#f87171' }}>{error}</p>}
      </div>
    )
  }

  // PIN: enter then re-enter to confirm.
  const onEnterComplete = (v: string) => {
    setValue(v)
    setStage('confirm')
    setError('')
  }
  const onConfirmComplete = (v: string) => {
    if (v !== value) {
      setError("PINs don't match")
      setConfirm('')
      return
    }
    onValid(v)
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-center" style={{ color: 'var(--loft-muted)' }}>
        {stage === 'enter' ? `Enter a ${pinLength}-digit PIN` : 'Re-enter your PIN to confirm'}
      </p>
      {stage === 'enter' ? (
        <PinPad value={value} length={pinLength} onChange={setValue} onComplete={onEnterComplete} disabled={busy} />
      ) : (
        <PinPad value={confirm} length={pinLength} onChange={setConfirm} onComplete={onConfirmComplete} disabled={busy} />
      )}
      {stage === 'confirm' && (
        <button
          onClick={() => {
            setStage('enter')
            setValue('')
            setConfirm('')
            setError('')
          }}
          className="w-full text-sm font-medium"
          style={{ color: 'var(--loft-muted)' }}
        >
          Start over
        </button>
      )}
      {error && <p className="text-sm font-medium text-center" style={{ color: '#f87171' }}>{error}</p>}
    </div>
  )
}
