import { useState } from 'react'
import { ArrowLeft, Download, Upload, Trash2, AlertTriangle, Shield } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { exportAllData, importAllData, clearAllData } from '../db'

interface Props {
  onBack: () => void
}

export default function Settings({ onBack }: Props) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function handleExport() {
    const data = await exportAllData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Data exported successfully')
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      await importAllData(data)
      showToast('Data imported successfully')
    } catch {
      showToast('Import failed — invalid file')
    }
    e.target.value = ''
  }

  async function handleClear() {
    await clearAllData()
    setConfirmClear(false)
    showToast('All data cleared')
  }

  const rows = [
    {
      icon: Download,
      iconClass: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      label: 'Export Data',
      sub: 'Download all data as JSON',
      action: handleExport,
    },
    {
      icon: Upload,
      iconClass: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/40',
      label: 'Import Data',
      sub: 'Restore from a JSON backup',
      action: () => document.getElementById('import-input')?.click(),
    },
  ]

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      {/* Header */}
      <div
        className="safe-top px-4 pt-4 pb-3 flex items-center gap-3 border-b"
        style={{ background: 'var(--loft-bg2)', borderColor: 'var(--loft-border)' }}
      >
        <button
          onClick={onBack}
          className="p-2 rounded-xl transition-colors"
          style={{ color: 'var(--loft-muted)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--loft-text)' }}>Settings</h1>
      </div>

      <div className="scroll-area flex-1 px-5 py-5 space-y-3">
        {/* Privacy note */}
        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-5 border"
          style={{ background: 'rgba(59,158,255,0.07)', borderColor: 'rgba(59,158,255,0.20)' }}
        >
          <Shield size={16} style={{ color: 'var(--loft-accent)', flexShrink: 0 }} />
          <p className="text-xs font-medium" style={{ color: 'var(--loft-accent)' }}>
            All data is stored locally on your device — nothing is sent to any server.
          </p>
        </div>

        <p
          className="text-[11px] font-bold uppercase tracking-widest mb-3"
          style={{ color: 'var(--loft-faint)' }}
        >
          Data Management
        </p>

        {rows.map(({ icon: Icon, iconClass: _c, bg: _b, label, sub, action }) => (
          <button
            key={label}
            onClick={action}
            className="w-full rounded-2xl border p-4 flex items-center gap-4 transition-all duration-150 text-left"
            style={{ background: 'var(--loft-card)', borderColor: 'var(--loft-border)' }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(59,158,255,0.10)', border: '1px solid rgba(59,158,255,0.18)' }}
            >
              <Icon size={20} style={{ color: 'var(--loft-accent)' }} />
            </div>
            <div className="text-left">
              <p className="font-semibold" style={{ color: 'var(--loft-text)' }}>{label}</p>
              <p className="text-sm" style={{ color: 'var(--loft-muted)' }}>{sub}</p>
            </div>
          </button>
        ))}

        {/* Danger zone */}
        <div className="pt-4">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#f87171' }}>
            Danger Zone
          </p>

          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              className="w-full rounded-2xl border p-4 flex items-center gap-4 transition-colors text-left"
              style={{ background: 'var(--loft-card)', borderColor: 'rgba(248,113,113,0.25)' }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)' }}
              >
                <Trash2 size={20} style={{ color: '#f87171' }} />
              </div>
              <div className="text-left">
                <p className="font-semibold" style={{ color: '#f87171' }}>Clear All Data</p>
                <p className="text-sm" style={{ color: 'var(--loft-muted)' }}>Permanently delete everything</p>
              </div>
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border p-5"
              style={{ background: 'var(--loft-card)', borderColor: 'rgba(248,113,113,0.35)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} style={{ color: '#f87171' }} />
                <p className="font-bold" style={{ color: '#f87171' }}>Are you sure?</p>
              </div>
              <p className="text-sm mb-4 leading-relaxed" style={{ color: 'var(--loft-muted)' }}>
                This will permanently delete all workouts, spending, income, game scores, and exercise data. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmClear(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--loft-card2)', color: 'var(--loft-text)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleClear}
                  className="flex-1 py-3 rounded-xl text-white font-semibold text-sm"
                  style={{ background: '#dc2626' }}
                >
                  Delete All
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <input type="file" id="import-input" accept=".json" className="hidden" onChange={handleImport} />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl z-50 whitespace-nowrap"
            style={{ background: 'var(--loft-card2)', color: 'var(--loft-text)', border: '1px solid var(--loft-border2)' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
