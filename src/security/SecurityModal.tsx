import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, ArrowLeft } from 'lucide-react'
import PasswordField from './PasswordField'
import PinPad from './PinPad'
import QuestionPicker from './QuestionPicker'
import CredentialEntry from './CredentialEntry'
import { LockTypeChooser, PinLengthChooser } from './LockChoosers'
import {
  RECOVERY_QUESTIONS,
  getLockInfo,
  verifyPassword,
  changeCredential,
  changeRecovery,
  type LockType,
} from './secure'

export type SecurityAction = 'passcode' | 'recovery'

interface Props {
  action: SecurityAction
  onClose: () => void
  onDone: (msg: string) => void
}

const textInputStyle = { background: 'var(--loft-card2)', color: 'var(--loft-text)', border: '1px solid var(--loft-border2)' }

export default function SecurityModal({ action, onClose, onDone }: Props) {
  const [step, setStep] = useState<'verify' | 'set'>('verify')
  const [passStep, setPassStep] = useState<'type' | 'length' | 'credential'>('type')
  const [current, setCurrent] = useState('')
  const [info, setInfo] = useState<{ type: LockType; pinLength: number } | null>(null)
  const [lockType, setLockType] = useState<LockType>('password')
  const [pinLength, setPinLength] = useState(4)
  const [question, setQuestion] = useState<string>(RECOVERY_QUESTIONS[0])
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getLockInfo().then(setInfo)
  }, [])

  const title = action === 'passcode' ? 'Change passcode' : 'Change recovery question'

  async function handleVerify(input?: string) {
    if (busy) return
    const candidate = input ?? current
    setError('')
    setBusy(true)
    try {
      if (await verifyPassword(candidate)) {
        setError('')
        setStep('set')
        setPassStep('type')
      } else {
        setError(info?.type === 'pin' ? 'Incorrect PIN' : 'Incorrect password')
        setCurrent('')
      }
    } finally {
      setBusy(false)
    }
  }

  function chooseType(t: LockType) {
    setLockType(t)
    setError('')
    setPassStep(t === 'pin' ? 'length' : 'credential')
  }

  async function onNewCredential(v: string) {
    if (busy) return
    setBusy(true)
    try {
      await changeCredential(v, lockType, lockType === 'pin' ? pinLength : undefined)
      onDone('Passcode updated')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveRecovery() {
    if (busy) return
    setError('')
    if (!question.trim()) return setError('Please choose or write a recovery question')
    if (!answer.trim()) return setError('Please enter a recovery answer')
    setBusy(true)
    try {
      await changeRecovery(question.trim(), answer)
      onDone('Recovery question updated')
    } finally {
      setBusy(false)
    }
  }

  const fieldLabel = (text: string) => (
    <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--loft-faint)' }}>{text}</p>
  )

  const primaryBtn = (label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full py-3.5 rounded-xl font-semibold text-base transition-opacity disabled:opacity-60"
      style={{ background: 'var(--loft-accent)', color: '#04111f' }}
    >
      {label}
    </button>
  )

  // ── Body per step ─────────────────────────────────────────────────────────
  let body: React.ReactNode
  if (step === 'verify') {
    body = (
      <div className="space-y-5">
        {info?.type === 'pin' ? (
          <>
            <p className="text-sm text-center" style={{ color: 'var(--loft-muted)' }}>Enter your current PIN</p>
            <PinPad value={current} length={info.pinLength} onChange={setCurrent} onComplete={(v) => handleVerify(v)} disabled={busy} />
          </>
        ) : (
          <>
            {fieldLabel('Current password')}
            <PasswordField value={current} onChange={setCurrent} placeholder="Current password" autoFocus onEnter={() => handleVerify()} />
            {primaryBtn(busy ? 'Checking…' : 'Continue', () => handleVerify())}
          </>
        )}
      </div>
    )
  } else if (action === 'recovery') {
    body = (
      <div className="space-y-4">
        <div>
          {fieldLabel('Recovery question')}
          <QuestionPicker onChange={setQuestion} />
        </div>
        <div>
          {fieldLabel('Recovery answer')}
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer"
            autoCapitalize="off"
            autoCorrect="off"
            className="w-full rounded-xl px-4 py-3 text-base outline-none"
            style={textInputStyle}
          />
        </div>
        {primaryBtn(busy ? 'Saving…' : 'Save', handleSaveRecovery)}
      </div>
    )
  } else if (passStep === 'type') {
    body = (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: 'var(--loft-muted)' }}>Choose a new lock type.</p>
        <LockTypeChooser onChoose={chooseType} />
      </div>
    )
  } else if (passStep === 'length') {
    body = (
      <div className="space-y-3">
        <button onClick={() => setPassStep('type')} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--loft-muted)' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <PinLengthChooser onChoose={(n) => { setPinLength(n); setPassStep('credential') }} />
      </div>
    )
  } else {
    body = (
      <div className="space-y-3">
        <button onClick={() => setPassStep(lockType === 'pin' ? 'length' : 'type')} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--loft-muted)' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <CredentialEntry
          key={`change-${lockType}-${pinLength}`}
          lockType={lockType}
          pinLength={pinLength}
          ctaLabel={busy ? 'Saving…' : 'Save'}
          busy={busy}
          onValid={onNewCredential}
        />
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center px-6 py-6 overflow-y-auto"
      style={{ background: 'rgba(5,8,16,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border p-6 my-auto"
        style={{ background: 'var(--loft-card)', borderColor: 'var(--loft-border2)', boxShadow: 'var(--loft-card-shadow)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--loft-text)' }}>{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--loft-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {body}

        {error && <p className="text-sm font-medium text-center mt-4" style={{ color: '#f87171' }}>{error}</p>}
      </motion.div>
    </div>
  )
}
