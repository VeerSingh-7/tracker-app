import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react'
import PasswordField from './PasswordField'
import QuestionPicker from './QuestionPicker'
import {
  RECOVERY_QUESTIONS,
  hasPasswordSet,
  verifyPassword,
  verifyRecoveryAnswer,
  setupSecurity,
  changePassword,
  getRecoveryQuestion,
} from './secure'

type Mode = 'loading' | 'setup' | 'login' | 'recovery' | 'reset'

interface Props {
  onUnlock: () => void
}

const textInputStyle = { background: 'var(--loft-card2)', color: 'var(--loft-text)', border: '1px solid var(--loft-border2)' }

export default function LockScreen({ onUnlock }: Props) {
  const [mode, setMode] = useState<Mode>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [question, setQuestion] = useState<string>(RECOVERY_QUESTIONS[0])
  const [answer, setAnswer] = useState('')
  const [recoveryQuestion, setRecoveryQuestion] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    hasPasswordSet().then((exists) => setMode(exists ? 'login' : 'setup'))
  }, [])

  function resetFields() {
    setPassword('')
    setConfirm('')
    setAnswer('')
    setError('')
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleSetup() {
    if (busy) return
    setError('')
    if (password.length < 4) return setError('Password must be at least 4 characters')
    if (password !== confirm) return setError("Passwords don't match")
    if (!question.trim()) return setError('Please choose or write a recovery question')
    if (!answer.trim()) return setError('Please enter a recovery answer')
    setBusy(true)
    try {
      await setupSecurity(password, question.trim(), answer)
      onUnlock()
    } finally {
      setBusy(false)
    }
  }

  async function handleLogin() {
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (await verifyPassword(password)) {
        onUnlock()
      } else {
        setError('Incorrect password')
        setPassword('')
      }
    } finally {
      setBusy(false)
    }
  }

  async function openRecovery() {
    resetFields()
    const q = await getRecoveryQuestion()
    setRecoveryQuestion(q ?? '')
    setMode('recovery')
  }

  async function handleRecoveryCheck() {
    if (busy) return
    setError('')
    if (!answer.trim()) return setError('Please enter your answer')
    setBusy(true)
    try {
      if (await verifyRecoveryAnswer(answer)) {
        resetFields()
        setMode('reset')
      } else {
        setError('Incorrect answer')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    if (busy) return
    setError('')
    if (password.length < 4) return setError('Password must be at least 4 characters')
    if (password !== confirm) return setError("Passwords don't match")
    setBusy(true)
    try {
      await changePassword(password)
      onUnlock()
    } finally {
      setBusy(false)
    }
  }

  // ── Shared shell ──────────────────────────────────────────────────────────
  const shell = (icon: React.ReactNode, title: string, subtitle: string, body: React.ReactNode) => (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6"
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
        className="w-full max-w-sm rounded-3xl border p-6"
        style={{ background: 'var(--loft-card)', borderColor: 'var(--loft-border2)', boxShadow: 'var(--loft-card-shadow)' }}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(59,158,255,0.12)', border: '1px solid rgba(59,158,255,0.22)', boxShadow: 'var(--loft-glow-sm)' }}
          >
            {icon}
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--loft-text)' }}>{title}</h1>
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--loft-muted)' }}>{subtitle}</p>
        </div>
        {body}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm font-medium text-center mt-4"
            style={{ color: '#f87171' }}
          >
            {error}
          </motion.p>
        )}
      </motion.div>
    </div>
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

  const fieldLabel = (text: string) => (
    <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--loft-faint)' }}>{text}</p>
  )

  // ── Views ─────────────────────────────────────────────────────────────────
  if (mode === 'loading') {
    return <div className="fixed inset-0 z-[100]" style={{ background: 'var(--loft-bg)' }} />
  }

  if (mode === 'setup') {
    return shell(
      <ShieldCheck size={30} style={{ color: 'var(--loft-accent)' }} />,
      'Set up your password',
      'Protect Tracker on this device.',
      <div className="space-y-4">
        <div>
          {fieldLabel('Password')}
          <PasswordField value={password} onChange={setPassword} placeholder="Choose a password" autoFocus />
        </div>
        <div>
          {fieldLabel('Confirm password')}
          <PasswordField value={confirm} onChange={setConfirm} placeholder="Re-enter password" />
        </div>
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
        <p className="text-xs leading-relaxed" style={{ color: 'var(--loft-faint)' }}>
          This keeps the app private on shared devices. It's not bank-level security. Your password and answer are
          hashed — if you forget both, they can't be recovered, only reset.
        </p>
        <div className="pt-1">{primaryBtn(busy ? 'Saving…' : 'Save & unlock', handleSetup)}</div>
      </div>,
    )
  }

  if (mode === 'login') {
    return shell(
      <Lock size={28} style={{ color: 'var(--loft-accent)' }} />,
      'Tracker',
      'Enter your password to unlock.',
      <div className="space-y-4">
        <PasswordField value={password} onChange={setPassword} placeholder="Password" autoFocus onEnter={handleLogin} />
        {primaryBtn(busy ? 'Unlocking…' : 'Unlock', handleLogin)}
        <button
          onClick={openRecovery}
          className="w-full text-sm font-medium pt-1"
          style={{ color: 'var(--loft-accent)' }}
        >
          Forgot password?
        </button>
      </div>,
    )
  }

  if (mode === 'recovery') {
    return shell(
      <KeyRound size={28} style={{ color: 'var(--loft-accent)' }} />,
      'Account recovery',
      recoveryQuestion || 'Answer your recovery question.',
      <div className="space-y-4">
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRecoveryCheck()
          }}
          placeholder="Your answer"
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          className="w-full rounded-xl px-4 py-3 text-base outline-none"
          style={textInputStyle}
        />
        {primaryBtn(busy ? 'Checking…' : 'Continue', handleRecoveryCheck)}
        <button
          onClick={() => {
            resetFields()
            setMode('login')
          }}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium pt-1"
          style={{ color: 'var(--loft-muted)' }}
        >
          <ArrowLeft size={15} /> Back to login
        </button>
      </div>,
    )
  }

  // mode === 'reset'
  return shell(
    <KeyRound size={28} style={{ color: 'var(--loft-accent)' }} />,
    'Set a new password',
    'Your recovery answer was correct.',
    <div className="space-y-4">
      <div>
        {fieldLabel('New password')}
        <PasswordField value={password} onChange={setPassword} placeholder="New password" autoFocus />
      </div>
      <div>
        {fieldLabel('Confirm password')}
        <PasswordField value={confirm} onChange={setConfirm} placeholder="Re-enter password" onEnter={handleReset} />
      </div>
      {primaryBtn(busy ? 'Saving…' : 'Save & unlock', handleReset)}
    </div>,
  )
}
