import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react'
import PasswordField from './PasswordField'
import PinPad from './PinPad'
import QuestionPicker from './QuestionPicker'
import CredentialEntry from './CredentialEntry'
import { LockTypeChooser, PinLengthChooser } from './LockChoosers'
import {
  RECOVERY_QUESTIONS,
  getLockInfo,
  verifyPassword,
  verifyRecoveryAnswer,
  setupSecurity,
  changeCredential,
  getRecoveryQuestion,
  type LockType,
} from './secure'

type Mode = 'loading' | 'setup' | 'login' | 'recovery' | 'reset'
// Sub-steps for the setup & reset credential flows.
type Step = 'type' | 'length' | 'credential' | 'recovery'

interface Props {
  onUnlock: () => void
}

const textInputStyle = { background: 'var(--loft-card2)', color: 'var(--loft-text)', border: '1px solid var(--loft-border2)' }

export default function LockScreen({ onUnlock }: Props) {
  const [mode, setMode] = useState<Mode>('loading')
  const [step, setStep] = useState<Step>('type')

  // Chosen during setup/reset
  const [lockType, setLockType] = useState<LockType>('password')
  const [pinLength, setPinLength] = useState(4)
  const [credential, setCredential] = useState('') // validated new credential awaiting save

  // Stored credential type, for the login screen
  const [loginType, setLoginType] = useState<LockType>('password')
  const [loginPinLength, setLoginPinLength] = useState(4)

  const [value, setValue] = useState('') // login input
  const [question, setQuestion] = useState<string>(RECOVERY_QUESTIONS[0])
  const [answer, setAnswer] = useState('')
  const [recoveryQuestion, setRecoveryQuestion] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getLockInfo().then((info) => {
      if (!info) {
        setMode('setup')
        setStep('type')
      } else {
        setLoginType(info.type)
        setLoginPinLength(info.pinLength)
        setMode('login')
      }
    })
  }, [])

  // ── Login ───────────────────────────────────────────────────────────────
  async function handleLogin(input?: string) {
    if (busy) return
    const candidate = input ?? value
    setError('')
    setBusy(true)
    try {
      if (await verifyPassword(candidate)) {
        onUnlock()
      } else {
        setError(loginType === 'pin' ? 'Incorrect PIN' : 'Incorrect password')
        setValue('')
      }
    } finally {
      setBusy(false)
    }
  }

  // ── Setup ───────────────────────────────────────────────────────────────
  function chooseSetupType(t: LockType) {
    setLockType(t)
    setError('')
    setStep(t === 'pin' ? 'length' : 'credential')
  }
  function chooseLength(n: number) {
    setPinLength(n)
    setStep('credential')
  }
  function onSetupCredential(v: string) {
    setCredential(v)
    setError('')
    setStep('recovery')
  }
  async function handleFinishSetup() {
    if (busy) return
    setError('')
    if (!question.trim()) return setError('Please choose or write a recovery question')
    if (!answer.trim()) return setError('Please enter a recovery answer')
    setBusy(true)
    try {
      await setupSecurity(credential, question.trim(), answer, lockType, lockType === 'pin' ? pinLength : undefined)
      onUnlock()
    } finally {
      setBusy(false)
    }
  }

  // ── Recovery → reset ──────────────────────────────────────────────────────
  async function openRecovery() {
    setValue('')
    setAnswer('')
    setError('')
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
        setError('')
        setMode('reset')
        setStep('type')
      } else {
        setError('Incorrect answer')
      }
    } finally {
      setBusy(false)
    }
  }
  function chooseResetType(t: LockType) {
    setLockType(t)
    setError('')
    setStep(t === 'pin' ? 'length' : 'credential')
  }
  async function onResetCredential(v: string) {
    if (busy) return
    setBusy(true)
    try {
      await changeCredential(v, lockType, lockType === 'pin' ? pinLength : undefined)
      onUnlock()
    } finally {
      setBusy(false)
    }
  }

  // ── Shared shell ──────────────────────────────────────────────────────────
  const shell = (
    icon: React.ReactNode,
    title: string,
    subtitle: string,
    body: React.ReactNode,
    onBack?: () => void,
  ) => (
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
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium mb-4"
            style={{ color: 'var(--loft-muted)' }}
          >
            <ArrowLeft size={15} /> Back
          </button>
        )}
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
    if (step === 'type') {
      return shell(
        <ShieldCheck size={30} style={{ color: 'var(--loft-accent)' }} />,
        'Set up your lock',
        'Choose how you want to unlock Tracker.',
        <LockTypeChooser onChoose={chooseSetupType} />,
      )
    }
    if (step === 'length') {
      return shell(
        <ShieldCheck size={30} style={{ color: 'var(--loft-accent)' }} />,
        'PIN length',
        'How many digits would you like?',
        <PinLengthChooser onChoose={chooseLength} />,
        () => setStep('type'),
      )
    }
    if (step === 'credential') {
      return shell(
        <ShieldCheck size={30} style={{ color: 'var(--loft-accent)' }} />,
        lockType === 'pin' ? 'Choose a PIN' : 'Choose a password',
        'You’ll set a recovery question next.',
        <CredentialEntry
          key={`setup-${lockType}-${pinLength}`}
          lockType={lockType}
          pinLength={pinLength}
          ctaLabel="Continue"
          busy={busy}
          onValid={onSetupCredential}
        />,
        () => setStep(lockType === 'pin' ? 'length' : 'type'),
      )
    }
    // step === 'recovery'
    return shell(
      <ShieldCheck size={30} style={{ color: 'var(--loft-accent)' }} />,
      'Recovery question',
      'Used if you ever forget your lock.',
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
        <p className="text-xs leading-relaxed" style={{ color: 'var(--loft-faint)' }}>
          This keeps the app private on shared devices. It's not bank-level security. Your passcode and answer are
          hashed — if you forget both, they can't be recovered, only reset.
        </p>
        <div className="pt-1">{primaryBtn(busy ? 'Saving…' : 'Save & unlock', handleFinishSetup)}</div>
      </div>,
      () => setStep('credential'),
    )
  }

  if (mode === 'login') {
    if (loginType === 'pin') {
      return shell(
        <Lock size={28} style={{ color: 'var(--loft-accent)' }} />,
        'Tracker',
        'Enter your PIN to unlock.',
        <div className="space-y-5">
          <PinPad
            value={value}
            length={loginPinLength}
            onChange={setValue}
            onComplete={(v) => handleLogin(v)}
            disabled={busy}
          />
          <button onClick={openRecovery} className="w-full text-sm font-medium" style={{ color: 'var(--loft-accent)' }}>
            Forgot PIN?
          </button>
        </div>,
      )
    }
    return shell(
      <Lock size={28} style={{ color: 'var(--loft-accent)' }} />,
      'Tracker',
      'Enter your password to unlock.',
      <div className="space-y-4">
        <PasswordField value={value} onChange={setValue} placeholder="Password" autoFocus onEnter={() => handleLogin()} />
        {primaryBtn(busy ? 'Unlocking…' : 'Unlock', () => handleLogin())}
        <button onClick={openRecovery} className="w-full text-sm font-medium pt-1" style={{ color: 'var(--loft-accent)' }}>
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
            setValue('')
            setAnswer('')
            setError('')
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
  if (step === 'type') {
    return shell(
      <KeyRound size={28} style={{ color: 'var(--loft-accent)' }} />,
      'Set a new lock',
      'Your recovery answer was correct. Choose a lock type.',
      <LockTypeChooser onChoose={chooseResetType} />,
    )
  }
  if (step === 'length') {
    return shell(
      <KeyRound size={28} style={{ color: 'var(--loft-accent)' }} />,
      'PIN length',
      'How many digits would you like?',
      <PinLengthChooser onChoose={chooseLength} />,
      () => setStep('type'),
    )
  }
  // step === 'credential'
  return shell(
    <KeyRound size={28} style={{ color: 'var(--loft-accent)' }} />,
    lockType === 'pin' ? 'Set a new PIN' : 'Set a new password',
    'Almost done.',
    <CredentialEntry
      key={`reset-${lockType}-${pinLength}`}
      lockType={lockType}
      pinLength={pinLength}
      ctaLabel={busy ? 'Saving…' : 'Save & unlock'}
      busy={busy}
      onValid={onResetCredential}
    />,
    () => setStep(lockType === 'pin' ? 'length' : 'type'),
  )
}
