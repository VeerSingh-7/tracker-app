import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, X } from 'lucide-react'
import { getUserProfile, saveUserProfile } from '../db'
import type { UserProfile } from '../types'

interface Props {
  isOpen: boolean
  onClose: () => void
}

function cmToFtIn(cm: number): string {
  const totalIn = cm / 2.54
  const ft = Math.floor(totalIn / 12)
  const inches = Math.round(totalIn % 12)
  return `${ft}'${inches}"`
}

export default function ProfileModal({ isOpen, onClose }: Props) {
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [bodyweight, setBodyweight] = useState(75)
  const [heightCm, setHeightCm] = useState(175)
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoaded(false)
    setSaved(false)
    getUserProfile().then(p => {
      if (p) {
        setGender(p.gender)
        setBodyweight(p.bodyweightKg)
        setHeightCm(p.heightCm ?? 175)
        setDateOfBirth(p.dateOfBirth ?? '')
        setUnits(p.units ?? 'metric')
      }
      setLoaded(true)
    })
  }, [isOpen])

  async function handleSave() {
    setSaving(true)
    try {
      const existing = await getUserProfile()
      const profile: UserProfile = {
        id: 'main',
        gender,
        bodyweightKg: Math.max(30, Math.min(300, bodyweight)),
        heightCm: Math.max(100, Math.min(250, heightCm)),
        dateOfBirth: dateOfBirth || undefined,
        units,
        preferredColor: existing?.preferredColor,
        updatedAt: new Date().toISOString(),
      }
      await saveUserProfile(profile)
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        onClose()
      }, 1200)
    } finally {
      setSaving(false)
    }
  }

  const bwUnit = units === 'metric' ? 'kg' : 'lbs'
  const bwDisplay = units === 'metric'
    ? bodyweight
    : parseFloat((bodyweight * 2.20462).toFixed(1))
  const heightDisplay = units === 'metric' ? `${heightCm} cm` : cmToFtIn(heightCm)

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            style={{ background: '#000' }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col"
            style={{
              background: 'var(--loft-bg2)',
              borderTop: '1px solid var(--loft-border2)',
              maxHeight: '85dvh',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--loft-faint)' }} />
            </div>

            {/* Header — sticky, never scrolls */}
            <div
              className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b"
              style={{ borderColor: 'var(--loft-border)' }}
            >
              <h2 className="text-lg font-bold" style={{ color: 'var(--loft-text)' }}>
                Strength Profile
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'var(--loft-card)' }}
              >
                <X size={16} style={{ color: 'var(--loft-muted)' }} />
              </button>
            </div>

            {/* Scrollable body */}
            <div
              className="flex-1 px-5 py-4 overflow-y-auto scroll-area"
              style={{
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
              }}
            >
              {loaded && (
                <div className="space-y-5">
                  {/* Info banner */}
                  <div
                    className="flex items-start gap-3 rounded-2xl p-4"
                    style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)' }}
                  >
                    <Shield size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--loft-accent)' }} />
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--loft-muted)' }}>
                      Used to calculate strength ratios and assign you a rank — from Wood I all the way to Olympian III.
                    </p>
                  </div>

                  {/* Gender */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2.5" style={{ color: 'var(--loft-muted)' }}>
                      Biological sex
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {(['male', 'female'] as const).map(g => (
                        <button
                          key={g}
                          onClick={() => setGender(g)}
                          className="py-3 rounded-xl text-sm font-semibold capitalize transition-colors"
                          style={gender === g ? {
                            background: 'linear-gradient(135deg, var(--loft-accent), var(--loft-accent2))',
                            color: '#fff',
                          } : {
                            background: 'var(--loft-card2)',
                            color: 'var(--loft-muted)',
                            border: '1px solid var(--loft-border)',
                          }}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bodyweight */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2.5" style={{ color: 'var(--loft-muted)' }}>
                      Bodyweight
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (units === 'metric') {
                            setBodyweight(w => Math.max(30, parseFloat((w - 0.5).toFixed(2))))
                          } else {
                            const lbs = parseFloat((bodyweight * 2.20462 - 0.25).toFixed(2))
                            setBodyweight(Math.max(30, parseFloat((lbs / 2.20462).toFixed(3))))
                          }
                        }}
                        className="w-12 h-12 rounded-xl text-2xl font-light flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)' }}
                      >
                        −
                      </button>
                      <div className="flex-1 relative">
                        <div
                          className="w-full text-center text-3xl font-bold rounded-xl py-3"
                          style={{
                            background: 'var(--loft-card2)',
                            color: 'var(--loft-text)',
                            border: '1px solid var(--loft-border)',
                          }}
                        >
                          {bwDisplay}
                        </div>
                        <span
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium"
                          style={{ color: 'var(--loft-muted)' }}
                        >
                          {bwUnit}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (units === 'metric') {
                            setBodyweight(w => Math.min(300, parseFloat((w + 0.5).toFixed(2))))
                          } else {
                            const lbs = parseFloat((bodyweight * 2.20462 + 0.25).toFixed(2))
                            setBodyweight(Math.min(300, parseFloat((lbs / 2.20462).toFixed(3))))
                          }
                        }}
                        className="w-12 h-12 rounded-xl text-2xl font-light flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)' }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Height */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2.5" style={{ color: 'var(--loft-muted)' }}>
                      Height
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setHeightCm(h => Math.max(100, h - 1))}
                        className="w-12 h-12 rounded-xl text-2xl font-light flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)' }}
                      >
                        −
                      </button>
                      <div
                        className="flex-1 text-center text-2xl font-bold rounded-xl py-3.5"
                        style={{
                          background: 'var(--loft-card2)',
                          color: 'var(--loft-text)',
                          border: '1px solid var(--loft-border)',
                        }}
                      >
                        {heightDisplay}
                      </div>
                      <button
                        onClick={() => setHeightCm(h => Math.min(250, h + 1))}
                        className="w-12 h-12 rounded-xl text-2xl font-light flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)' }}
                      >
                        +
                      </button>
                    </div>
                    {units === 'imperial' && (
                      <p className="text-xs mt-1.5 text-center" style={{ color: 'var(--loft-faint)' }}>
                        ({heightCm} cm)
                      </p>
                    )}
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2.5" style={{ color: 'var(--loft-muted)' }}>
                      Date of birth
                    </p>
                    <input
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={dateOfBirth}
                      onChange={e => setDateOfBirth(e.target.value)}
                      className="w-full rounded-xl px-4 py-3.5 text-sm font-medium focus:outline-none"
                      style={{
                        background: 'var(--loft-card2)',
                        color: dateOfBirth ? 'var(--loft-text)' : 'var(--loft-muted)',
                        border: '1px solid var(--loft-border)',
                        colorScheme: 'dark',
                      }}
                    />
                  </div>

                  {/* Units */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2.5" style={{ color: 'var(--loft-muted)' }}>
                      Units preference
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {(['metric', 'imperial'] as const).map(u => (
                        <button
                          key={u}
                          onClick={() => setUnits(u)}
                          className="py-3 rounded-xl text-sm font-semibold capitalize transition-colors"
                          style={units === u ? {
                            background: 'linear-gradient(135deg, var(--loft-accent), var(--loft-accent2))',
                            color: '#fff',
                          } : {
                            background: 'var(--loft-card2)',
                            color: 'var(--loft-muted)',
                            border: '1px solid var(--loft-border)',
                          }}
                        >
                          {u === 'metric' ? 'Metric' : 'Imperial'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bottom breathing room above footer */}
                  <div className="h-2" />
                </div>
              )}
            </div>

            {/* Sticky footer — Save + Cancel */}
            {loaded && (
              <div
                className="flex-shrink-0 px-5 pt-3 pb-safe border-t"
                style={{
                  borderColor: 'var(--loft-border)',
                  background: 'var(--loft-bg2)',
                  position: 'sticky',
                  bottom: 0,
                }}
              >
                {saved && (
                  <p className="text-sm font-semibold text-center mb-2" style={{ color: '#10b981' }}>
                    Profile saved ✓
                  </p>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || saved || bodyweight < 30}
                  className="w-full py-4 rounded-2xl font-bold text-base disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, var(--loft-accent), var(--loft-accent2))',
                    boxShadow: '0 0 20px rgba(6,182,212,0.35)',
                    color: '#fff',
                  }}
                >
                  {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Profile'}
                </button>
                <button
                  onClick={onClose}
                  className="w-full text-sm font-medium py-3 text-center"
                  style={{ color: 'var(--loft-muted)' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
