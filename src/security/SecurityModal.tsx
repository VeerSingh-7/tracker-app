import { useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import PasswordField from './PasswordField'
import QuestionPicker from './QuestionPicker'
import { RECOVERY_QUESTIONS, verifyPassword, changePassword, changeRecovery } from './secure'

export type SecurityAction = 'password' | 'recovery'

interface Props {
  action: SecurityAction
  onClose: () => void
  onDone: (msg: string) => void
}

const textInputStyle = { background: 'var(--loft-card2)', color: 'var(--loft-text)', border: '1px solid var(--loft-border2)' }

export default function SecurityModal({ action, onClose, onDone }: Props) {
  const [step, setStep] = useState<'verify' | 'set'>('verify')
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [question, setQuestion] = useState<string>(RECOVERY_QUESTIONS[0])
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const title = action === 'password' ? 'Change password' : 'Change recovery question'

  async function handleVerify() {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (await verifyPassword(current)) {
        setError('')
        setStep('set')
      } else {
        setError('Incorrect password')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    if (busy) return
    setError('')
    if (action === 'password') {
      if (password.length < 4) return setError('Password must be at least 4 characters')
      if (password !== confirm) return setError("Passwords don't match")
    } else {
      if (!question.trim()) return setError('Please choose or write a recovery question')
      if (!answer.trim()) return setError('Please enter a recovery answer')
    }
    setBusy(true)
    try {
      if (action === 'password') {
        await changePassword(password)
        onDone('Password updated')
      } else {
        await changeRecovery(question.trim(), answer)
        onDone('Recovery question updated')
      }
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

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center px-6"
      style={{ background: 'rgba(5,8,16,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border p-6"
        style={{ background: 'var(--loft-card)', borderColor: 'var(--loft-border2)', boxShadow: 'var(--loft-card-shadow)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--loft-text)' }}>{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--loft-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {step === 'verify' ? (
          <div className="space-y-4">
            {fieldLabel('Current password')}
            <PasswordField value={current} onChange={setCurrent} placeholder="Current password" autoFocus onEnter={handleVerify} />
            {primaryBtn(busy ? 'Checking…' : 'Continue', handleVerify)}
          </div>
        ) : action === 'password' ? (
          <div className="space-y-4">
            <div>
              {fieldLabel('New password')}
              <PasswordField value={password} onChange={setPassword} placeholder="New password" autoFocus />
            </div>
            <div>
              {fieldLabel('Confirm password')}
              <PasswordField value={confirm} onChange={setConfirm} placeholder="Re-enter password" onEnter={handleSave} />
            </div>
            {primaryBtn(busy ? 'Saving…' : 'Save', handleSave)}
          </div>
        ) : (
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
            {primaryBtn(busy ? 'Saving…' : 'Save', handleSave)}
          </div>
        )}

        {error && (
          <p className="text-sm font-medium text-center mt-4" style={{ color: '#f87171' }}>{error}</p>
        )}
      </motion.div>
    </div>
  )
}
