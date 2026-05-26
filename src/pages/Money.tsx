import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, TrendingUp, TrendingDown } from 'lucide-react'
import { format, startOfMonth, parseISO } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'
import Modal from '../components/Modal'
import { getSpending, saveSpending, deleteSpending, getIncome, saveIncome, deleteIncome } from '../db'
import { today, uid, formatCurrency } from '../utils'
import type { SpendingEntry, IncomeEntry } from '../types'

type View = 'spending' | 'income'

const SPEND_CATEGORIES = ['food', 'transport', 'bills', 'fun', 'other'] as const
const SPEND_CAT_LABELS: Record<string, string> = { food: 'Food', transport: 'Transport', bills: 'Bills', fun: 'Fun', other: 'Other' }
const SPEND_CAT_COLORS: Record<string, string> = {
  food: '#f97316', transport: '#3b82f6', bills: '#ef4444', fun: '#a855f7', other: '#6b7280',
}
const SPEND_CAT_BG: Record<string, string> = {
  food: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  transport: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  bills: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  fun: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400',
  other: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

const INC_SOURCES = ['work', 'freelance', 'gift', 'other'] as const
const INC_SRC_LABELS: Record<string, string> = { work: 'Work', freelance: 'Freelance', gift: 'Gift', other: 'Other' }
const INC_SRC_COLORS: Record<string, string> = {
  work: '#2563eb', freelance: '#7c3aed', gift: '#ec4899', other: '#6b7280',
}
const INC_SRC_BG: Record<string, string> = {
  work: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  freelance: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  gift: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
  other: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

export default function Money() {
  const [view, setView] = useState<View>('spending')
  const [spendEntries, setSpendEntries] = useState<SpendingEntry[]>([])
  const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editSpend, setEditSpend] = useState<SpendingEntry | null>(null)
  const [editInc, setEditInc] = useState<IncomeEntry | null>(null)
  const [spendForm, setSpendForm] = useState<Omit<SpendingEntry, 'id'>>({
    date: today(), amount: 0, category: 'food', note: '',
  })
  const [incForm, setIncForm] = useState<Omit<IncomeEntry, 'id'>>({
    date: today(), amount: 0, source: 'work', note: '',
  })

  const load = () => {
    getSpending().then(setSpendEntries)
    getIncome().then(setIncomeEntries)
  }
  useEffect(() => { load() }, [])

  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const thisMonthSpend = spendEntries.filter(e => e.date >= monthStart)
  const thisMonthInc = incomeEntries.filter(e => e.date >= monthStart)
  const monthSpend = thisMonthSpend.reduce((s, e) => s + e.amount, 0)
  const monthIncome = thisMonthInc.reduce((s, e) => s + e.amount, 0)
  const monthNet = monthIncome - monthSpend

  const spendByCategory = SPEND_CATEGORIES.map(cat => ({
    name: SPEND_CAT_LABELS[cat], cat,
    amount: thisMonthSpend.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.amount > 0)

  const incBySource = INC_SOURCES.map(src => ({
    name: INC_SRC_LABELS[src], src,
    amount: thisMonthInc.filter(e => e.source === src).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.amount > 0)

  function openAddSpend() {
    setEditSpend(null)
    setSpendForm({ date: today(), amount: 0, category: 'food', note: '' })
    setModalOpen(true)
  }

  function openEditSpend(entry: SpendingEntry) {
    setEditSpend(entry)
    setSpendForm({ date: entry.date, amount: entry.amount, category: entry.category, note: entry.note })
    setModalOpen(true)
  }

  function openAddInc() {
    setEditInc(null)
    setIncForm({ date: today(), amount: 0, source: 'work', note: '' })
    setModalOpen(true)
  }

  function openEditInc(entry: IncomeEntry) {
    setEditInc(entry)
    setIncForm({ date: entry.date, amount: entry.amount, source: entry.source, note: entry.note })
    setModalOpen(true)
  }

  async function handleSaveSpend() {
    if (!spendForm.amount || spendForm.amount <= 0) return
    await saveSpending({ id: editSpend?.id ?? uid(), ...spendForm })
    setModalOpen(false)
    load()
  }

  async function handleSaveInc() {
    if (!incForm.amount || incForm.amount <= 0) return
    await saveIncome({ id: editInc?.id ?? uid(), ...incForm })
    setModalOpen(false)
    load()
  }

  async function handleDeleteSpend(id: string) {
    await deleteSpending(id)
    setModalOpen(false)
    load()
  }

  async function handleDeleteInc(id: string) {
    await deleteIncome(id)
    setModalOpen(false)
    load()
  }

  const netPositive = monthNet >= 0

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--loft-bg)' }}>
      <PageHeader
        title="Money"
        right={
          <button
            onClick={view === 'spending' ? openAddSpend : openAddInc}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold loft-btn-accent"
          >
            <Plus size={16} /> {view === 'spending' ? 'Expense' : 'Income'}
          </button>
        }
      />

      <div className="scroll-area flex-1 pb-tab-bar">
        <div className="px-5 pt-4 space-y-4">
          {/* Three summary cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-emerald-600 rounded-2xl p-3 text-center">
              <p className="text-xs text-emerald-200 mb-1 font-medium">Income</p>
              <p className="text-lg font-bold text-white leading-tight">{formatCurrency(monthIncome)}</p>
            </div>
            <div className="bg-rose-500 rounded-2xl p-3 text-center">
              <p className="text-xs text-rose-200 mb-1 font-medium">Spent</p>
              <p className="text-lg font-bold text-white leading-tight">{formatCurrency(monthSpend)}</p>
            </div>
            <div className={`${netPositive ? 'bg-blue-600' : 'bg-slate-700 dark:bg-slate-800'} rounded-2xl p-3 text-center`}>
              <p className={`text-xs mb-1 font-medium ${netPositive ? 'text-blue-200' : 'text-slate-400'}`}>Net</p>
              <p className="text-lg font-bold text-white leading-tight">
                {monthNet >= 0 ? '+' : ''}{formatCurrency(monthNet)}
              </p>
            </div>
          </div>

          {/* View toggle */}
          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 flex">
            {(['spending', 'income'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                  view === v
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {v === 'spending' ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                {v === 'spending' ? 'Expenses' : 'Income'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {view === 'spending' ? (
              <motion.div
                key="spending"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {/* Spending chart */}
                {spendByCategory.length > 0 && (
                  <Card padding="p-4">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">By Category</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={spendByCategory} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
                        <Tooltip
                          formatter={(value) => [formatCurrency(typeof value === 'number' ? value : 0), '']}
                          contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 12, fontSize: 12 }}
                          itemStyle={{ color: '#e2e8f0' }}
                          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                        />
                        <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                          {spendByCategory.map(entry => (
                            <Cell key={entry.cat} fill={SPEND_CAT_COLORS[entry.cat]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {/* Transactions list */}
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Transactions</p>
                  {spendEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                      <p className="text-slate-400 dark:text-slate-500 text-sm">No transactions yet.</p>
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {spendEntries.map(entry => (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mb-2"
                        >
                          <Card onClick={() => openEditSpend(entry)}>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SPEND_CAT_BG[entry.category]}`}>
                                    {SPEND_CAT_LABELS[entry.category]}
                                  </span>
                                  <span className="text-xs text-slate-400 dark:text-slate-500">
                                    {format(parseISO(entry.date), 'EEE, MMM d')}
                                  </span>
                                </div>
                                {entry.note && <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{entry.note}</p>}
                              </div>
                              <p className="text-base font-bold text-slate-800 dark:text-slate-200 flex-shrink-0">
                                {formatCurrency(entry.amount)}
                              </p>
                            </div>
                          </Card>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="income"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {/* Income chart */}
                {incBySource.length > 0 && (
                  <Card padding="p-4">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">By Source</p>
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={incBySource} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
                        <Tooltip
                          formatter={(value) => [formatCurrency(typeof value === 'number' ? value : 0), '']}
                          contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 12, fontSize: 12 }}
                          itemStyle={{ color: '#e2e8f0' }}
                          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                        />
                        <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                          {incBySource.map(entry => (
                            <Cell key={entry.src} fill={INC_SRC_COLORS[entry.src]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {/* Income list */}
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Income</p>
                  {incomeEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                      <p className="text-slate-400 dark:text-slate-500 text-sm">No income logged yet.</p>
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {incomeEntries.map(entry => (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mb-2"
                        >
                          <Card onClick={() => openEditInc(entry)}>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${INC_SRC_BG[entry.source]}`}>
                                    {INC_SRC_LABELS[entry.source]}
                                  </span>
                                  <span className="text-xs text-slate-400 dark:text-slate-500">
                                    {format(parseISO(entry.date), 'EEE, MMM d')}
                                  </span>
                                </div>
                                {entry.note && <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{entry.note}</p>}
                              </div>
                              <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                                +{formatCurrency(entry.amount)}
                              </p>
                            </div>
                          </Card>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Spending modal */}
      <Modal
        isOpen={modalOpen && view === 'spending'}
        onClose={() => setModalOpen(false)}
        title={editSpend ? 'Edit Expense' : 'New Expense'}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Amount (£)</label>
            <input
              type="number" min={0} step={0.01}
              value={spendForm.amount || ''}
              onChange={e => setSpendForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              placeholder="0.00"
              className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Category</label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {SPEND_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSpendForm(f => ({ ...f, category: cat }))}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    spendForm.category === cat
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {SPEND_CAT_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Date</label>
            <input
              type="date" value={spendForm.date}
              onChange={e => setSpendForm(f => ({ ...f, date: e.target.value }))}
              className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Note</label>
            <input
              type="text" value={spendForm.note}
              onChange={e => setSpendForm(f => ({ ...f, note: e.target.value }))}
              placeholder="e.g. Lunch at Pret"
              className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSaveSpend}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-base active:bg-blue-700 transition-colors"
          >
            {editSpend ? 'Save Changes' : 'Add Expense'}
          </button>
          {editSpend && (
            <button
              onClick={() => handleDeleteSpend(editSpend.id)}
              className="w-full border border-rose-200 dark:border-rose-900 text-rose-500 py-3 rounded-xl font-semibold text-sm"
            >
              Delete
            </button>
          )}
        </div>
      </Modal>

      {/* Income modal */}
      <Modal
        isOpen={modalOpen && view === 'income'}
        onClose={() => setModalOpen(false)}
        title={editInc ? 'Edit Income' : 'Add Income'}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Amount (£)</label>
            <input
              type="number" min={0} step={0.01}
              value={incForm.amount || ''}
              onChange={e => setIncForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              placeholder="0.00"
              className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Source</label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {INC_SOURCES.map(src => (
                <button
                  key={src}
                  onClick={() => setIncForm(f => ({ ...f, source: src }))}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    incForm.source === src
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {INC_SRC_LABELS[src]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Date</label>
            <input
              type="date" value={incForm.date}
              onChange={e => setIncForm(f => ({ ...f, date: e.target.value }))}
              className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Note</label>
            <input
              type="text" value={incForm.note}
              onChange={e => setIncForm(f => ({ ...f, note: e.target.value }))}
              placeholder="e.g. Monthly salary"
              className="w-full mt-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleSaveInc}
            className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-semibold text-base active:bg-emerald-700 transition-colors"
          >
            {editInc ? 'Save Changes' : 'Add Income'}
          </button>
          {editInc && (
            <button
              onClick={() => handleDeleteInc(editInc.id)}
              className="w-full border border-rose-200 dark:border-rose-900 text-rose-500 py-3 rounded-xl font-semibold text-sm"
            >
              Delete
            </button>
          )}
        </div>
      </Modal>
    </div>
  )
}
