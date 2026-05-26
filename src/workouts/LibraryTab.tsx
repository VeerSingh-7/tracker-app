import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Trash2, ChevronRight, Dumbbell, Award, ChevronDown, ChevronUp, Minus } from 'lucide-react'
import Card from '../components/Card'
import Modal from '../components/Modal'
import {
  getExercises, saveExercise, deleteExercise,
  getWorkouts, getAllPersonalRecords, savePersonalRecord,
  getUserProgress, saveUserProgress, getUserProfile,
} from '../db'
import { uid, today } from '../utils'
import { epley1RM } from './utils'
import { computeRank, TIER_COLORS } from './rankUtils'
import RankBadge from './RankBadge'
import { format, parseISO } from 'date-fns'
import type { Exercise, PersonalRecord, WorkoutExerciseDetailed, WorkoutSubTab, UserProfile } from '../types'
import type { RankInfo } from './rankUtils'

const STORAGE_KEY = 'tracker-active-workout'

interface ActiveSession {
  startedAt: string
  type: 'strength' | 'cardio' | 'other'
  notes: string
  exercises: WorkoutExerciseDetailed[]
}

function loadSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveSessionToStorage(s: ActiveSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

interface HistorySession {
  date: string
  sets: Array<{ weight: number; reps: number }>
  est1RM: number
}

const CATEGORIES = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio', 'Full Body']
const EQUIPMENT = ['All', 'Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell']

const emptyCustom: Omit<Exercise, 'id'> = {
  name: '', category: 'Chest', primaryMuscles: [], secondaryMuscles: [],
  equipment: 'Barbell', instructions: '', isCustom: true,
}

interface Props {
  onNavigate: (tab: WorkoutSubTab) => void
}

export default function LibraryTab({ onNavigate }: Props) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [detail, setDetail] = useState<Exercise | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<Omit<Exercise, 'id'>>(emptyCustom)
  const [primaryInput, setPrimaryInput] = useState('')
  const [secondaryInput, setSecondaryInput] = useState('')

  // Detail state
  const [exHistory, setExHistory] = useState<HistorySession[]>([])
  const [pr, setPr] = useState<PersonalRecord | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // Rank state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [exRank, setExRank] = useState<RankInfo | null>(null)

  // Quick log state
  const [quickLogOpen, setQuickLogOpen] = useState(false)
  const [quickLogWeight, setQuickLogWeight] = useState(0)
  const [quickLogReps, setQuickLogReps] = useState(0)
  const [quickLogSets, setQuickLogSets] = useState<Array<{ weight: number; reps: number }>>([])
  const [logging, setLogging] = useState(false)

  const load = () => getExercises().then(list => setExercises(list.sort((a, b) => a.name.localeCompare(b.name))))
  useEffect(() => { load() }, [])

  async function openDetail(ex: Exercise) {
    setDetail(ex)
    setShowDetails(false)
    setShowHistory(false)
    setQuickLogOpen(false)
    setQuickLogSets([])
    setExRank(null)

    const [workouts, allPRs, profile] = await Promise.all([getWorkouts(), getAllPersonalRecords(), getUserProfile()])
    setUserProfile(profile)
    const exPR = allPRs.find(p => p.exerciseId === ex.id) ?? null
    setPr(exPR)

    if (profile && exPR) {
      const rank = computeRank(exPR.est1RM, profile.bodyweightKg, profile.gender, ex.id, ex.category)
      setExRank(rank)
    }

    const sessions: HistorySession[] = []
    for (const w of workouts) {
      if (!w.detailedExercises) continue
      const found = w.detailedExercises.find(e => e.exerciseId === ex.id)
      if (!found) continue
      const completedSets = found.sets.filter(s => s.completed)
      if (!completedSets.length) continue
      const est1 = Math.max(...completedSets.map(s => epley1RM(s.weight, s.reps)))
      sessions.push({
        date: w.date,
        sets: completedSets.map(s => ({ weight: s.weight, reps: s.reps })),
        est1RM: Math.round(est1 * 10) / 10,
      })
    }
    sessions.sort((a, b) => b.date.localeCompare(a.date))
    setExHistory(sessions)

    // Pre-fill quick log from last session
    if (sessions.length > 0 && sessions[0].sets.length > 0) {
      setQuickLogWeight(sessions[0].sets[0].weight)
      setQuickLogReps(sessions[0].sets[0].reps)
    } else {
      setQuickLogWeight(0)
      setQuickLogReps(0)
    }
  }

  function closeDetail() {
    setDetail(null)
    setQuickLogSets([])
    setQuickLogOpen(false)
  }

  async function handleQuickLog() {
    if (!detail || logging || quickLogReps <= 0) return
    setLogging(true)
    try {
      const todayStr = today()

      let session = loadSession()
      if (!session) {
        session = { startedAt: new Date().toISOString(), type: 'strength', notes: '', exercises: [] }
      }

      const exIdx = session.exercises.findIndex(e => e.exerciseId === detail.id)
      if (exIdx >= 0) {
        session.exercises[exIdx].sets.push({ weight: quickLogWeight, reps: quickLogReps, completed: true, xpAwarded: true })
      } else {
        session.exercises.push({
          exerciseId: detail.id,
          exerciseName: detail.name,
          sets: [{ weight: quickLogWeight, reps: quickLogReps, completed: true, xpAwarded: true }],
        })
      }
      saveSessionToStorage(session)

      // Award XP and check PR
      const p = await getUserProgress()
      let xpGained = 10
      let coinsGained = 1

      const allPRs = await getAllPersonalRecords()
      const existingPR = allPRs.find(r => r.exerciseId === detail.id)
      const est1 = epley1RM(quickLogWeight, quickLogReps)
      if (!existingPR || est1 > existingPR.est1RM) {
        xpGained += 5
        coinsGained += 2
        const newPR: PersonalRecord = {
          exerciseId: detail.id,
          exerciseName: detail.name,
          weight: quickLogWeight,
          reps: quickLogReps,
          date: todayStr,
          est1RM: est1,
        }
        await savePersonalRecord(newPR)
        setPr(newPR)
        if (userProfile) {
          setExRank(computeRank(est1, userProfile.bodyweightKg, userProfile.gender, detail.id, detail.category))
        }
      }

      await saveUserProgress({ ...p, totalXP: p.totalXP + xpGained, xp: p.xp + xpGained, coins: p.coins + coinsGained })

      setQuickLogSets(prev => [...prev, { weight: quickLogWeight, reps: quickLogReps }])
    } finally {
      setLogging(false)
    }
  }

  async function handleAddToToday() {
    if (!detail) return

    let session = loadSession()
    if (!session) {
      session = { startedAt: new Date().toISOString(), type: 'strength', notes: '', exercises: [] }
    }

    const exIdx = session.exercises.findIndex(e => e.exerciseId === detail.id)
    if (exIdx >= 0) {
      const lastSet = session.exercises[exIdx].sets.at(-1)
      session.exercises[exIdx].sets.push(
        lastSet ? { weight: lastSet.weight, reps: lastSet.reps, completed: false } : { weight: 0, reps: 0, completed: false }
      )
    } else {
      const prefillWeight = exHistory[0]?.sets[0]?.weight ?? 0
      const prefillReps = exHistory[0]?.sets[0]?.reps ?? 0
      session.exercises.push({
        exerciseId: detail.id,
        exerciseName: detail.name,
        sets: [{ weight: prefillWeight, reps: prefillReps, completed: false }],
      })
    }
    saveSessionToStorage(session)
    onNavigate('tracker')
  }

  const filtered = exercises.filter(e => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.primaryMuscles.some(m => m.includes(search.toLowerCase()))
    const matchCat = category === 'All' || e.category === category
    return matchSearch && matchCat
  })

  async function handleAddCustom() {
    if (!form.name.trim()) return
    const ex: Exercise = {
      id: `custom-${uid()}`,
      ...form,
      primaryMuscles: primaryInput.split(',').map(m => m.trim()).filter(Boolean),
      secondaryMuscles: secondaryInput.split(',').map(m => m.trim()).filter(Boolean),
    }
    await saveExercise(ex)
    setShowAdd(false)
    setForm(emptyCustom)
    setPrimaryInput('')
    setSecondaryInput('')
    load()
  }

  async function handleDelete(id: string) {
    await deleteExercise(id)
    closeDetail()
    load()
  }

  const categoryGroups = CATEGORIES.slice(1)
  const lastSession = exHistory[0] ?? null

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-6">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search exercises..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              category === cat
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Count + add button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 font-medium">{filtered.length} exercises</p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400"
        >
          <Plus size={14} /> Custom Exercise
        </button>
      </div>

      {/* Exercise list */}
      <AnimatePresence initial={false}>
        {filtered.map(ex => (
          <motion.div
            key={ex.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            layout
          >
            <Card onClick={() => openDetail(ex)}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950/40 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Dumbbell size={16} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ex.name}</p>
                    {ex.isCustom && <span className="text-[10px] bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full font-semibold">Custom</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">{ex.category}</span>
                    <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">{ex.equipment}</span>
                    {ex.primaryMuscles.slice(0, 2).map(m => (
                      <span key={m} className="text-[10px] bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full capitalize">{m}</span>
                    ))}
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />
              </div>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <div className="text-3xl mb-2">🔍</div>
          <p className="font-medium">No exercises found</p>
        </div>
      )}

      {/* Exercise detail modal */}
      <Modal isOpen={!!detail} onClose={closeDetail} title={detail?.name ?? ''}>
        {detail && (
          <div className="space-y-4">
            {/* Last performance */}
            {lastSession ? (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Last Performance</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">{format(parseISO(lastSession.date), 'MMM d, yyyy')}</p>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {lastSession.sets.map((s, i) => (
                    <span key={i} className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full text-slate-700 dark:text-slate-300 font-medium">
                      {s.weight}kg×{s.reps}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Est. 1RM: {lastSession.est1RM} kg</p>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 text-center">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No history yet — first time? 🎉</p>
              </div>
            )}

            {/* Rank badge + PR */}
            <div className="flex items-stretch gap-3">
              {/* Rank badge */}
              <div className="flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-3 min-w-[90px]">
                {exRank ? (
                  <>
                    <RankBadge tier={exRank.tier} subTier={exRank.subTier} size={52} lp={exRank.lp} />
                    <p className="text-[10px] font-bold mt-1.5" style={{ color: TIER_COLORS[exRank.tier].bg }}>
                      {exRank.displayName}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{exRank.lp} LP</p>
                  </>
                ) : userProfile ? (
                  <>
                    <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mb-1">
                      <span className="text-xl font-bold text-slate-400">?</span>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center">Log a set to rank up</p>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center mb-1">
                      <span className="text-xl text-slate-400">👤</span>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center">Set profile for rank</p>
                  </>
                )}
              </div>

              {/* PR */}
              <div className="flex-1 bg-amber-50 dark:bg-amber-950/30 rounded-2xl p-3.5 flex flex-col justify-center">
                {pr ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Award size={14} className="text-amber-500" />
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Personal Record</p>
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{pr.weight} kg × {pr.reps}</p>
                    <p className="text-xs text-slate-400">~{Math.round(pr.est1RM)} kg 1RM</p>
                    <p className="text-xs text-slate-400">{format(parseISO(pr.date), 'MMM d, yyyy')}</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 text-center">No PR yet — be first!</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setQuickLogOpen(v => !v)}
                className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                  quickLogOpen ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white active:bg-blue-700'
                }`}
              >
                ⚡ Quick Log
              </button>
              <button
                onClick={handleAddToToday}
                className="py-3 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 active:bg-slate-200 dark:active:bg-slate-700"
              >
                + Add to Today
              </button>
            </div>

            {/* Quick log inline form */}
            <AnimatePresence>
              {quickLogOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-2xl p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Weight (kg)</label>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <button
                            onClick={() => setQuickLogWeight(w => Math.max(0, Math.round((w - 2.5) * 10) / 10))}
                            className="w-8 h-8 flex-shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 active:bg-slate-100"
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number" min={0} step={0.5}
                            value={quickLogWeight || ''}
                            onChange={e => setQuickLogWeight(parseFloat(e.target.value) || 0)}
                            className="flex-1 min-w-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm text-center text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => setQuickLogWeight(w => Math.round((w + 2.5) * 10) / 10)}
                            className="w-8 h-8 flex-shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 active:bg-slate-100"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Reps</label>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <button
                            onClick={() => setQuickLogReps(r => Math.max(0, r - 1))}
                            className="w-8 h-8 flex-shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 active:bg-slate-100"
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number" min={0}
                            value={quickLogReps || ''}
                            onChange={e => setQuickLogReps(parseInt(e.target.value) || 0)}
                            className="flex-1 min-w-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm text-center text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => setQuickLogReps(r => r + 1)}
                            className="w-8 h-8 flex-shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-400 active:bg-slate-100"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleQuickLog}
                      disabled={logging || quickLogReps <= 0}
                      className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 active:bg-blue-700"
                    >
                      {logging ? 'Saving...' : 'Save Set (+10 XP)'}
                    </button>

                    {quickLogSets.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1.5">Sets this session:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {quickLogSets.map((s, i) => (
                            <span key={i} className="text-xs bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                              {s.weight}kg×{s.reps}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Full history toggle */}
            {exHistory.length > 0 && (
              <button
                onClick={() => setShowHistory(v => !v)}
                className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 font-medium"
              >
                {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showHistory ? 'Hide' : 'View'} full history ({exHistory.length} sessions)
              </button>
            )}

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden space-y-2"
                >
                  {exHistory.map((sess, i) => (
                    <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">{format(parseISO(sess.date), 'MMM d, yyyy')}</p>
                      <div className="flex flex-wrap gap-1">
                        {sess.sets.map((s, j) => (
                          <span key={j} className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full text-slate-700 dark:text-slate-300">
                            {s.weight}kg×{s.reps}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Est. 1RM: {sess.est1RM} kg</p>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Collapsible exercise details */}
            <div>
              <button
                onClick={() => setShowDetails(v => !v)}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 font-medium"
              >
                {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showDetails ? 'Hide' : 'Show'} details
              </button>

              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-full font-semibold">{detail.category}</span>
                        <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full font-semibold">{detail.equipment}</span>
                      </div>

                      {detail.primaryMuscles.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Primary Muscles</p>
                          <div className="flex flex-wrap gap-1.5">
                            {detail.primaryMuscles.map(m => (
                              <span key={m} className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full capitalize">{m}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {detail.secondaryMuscles.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Secondary Muscles</p>
                          <div className="flex flex-wrap gap-1.5">
                            {detail.secondaryMuscles.map(m => (
                              <span key={m} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full capitalize">{m}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {detail.instructions && (
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Instructions</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{detail.instructions}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {detail.isCustom && (
              <button
                onClick={() => handleDelete(detail.id)}
                className="w-full border border-rose-200 dark:border-rose-900 text-rose-500 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> Delete Custom Exercise
              </button>
            )}
          </div>
        )}
      </Modal>

      {/* Add custom exercise modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Custom Exercise">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Exercise name"
              className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categoryGroups.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Equipment</label>
              <select
                value={form.equipment}
                onChange={e => setForm(f => ({ ...f, equipment: e.target.value }))}
                className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {EQUIPMENT.slice(1).map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Primary Muscles <span className="normal-case font-normal">(comma separated)</span></label>
            <input
              type="text"
              value={primaryInput}
              onChange={e => setPrimaryInput(e.target.value)}
              placeholder="chest, triceps"
              className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Secondary Muscles <span className="normal-case font-normal">(comma separated)</span></label>
            <input
              type="text"
              value={secondaryInput}
              onChange={e => setSecondaryInput(e.target.value)}
              placeholder="shoulders"
              className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Instructions</label>
            <textarea
              value={form.instructions}
              onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
              placeholder="How to perform this exercise..."
              rows={3}
              className="w-full mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <button
            onClick={handleAddCustom}
            disabled={!form.name.trim()}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
          >
            Add Exercise
          </button>
        </div>
      </Modal>
    </div>
  )
}
