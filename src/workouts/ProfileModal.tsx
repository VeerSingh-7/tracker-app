import { useState, useEffect } from 'react'
import { Shield } from 'lucide-react'
import Modal from '../components/Modal'
import { getUserProfile, saveUserProfile } from '../db'
import type { UserProfile } from '../types'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function ProfileModal({ isOpen, onClose }: Props) {
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [bodyweight, setBodyweight] = useState(75)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoaded(false)
    getUserProfile().then(p => {
      if (p) {
        setGender(p.gender)
        setBodyweight(p.bodyweightKg)
      }
      setLoaded(true)
    })
  }, [isOpen])

  async function handleSave() {
    setSaving(true)
    try {
      const profile: UserProfile = {
        id: 'main',
        gender,
        bodyweightKg: Math.max(30, Math.min(300, bodyweight)),
        updatedAt: new Date().toISOString(),
      }
      await saveUserProfile(profile)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Strength Profile">
      {loaded && (
        <div className="space-y-5 pb-2">
          <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/30 rounded-2xl p-4">
            <Shield size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              Your bodyweight is used to calculate strength ratios and assign you a rank on every exercise — from Wood I all the way to Olympian III.
            </p>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Biological sex</p>
            <div className="grid grid-cols-2 gap-2.5">
              {(['male', 'female'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`py-3 rounded-xl text-sm font-semibold capitalize transition-colors ${
                    gender === g
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Bodyweight</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setBodyweight(w => Math.max(30, parseFloat((w - 0.5).toFixed(1))))}
                className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl text-2xl font-light text-slate-600 dark:text-slate-400 flex items-center justify-center active:bg-slate-200 dark:active:bg-slate-700"
              >
                −
              </button>
              <div className="flex-1 relative">
                <input
                  type="number"
                  min={30} max={300} step={0.5}
                  value={bodyweight}
                  onChange={e => setBodyweight(parseFloat(e.target.value) || 75)}
                  className="w-full text-center text-3xl font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-3 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">kg</span>
              </div>
              <button
                onClick={() => setBodyweight(w => Math.min(300, parseFloat((w + 0.5).toFixed(1))))}
                className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl text-2xl font-light text-slate-600 dark:text-slate-400 flex items-center justify-center active:bg-slate-200 dark:active:bg-slate-700"
              >
                +
              </button>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || bodyweight < 30}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-50 active:bg-blue-700"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      )}
    </Modal>
  )
}
