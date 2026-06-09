import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ExternalLink, Globe, Pencil, Trash2, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import {
  getProjects, saveProject, deleteProject,
  getAllProjectTransactions, saveProjectTransaction, deleteProjectTransaction,
} from '../db'
import { today, uid, formatCurrency, formatSigned } from '../utils'
import type { Project, ProjectStatus, ProjectTransaction } from '../types'

const STATUSES: ProjectStatus[] = ['idea', 'active', 'paused', 'done']
const STATUS_META: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
  idea:   { label: 'Idea',   color: '#94a3b8', bg: 'rgba(148,163,184,0.16)' },
  active: { label: 'Active', color: '#34d399', bg: 'rgba(52,211,153,0.16)' },
  paused: { label: 'Paused', color: '#f59e0b', bg: 'rgba(245,158,11,0.16)' },
  done:   { label: 'Done',   color: '#3b9eff', bg: 'rgba(59,158,255,0.16)' },
}

const COLOURS = ['#3b9eff', '#34d399', '#f59e0b', '#f87171', '#a855f7', '#ec4899', '#14b8a6', '#fb923c']

function getDomain(url: string): string | null {
  try {
    const u = new URL(url.trim())
    return u.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function netColour(n: number) {
  return n > 0 ? '#34d399' : n < 0 ? '#f87171' : 'var(--loft-muted)'
}

// ─── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: ProjectStatus }) {
  const m = STATUS_META[status]
  return (
    <span
      className="text-[11px] font-bold px-2.5 py-1 rounded-full"
      style={{ color: m.color, background: m.bg }}
    >
      {m.label}
    </span>
  )
}

// ─── Link card (favicon + domain) ────────────────────────────────────────────
function LinkCard({ link, colour }: { link: string; colour: string }) {
  const [failed, setFailed] = useState(false)
  const domain = getDomain(link)
  if (!domain) return null
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="flex items-center gap-3 rounded-2xl px-3.5 py-3 border transition-opacity active:opacity-80"
      style={{ background: `${colour}14`, borderColor: `${colour}38` }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
        style={{ background: `${colour}26` }}
      >
        {!failed ? (
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
            alt=""
            width={20}
            height={20}
            onError={() => setFailed(true)}
          />
        ) : (
          <Globe size={18} style={{ color: colour }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--loft-text)' }}>{domain}</p>
        <p className="text-xs truncate" style={{ color: 'var(--loft-muted)' }}>Open site</p>
      </div>
      <ExternalLink size={16} style={{ color: colour }} className="flex-shrink-0" />
    </a>
  )
}

// ─── Project form (add / edit) ───────────────────────────────────────────────
type ProjectFormState = { name: string; status: ProjectStatus; link: string; notes: string; colour: string }
const blankProjectForm: ProjectFormState = { name: '', status: 'idea', link: '', notes: '', colour: COLOURS[0] }

function ProjectForm({ form, setForm }: { form: ProjectFormState; setForm: React.Dispatch<React.SetStateAction<ProjectFormState>> }) {
  const inputCls = 'w-full mt-1.5 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500'
  const inputStyle = { background: 'var(--loft-card)', border: '1px solid var(--loft-border2)', color: 'var(--loft-text)' }
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Name</label>
        <input
          type="text" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Ironside Mechanics"
          className={inputCls} style={inputStyle}
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Status</label>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {STATUSES.map(s => {
            const active = form.status === s
            const m = STATUS_META[s]
            return (
              <button
                key={s}
                onClick={() => setForm(f => ({ ...f, status: s }))}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={active
                  ? { color: m.color, background: m.bg, boxShadow: `inset 0 0 0 1.5px ${m.color}` }
                  : { color: 'var(--loft-muted)', background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Link <span className="font-normal normal-case">(optional)</span></label>
        <input
          type="url" inputMode="url" value={form.link}
          onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
          placeholder="https://example.com"
          className={inputCls} style={inputStyle}
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Notes <span className="font-normal normal-case">(optional)</span></label>
        <textarea
          value={form.notes} rows={3}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="What is this project about?"
          className={`${inputCls} resize-none`} style={inputStyle}
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Colour</label>
        <div className="flex flex-wrap gap-2.5 mt-2">
          {COLOURS.map(c => (
            <button
              key={c}
              onClick={() => setForm(f => ({ ...f, colour: c }))}
              className="w-9 h-9 rounded-full transition-transform active:scale-90"
              style={{ background: c, boxShadow: form.colour === c ? `0 0 0 3px var(--loft-bg), 0 0 0 5px ${c}` : 'none' }}
              aria-label={c}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Transaction form (add / edit) ───────────────────────────────────────────
type TxnFormState = { type: 'in' | 'out'; amount: number; label: string; date: string }
const blankTxnForm: TxnFormState = { type: 'in', amount: 0, label: '', date: today() }

function TransactionForm({ form, setForm }: { form: TxnFormState; setForm: React.Dispatch<React.SetStateAction<TxnFormState>> }) {
  const inputCls = 'w-full mt-1.5 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500'
  const inputStyle = { background: 'var(--loft-card)', border: '1px solid var(--loft-border2)', color: 'var(--loft-text)' }
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Type</label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          {([['in', 'Money In', '#34d399', TrendingUp], ['out', 'Money Out', '#f87171', TrendingDown]] as const).map(([t, label, col, Icon]) => {
            const active = form.type === t
            return (
              <button
                key={t}
                onClick={() => setForm(f => ({ ...f, type: t }))}
                className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                style={active
                  ? { color: col, background: `${col}22`, boxShadow: `inset 0 0 0 1.5px ${col}` }
                  : { color: 'var(--loft-muted)', background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}
              >
                <Icon size={16} /> {label}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Amount (£)</label>
        <input
          type="number" min={0} step={0.01} inputMode="decimal"
          value={form.amount || ''}
          onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
          placeholder="0.00"
          className={inputCls} style={inputStyle}
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Label</label>
        <input
          type="text" value={form.label}
          onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
          placeholder="e.g. Client deposit"
          className={inputCls} style={inputStyle}
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Date</label>
        <input
          type="date" value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          className={inputCls} style={inputStyle}
        />
      </div>
    </div>
  )
}

// ─── Footer buttons ──────────────────────────────────────────────────────────
function ModalFooter({ saveLabel, onSave, onDelete }: { saveLabel: string; onSave: () => void; onDelete?: () => void }) {
  return (
    <div className="space-y-2.5">
      <button onClick={onSave} className="w-full py-3.5 rounded-xl font-semibold text-base loft-btn-accent">
        {saveLabel}
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="w-full py-3 rounded-xl font-semibold text-sm"
          style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.35)' }}
        >
          Delete
        </button>
      )}
    </div>
  )
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [txns, setTxns] = useState<ProjectTransaction[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Project modal
  const [projModalOpen, setProjModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [projForm, setProjForm] = useState<ProjectFormState>(blankProjectForm)

  // Transaction modal
  const [txnModalOpen, setTxnModalOpen] = useState(false)
  const [editingTxn, setEditingTxn] = useState<ProjectTransaction | null>(null)
  const [txnForm, setTxnForm] = useState<TxnFormState>(blankTxnForm)

  // Delete-project confirm
  const [confirmDelete, setConfirmDelete] = useState(false)

  const reload = () => {
    getProjects().then(setProjects)
    getAllProjectTransactions().then(setTxns)
  }
  useEffect(() => { reload() }, [])

  // Net profit/loss per project id
  const netByProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of txns) {
      map.set(t.projectId, (map.get(t.projectId) ?? 0) + (t.type === 'in' ? t.amount : -t.amount))
    }
    return map
  }, [txns])

  const totalIn = useMemo(() => txns.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0), [txns])
  const totalOut = useMemo(() => txns.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0), [txns])
  const totalPL = totalIn - totalOut
  const activeCount = projects.filter(p => p.status === 'active').length

  const selected = selectedId ? projects.find(p => p.id === selectedId) ?? null : null
  const selectedTxns = useMemo(
    () => txns
      .filter(t => t.projectId === selectedId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [txns, selectedId],
  )
  const selectedNet = selectedId ? (netByProject.get(selectedId) ?? 0) : 0

  // ── Project actions ──
  function openAddProject() {
    setEditingProject(null)
    setProjForm(blankProjectForm)
    setProjModalOpen(true)
  }
  function openEditProject(p: Project) {
    setEditingProject(p)
    setProjForm({ name: p.name, status: p.status, link: p.link, notes: p.notes, colour: p.colour })
    setProjModalOpen(true)
  }
  async function handleSaveProject() {
    const name = projForm.name.trim()
    if (!name) return
    const base = editingProject ?? { id: uid(), createdAt: new Date().toISOString() }
    await saveProject({
      ...base,
      name,
      status: projForm.status,
      link: projForm.link.trim(),
      notes: projForm.notes.trim(),
      colour: projForm.colour,
    })
    setProjModalOpen(false)
    if (!editingProject) setSelectedId(base.id) // jump into the newly created project
    reload()
  }
  async function handleChangeStatus(status: ProjectStatus) {
    if (!selected) return
    await saveProject({ ...selected, status })
    reload()
  }
  async function handleDeleteProject() {
    if (!selected) return
    await deleteProject(selected.id)
    setConfirmDelete(false)
    setProjModalOpen(false)
    setSelectedId(null)
    reload()
  }

  // ── Transaction actions ──
  function openAddTxn() {
    setEditingTxn(null)
    setTxnForm(blankTxnForm)
    setTxnModalOpen(true)
  }
  function openEditTxn(t: ProjectTransaction) {
    setEditingTxn(t)
    setTxnForm({ type: t.type, amount: t.amount, label: t.label, date: t.date })
    setTxnModalOpen(true)
  }
  async function handleSaveTxn() {
    if (!selectedId || !txnForm.amount || txnForm.amount <= 0) return
    const base = editingTxn ?? { id: uid(), projectId: selectedId, createdAt: new Date().toISOString() }
    await saveProjectTransaction({
      ...base,
      type: txnForm.type,
      amount: txnForm.amount,
      label: txnForm.label.trim(),
      date: txnForm.date,
    })
    setTxnModalOpen(false)
    reload()
  }
  async function handleDeleteTxn() {
    if (!editingTxn) return
    await deleteProjectTransaction(editingTxn.id)
    setTxnModalOpen(false)
    reload()
  }

  // ─── Detail view ───────────────────────────────────────────────────────────
  if (selected) {
    const accent = selected.colour
    return (
      <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
        <PageHeader
          title={selected.name}
          onBack={() => setSelectedId(null)}
          right={
            <button
              onClick={() => openEditProject(selected)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}
            >
              <Pencil size={16} style={{ color: 'var(--loft-muted)' }} />
            </button>
          }
        />

        <div className="scroll-area flex-1 pb-tab-bar" style={{ touchAction: 'pan-y' }}>
          <div className="px-5 pt-4 space-y-4">
            {/* Status (editable) */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--loft-faint)' }}>Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map(s => {
                  const active = selected.status === s
                  const m = STATUS_META[s]
                  return (
                    <button
                      key={s}
                      onClick={() => handleChangeStatus(s)}
                      className="px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all"
                      style={active
                        ? { color: m.color, background: m.bg, boxShadow: `inset 0 0 0 1.5px ${m.color}` }
                        : { color: 'var(--loft-faint)', background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Link */}
            {selected.link && <LinkCard link={selected.link} colour={accent} />}

            {/* Notes */}
            {selected.notes && (
              <div className="loft-card rounded-3xl border border-[rgba(255,255,255,0.06)] p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--loft-faint)' }}>Notes</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--loft-text)' }}>{selected.notes}</p>
              </div>
            )}

            {/* Profit / loss */}
            <div
              className="rounded-3xl p-5 text-center border"
              style={{ background: `${accent}10`, borderColor: `${accent}30` }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--loft-muted)' }}>Profit / Loss</p>
              <p className="text-3xl font-black" style={{ color: netColour(selectedNet) }}>{formatSigned(selectedNet)}</p>
              <div className="flex justify-center gap-5 mt-3 text-xs" style={{ color: 'var(--loft-muted)' }}>
                <span><span style={{ color: '#34d399' }}>+{formatCurrency(selectedTxns.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0))}</span> in</span>
                <span><span style={{ color: '#f87171' }}>-{formatCurrency(selectedTxns.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0))}</span> out</span>
              </div>
            </div>

            {/* Transactions */}
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--loft-faint)' }}>Transactions</p>
              <button
                onClick={openAddTxn}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold loft-btn-accent"
              >
                <Plus size={14} /> Add
              </button>
            </div>

            {selectedTxns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm" style={{ color: 'var(--loft-muted)' }}>No transactions yet.</p>
                <p className="text-xs mt-1" style={{ color: 'var(--loft-faint)' }}>Add money in or out to track this project.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {selectedTxns.map(t => (
                    <motion.button
                      key={t.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      onClick={() => openEditTxn(t)}
                      className="w-full text-left loft-card rounded-2xl border border-[rgba(255,255,255,0.06)] px-4 py-3 flex items-center gap-3"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: t.type === 'in' ? 'rgba(52,211,153,0.16)' : 'rgba(248,113,113,0.16)' }}
                      >
                        {t.type === 'in'
                          ? <TrendingUp size={15} style={{ color: '#34d399' }} />
                          : <TrendingDown size={15} style={{ color: '#f87171' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--loft-text)' }}>
                          {t.label || (t.type === 'in' ? 'Money in' : 'Money out')}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--loft-muted)' }}>{format(parseISO(t.date), 'EEE, MMM d, yyyy')}</p>
                      </div>
                      <p className="text-base font-bold flex-shrink-0" style={{ color: t.type === 'in' ? '#34d399' : '#f87171' }}>
                        {t.type === 'in' ? '+' : '-'}{formatCurrency(t.amount)}
                      </p>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Delete project */}
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm mt-2"
              style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.30)' }}
            >
              <Trash2 size={15} /> Delete Project
            </button>
          </div>
        </div>

        {/* Transaction modal */}
        <Modal
          isOpen={txnModalOpen}
          onClose={() => setTxnModalOpen(false)}
          title={editingTxn ? 'Edit Transaction' : 'Add Transaction'}
          footer={
            <ModalFooter
              saveLabel={editingTxn ? 'Save Changes' : 'Add Transaction'}
              onSave={handleSaveTxn}
              onDelete={editingTxn ? handleDeleteTxn : undefined}
            />
          }
        >
          <TransactionForm form={txnForm} setForm={setTxnForm} />
        </Modal>

        {/* Edit project modal */}
        <Modal
          isOpen={projModalOpen}
          onClose={() => setProjModalOpen(false)}
          title="Edit Project"
          footer={<ModalFooter saveLabel="Save Changes" onSave={handleSaveProject} />}
        >
          <ProjectForm form={projForm} setForm={setProjForm} />
        </Modal>

        {/* Delete confirm */}
        <Modal
          isOpen={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete Project"
          footer={
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)', color: 'var(--loft-text)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: '#ef4444' }}
              >
                Delete
              </button>
            </div>
          }
        >
          <p className="text-sm leading-relaxed" style={{ color: 'var(--loft-muted)' }}>
            Delete <span className="font-bold" style={{ color: 'var(--loft-text)' }}>{selected.name}</span> and all{' '}
            {selectedTxns.length} of its transaction{selectedTxns.length === 1 ? '' : 's'}? This cannot be undone.
          </p>
        </Modal>
      </div>
    )
  }

  // ─── List view ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      <PageHeader
        title="Projects"
        right={
          <button
            onClick={openAddProject}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold loft-btn-accent"
          >
            <Plus size={16} /> Add
          </button>
        }
      />

      <div className="scroll-area flex-1 pb-tab-bar" style={{ touchAction: 'pan-y' }}>
        <div className="px-5 pt-4 space-y-4">
          {/* Dashboard: total profit / loss */}
          <div
            className="rounded-3xl p-5 text-center border"
            style={{
              background: totalPL >= 0 ? 'rgba(52,211,153,0.10)' : 'rgba(248,113,113,0.10)',
              borderColor: totalPL >= 0 ? 'rgba(52,211,153,0.30)' : 'rgba(248,113,113,0.30)',
            }}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--loft-muted)' }}>Total Profit / Loss</p>
            <p className="text-4xl font-black" style={{ color: totalPL >= 0 ? '#34d399' : '#f87171' }}>{formatSigned(totalPL)}</p>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="loft-card rounded-2xl border border-[rgba(255,255,255,0.06)] p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--loft-muted)' }}>Revenue</p>
              <p className="text-base font-black leading-tight" style={{ color: '#34d399' }}>{formatCurrency(totalIn)}</p>
            </div>
            <div className="loft-card rounded-2xl border border-[rgba(255,255,255,0.06)] p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--loft-muted)' }}>Costs</p>
              <p className="text-base font-black leading-tight" style={{ color: '#f87171' }}>{formatCurrency(totalOut)}</p>
            </div>
            <div className="loft-card rounded-2xl border border-[rgba(255,255,255,0.06)] p-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--loft-muted)' }}>Active</p>
              <p className="text-base font-black leading-tight" style={{ color: 'var(--loft-text)' }}>{activeCount}</p>
            </div>
          </div>

          {/* Projects list */}
          <p className="text-[11px] font-bold uppercase tracking-wider pt-1" style={{ color: 'var(--loft-faint)' }}>Projects</p>

          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm" style={{ color: 'var(--loft-muted)' }}>No projects yet.</p>
              <p className="text-xs mt-1" style={{ color: 'var(--loft-faint)' }}>Tap “Add” to start tracking one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {projects.map(p => {
                  const net = netByProject.get(p.id) ?? 0
                  return (
                    <motion.div
                      key={p.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="loft-card rounded-3xl border border-[rgba(255,255,255,0.06)] overflow-hidden"
                      style={{ borderLeft: `3px solid ${p.colour}` }}
                    >
                      <button
                        onClick={() => setSelectedId(p.id)}
                        className="w-full text-left p-4 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <h3 className="text-base font-bold truncate" style={{ color: 'var(--loft-text)' }}>{p.name}</h3>
                            <StatusPill status={p.status} />
                          </div>
                          <p className="text-sm font-bold" style={{ color: netColour(net) }}>
                            {formatSigned(net)} <span className="text-xs font-medium" style={{ color: 'var(--loft-faint)' }}>net</span>
                          </p>
                        </div>
                        <ChevronRight size={18} style={{ color: 'var(--loft-faint)' }} className="flex-shrink-0" />
                      </button>
                      {p.link && (
                        <div className="px-4 pb-4 -mt-1">
                          <LinkCard link={p.link} colour={p.colour} />
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Add project card */}
          <button
            onClick={openAddProject}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl text-sm font-semibold"
            style={{ border: '1.5px dashed var(--loft-border2)', color: 'var(--loft-muted)' }}
          >
            <Plus size={18} /> Add Project
          </button>
        </div>
      </div>

      {/* Add project modal */}
      <Modal
        isOpen={projModalOpen}
        onClose={() => setProjModalOpen(false)}
        title={editingProject ? 'Edit Project' : 'New Project'}
        footer={<ModalFooter saveLabel={editingProject ? 'Save Changes' : 'Add Project'} onSave={handleSaveProject} />}
      >
        <ProjectForm form={projForm} setForm={setProjForm} />
      </Modal>
    </div>
  )
}
