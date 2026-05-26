import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Check, Flag, Flame, Settings2, ChevronDown, ChevronUp, MoreHorizontal, X, Search } from 'lucide-react'
import Modal from '../components/Modal'
import ExerciseIcon from '../components/ExerciseIcon'
import {
  getWorkouts, saveWorkout, getUserProgress, saveUserProgress,
  getExercises, savePersonalRecord, getAllPersonalRecords, getUserProfile,
  getRoutines, saveRoutine, deleteRoutine,
} from '../db'
import { today, uid } from '../utils'
import {
  calcLevel, calcNextLevelXP, calcLevelXP, calcLevelProgress,
  epley1RM, computeStreak, getDailyQuest, checkQuestCompletion,
  checkAchievements, formatElapsed,
} from './utils'
import { computeOverallRank, TIER_COLORS } from './rankUtils'
import RankBadge from './RankBadge'
import ProfileModal from './ProfileModal'
import type { Workout, Exercise, UserProgress, PersonalRecord, WorkoutExerciseDetailed, Routine, RoutineExercise } from '../types'
import type { RankInfo } from './rankUtils'
import { achievementsList } from '../data/achievements'

const STORAGE_KEY = 'tracker-active-workout'

interface ActiveSession {
  startedAt: string
  type: 'strength' | 'cardio' | 'other'
  notes: string
  exercises: WorkoutExerciseDetailed[]
  routineName?: string
}

function loadSession(): ActiveSession | null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') } catch { return null }
}
function saveSession(s: ActiveSession | null) {
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  else localStorage.removeItem(STORAGE_KEY)
}

/* ─── Default routines seeded on first use ─── */
const DEFAULT_ROUTINES: Omit<Routine, 'id' | 'createdAt'>[] = [
  {
    name: 'Push',
    exercises: [
      { exerciseId: 'barbell-bench-press',  exerciseName: 'Barbell Bench Press',  sets: 4, targetReps: 8,  targetWeight: 80 },
      { exerciseId: 'overhead-press',        exerciseName: 'Overhead Press',        sets: 3, targetReps: 8,  targetWeight: 50 },
      { exerciseId: 'incline-dumbbell-press',exerciseName: 'Incline Dumbbell Press',sets: 3, targetReps: 10, targetWeight: 30 },
      { exerciseId: 'lateral-raise',         exerciseName: 'Lateral Raise',         sets: 3, targetReps: 15, targetWeight: 10 },
      { exerciseId: 'tricep-pushdown',       exerciseName: 'Tricep Pushdown',       sets: 3, targetReps: 12, targetWeight: 25 },
      { exerciseId: 'dips-chest',            exerciseName: 'Dips (Chest)',          sets: 3, targetReps: 10 },
    ],
  },
  {
    name: 'Pull',
    exercises: [
      { exerciseId: 'deadlift',     exerciseName: 'Deadlift',      sets: 4, targetReps: 5,  targetWeight: 120 },
      { exerciseId: 'barbell-row',  exerciseName: 'Barbell Row',   sets: 4, targetReps: 8,  targetWeight: 80 },
      { exerciseId: 'lat-pulldown', exerciseName: 'Lat Pulldown',  sets: 3, targetReps: 10, targetWeight: 60 },
      { exerciseId: 'face-pull',    exerciseName: 'Face Pull',     sets: 3, targetReps: 15, targetWeight: 20 },
      { exerciseId: 'dumbbell-curl',exerciseName: 'Dumbbell Curl', sets: 3, targetReps: 12, targetWeight: 15 },
    ],
  },
  {
    name: 'Legs',
    exercises: [
      { exerciseId: 'barbell-squat',      exerciseName: 'Barbell Squat',      sets: 4, targetReps: 6,  targetWeight: 100 },
      { exerciseId: 'romanian-deadlift',  exerciseName: 'Romanian Deadlift',  sets: 3, targetReps: 10, targetWeight: 80 },
      { exerciseId: 'leg-press',          exerciseName: 'Leg Press',          sets: 3, targetReps: 12, targetWeight: 120 },
      { exerciseId: 'leg-curl',           exerciseName: 'Leg Curl',           sets: 3, targetReps: 12, targetWeight: 40 },
      { exerciseId: 'standing-calf-raise',exerciseName: 'Standing Calf Raise',sets: 4, targetReps: 15, targetWeight: 60 },
    ],
  },
]

/* ─── Routine Card ─── */
function RoutineCard({
  routine,
  exercises,
  onStart,
  onDelete,
}: {
  routine: Routine
  exercises: Exercise[]
  onStart: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const totalSets = routine.exercises.reduce((s, e) => s + e.sets, 0)
  const preview   = routine.exercises.slice(0, 3)
  const more      = routine.exercises.length - 3

  return (
    <div
      className="rounded-3xl p-5 mb-3"
      style={{ background: 'var(--loft-card)', boxShadow: 'var(--loft-card-shadow)', border: '1px solid var(--loft-border)' }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-xl font-extrabold tracking-tight" style={{ color: 'var(--loft-text)' }}>{routine.name}</h3>
          <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--loft-muted)' }}>{totalSets} sets total</p>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="p-1.5 rounded-xl"
            style={{ color: 'var(--loft-muted)', background: 'var(--loft-card2)' }}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-8 z-20 rounded-2xl py-1 min-w-[130px]"
              style={{ background: 'var(--loft-card2)', border: '1px solid var(--loft-border2)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            >
              <button
                onClick={() => { setMenuOpen(false); onDelete() }}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold"
                style={{ color: '#f87171' }}
              >
                Delete routine
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Exercise preview rows */}
      <div className="space-y-2 mb-4">
        {preview.map(re => {
          const ex = exercises.find(e => e.id === re.exerciseId)
          return (
            <div key={re.exerciseId} className="flex items-center gap-3">
              <ExerciseIcon exerciseId={re.exerciseId} category={ex?.category} size={16} />
              <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--loft-text)' }}>{re.exerciseName}</span>
              <span className="text-xs font-bold" style={{ color: 'var(--loft-muted)' }}>{re.sets} sets</span>
            </div>
          )
        })}
        {more > 0 && (
          <p className="text-xs font-semibold pl-10" style={{ color: 'var(--loft-faint)' }}>and {more} more exercise{more > 1 ? 's' : ''}</p>
        )}
      </div>

      <button
        onClick={onStart}
        className="w-full py-3.5 rounded-full text-sm font-black tracking-wide loft-btn-accent"
      >
        START
      </button>
    </div>
  )
}

/* ─── Routine Create Modal ─── */
function RoutineCreateModal({
  isOpen,
  onClose,
  exercises,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  exercises: Exercise[]
  onSave: (r: Routine) => void
}) {
  const [step, setStep]           = useState<'name' | 'exercises' | 'configure'>('name')
  const [name, setName]           = useState('')
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState<Exercise[]>([])
  const [configs, setConfigs]     = useState<RoutineExercise[]>([])

  function reset() { setStep('name'); setName(''); setSearch(''); setSelected([]); setConfigs([]) }

  function handleClose() { reset(); onClose() }

  function goToExercises() {
    if (!name.trim()) return
    setStep('exercises')
  }

  function toggleExercise(ex: Exercise) {
    setSelected(prev => prev.some(e => e.id === ex.id) ? prev.filter(e => e.id !== ex.id) : [...prev, ex])
  }

  function goToConfigure() {
    setConfigs(selected.map(ex => ({ exerciseId: ex.id, exerciseName: ex.name, sets: 3, targetReps: 10 })))
    setStep('configure')
  }

  function handleSave() {
    const routine: Routine = { id: uid(), name: name.trim(), exercises: configs, createdAt: new Date().toISOString() }
    onSave(routine)
    handleClose()
  }

  const filtered = exercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) || e.category.toLowerCase().includes(search.toLowerCase())
  )

  const title = step === 'name' ? 'New Routine' : step === 'exercises' ? 'Choose Exercises' : 'Configure Sets'

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      {step === 'name' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>Routine Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && goToExercises()}
              placeholder="e.g. Push Day"
              className="w-full mt-2 rounded-2xl px-4 py-3 text-base font-semibold outline-none"
              style={{ background: 'var(--loft-card2)', color: 'var(--loft-text)', border: '1px solid var(--loft-border2)' }}
            />
          </div>
          <button
            onClick={goToExercises}
            disabled={!name.trim()}
            className="w-full py-3.5 rounded-full font-black tracking-wide loft-btn-accent disabled:opacity-40"
          >
            Choose Exercises →
          </button>
        </div>
      )}

      {step === 'exercises' && (
        <div className="space-y-3 pb-4">
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5" style={{ background: 'var(--loft-card2)', border: '1px solid var(--loft-border)' }}>
            <Search size={15} style={{ color: 'var(--loft-faint)' }} />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search exercises..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--loft-text)' }}
            />
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto scroll-area">
            {filtered.slice(0, 40).map(ex => {
              const checked = selected.some(e => e.id === ex.id)
              return (
                <button
                  key={ex.id}
                  onClick={() => toggleExercise(ex)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors"
                  style={{ background: checked ? 'rgba(59,158,255,0.12)' : 'transparent' }}
                >
                  <ExerciseIcon exerciseId={ex.id} category={ex.category} size={15} />
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--loft-text)' }}>{ex.name}</p>
                    <p className="text-xs" style={{ color: 'var(--loft-faint)' }}>{ex.category}</p>
                  </div>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: checked ? 'var(--loft-accent)' : 'var(--loft-card2)', border: checked ? 'none' : '1px solid var(--loft-border2)' }}
                  >
                    {checked && <Check size={11} color="#fff" />}
                  </div>
                </button>
              )
            })}
          </div>

          {selected.length > 0 && (
            <button onClick={goToConfigure} className="w-full py-3.5 rounded-full font-black loft-btn-accent">
              Configure {selected.length} exercise{selected.length !== 1 ? 's' : ''} →
            </button>
          )}
        </div>
      )}

      {step === 'configure' && (
        <div className="space-y-4 pb-4">
          {configs.map((cfg, i) => (
            <div key={cfg.exerciseId} className="rounded-2xl p-4" style={{ background: 'var(--loft-card2)', border: '1px solid var(--loft-border)' }}>
              <p className="font-bold mb-3 text-sm" style={{ color: 'var(--loft-text)' }}>{cfg.exerciseName}</p>
              <div className="grid grid-cols-3 gap-2">
                {(['sets', 'targetReps', 'targetWeight'] as const).map(field => (
                  <div key={field}>
                    <label className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--loft-faint)' }}>
                      {field === 'sets' ? 'Sets' : field === 'targetReps' ? 'Reps' : 'kg'}
                    </label>
                    <input
                      type="number" min={0}
                      value={cfg[field] ?? ''}
                      onChange={e => setConfigs(prev => prev.map((c, j) => j === i ? { ...c, [field]: parseFloat(e.target.value) || 0 } : c))}
                      className="w-full rounded-xl px-2 py-2 text-sm text-center font-bold outline-none"
                      style={{ background: 'var(--loft-card)', color: 'var(--loft-text)', border: '1px solid var(--loft-border2)' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={handleSave} className="w-full py-3.5 rounded-full font-black loft-btn-accent">
            Save Routine
          </button>
        </div>
      )}
    </Modal>
  )
}

/* ─── Main TrackerTab ─── */
export default function TrackerTab() {
  const [view,          setView]         = useState<'tracker' | 'plan'>('tracker')
  const [progress,      setProgress]     = useState<UserProgress | null>(null)
  const [todayWorkouts, setTodayWorkouts]= useState<Workout[]>([])
  const [session,       setSession]      = useState<ActiveSession | null>(loadSession)
  const [exercises,     setExercises]    = useState<Exercise[]>([])
  const [routines,      setRoutines]     = useState<Routine[]>([])
  const [elapsed,       setElapsed]      = useState(0)
  const [showPicker,    setShowPicker]   = useState(false)
  const [pickerSearch,  setPickerSearch] = useState('')
  const [saving,        setSaving]       = useState(false)
  const [finishResult,  setFinishResult] = useState<{ xpGained: number; newPRs: string[]; leveledUp: boolean; newLevel: number } | null>(null)
  const [overallRank,   setOverallRank]  = useState<RankInfo | null>(null)
  const [showProfile,   setShowProfile]  = useState(false)
  const [routinesOpen,  setRoutinesOpen] = useState(true)
  const [showAddRoutine,setShowAddRoutine]= useState(false)

  const todayStr = today()

  const load = useCallback(async () => {
    const [allWorkouts, p, exList, profile, allPRs, rList] = await Promise.all([
      getWorkouts(), getUserProgress(), getExercises(), getUserProfile(), getAllPersonalRecords(), getRoutines(),
    ])
    setTodayWorkouts(allWorkouts.filter(w => w.date === todayStr))
    setProgress(p)
    setExercises(exList)
    setOverallRank(profile && allPRs.length > 0 ? computeOverallRank(allPRs, profile.bodyweightKg, profile.gender, exList) : null)

    // Seed default routines on first use
    if (rList.length === 0) {
      const defaults = DEFAULT_ROUTINES.map(r => ({ ...r, id: uid(), createdAt: new Date().toISOString() }))
      await Promise.all(defaults.map(saveRoutine))
      setRoutines(defaults)
    } else {
      setRoutines(rList)
    }
  }, [todayStr])

  useEffect(() => { void load() }, [todayStr]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session) return
    const start = new Date(session.startedAt).getTime()
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [session?.startedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateSession(s: ActiveSession) { setSession(s); saveSession(s) }

  function startBlankWorkout() {
    const s: ActiveSession = { startedAt: new Date().toISOString(), type: 'strength', notes: '', exercises: [] }
    updateSession(s); setView('tracker')
  }

  function startRoutine(r: Routine) {
    const s: ActiveSession = {
      startedAt: new Date().toISOString(), type: 'strength', notes: '', routineName: r.name,
      exercises: r.exercises.map(re => ({
        exerciseId: re.exerciseId, exerciseName: re.exerciseName,
        sets: Array.from({ length: re.sets }, () => ({
          weight: re.targetWeight ?? 0, reps: re.targetReps ?? 0, completed: false,
        })),
      })),
    }
    updateSession(s); setView('tracker')
  }

  function discardWorkout() { setSession(null); saveSession(null) }

  function addExerciseToSession(ex: Exercise) {
    if (!session) return
    updateSession({ ...session, exercises: [...session.exercises, { exerciseId: ex.id, exerciseName: ex.name, sets: [{ weight: 0, reps: 0, completed: false }] }] })
    setShowPicker(false); setPickerSearch('')
  }

  function removeExercise(idx: number) {
    if (!session) return
    updateSession({ ...session, exercises: session.exercises.filter((_, i) => i !== idx) })
  }

  function addSet(exIdx: number) {
    if (!session) return
    const ex = session.exercises[exIdx]
    const last = ex.sets[ex.sets.length - 1]
    updateSession({ ...session, exercises: session.exercises.map((e, i) => i === exIdx ? { ...e, sets: [...e.sets, last ? { ...last, completed: false } : { weight: 0, reps: 0, completed: false }] } : e) })
  }

  function updateSet(exIdx: number, setIdx: number, field: 'weight' | 'reps', val: number) {
    if (!session) return
    updateSession({ ...session, exercises: session.exercises.map((ex, i) => i === exIdx ? { ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, [field]: val } : s) } : ex) })
  }

  function toggleSet(exIdx: number, setIdx: number) {
    if (!session) return
    updateSession({ ...session, exercises: session.exercises.map((ex, i) => i === exIdx ? { ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, completed: !s.completed } : s) } : ex) })
  }

  function removeSet(exIdx: number, setIdx: number) {
    if (!session) return
    updateSession({ ...session, exercises: session.exercises.map((ex, i) => i === exIdx ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) } : ex) })
  }

  async function finishWorkout() {
    if (!session || saving) return
    setSaving(true)
    try {
      const allWorkouts = await getWorkouts()
      const p = await getUserProgress()
      const allPRs = await getAllPersonalRecords()
      const prsMap: Record<string, PersonalRecord> = Object.fromEntries(allPRs.map(pr => [pr.exerciseId, pr]))

      let xpEarned = 25, coinsEarned = 5, totalVolume = 0
      const newPRExercises: string[] = []

      for (const ex of session.exercises) {
        for (const set of ex.sets) {
          if (!set.completed) continue
          if (!set.xpAwarded) { xpEarned += 10; coinsEarned += 1 }
          totalVolume += set.weight * set.reps
          const est1 = epley1RM(set.weight, set.reps)
          const existing = prsMap[ex.exerciseId]
          if (!existing || est1 > existing.est1RM) {
            xpEarned += 5; coinsEarned += 2
            newPRExercises.push(ex.exerciseId)
            const pr: PersonalRecord = { exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, weight: set.weight, reps: set.reps, date: todayStr, est1RM: est1 }
            prsMap[ex.exerciseId] = pr
            await savePersonalRecord(pr)
          }
        }
      }

      const duration = Math.round(elapsed / 60)
      const workout: Workout = {
        id: uid(), date: todayStr, type: session.type, duration,
        notes: session.notes,
        exercises: session.exercises.map(ex => ({ name: ex.exerciseName, sets: ex.sets.filter(s => s.completed).length, reps: ex.sets[0]?.reps ?? 0, weight: ex.sets[0]?.weight ?? 0 })),
        detailedExercises: session.exercises, xpEarned, totalVolume,
      }
      await saveWorkout(workout)

      const updatedWorkouts = [workout, ...allWorkouts]
      const streak = computeStreak(updatedWorkouts)
      const newTotalXP = p.totalXP + xpEarned
      const exMuscleMap: Record<string, string[]> = Object.fromEntries(exercises.map(e => [e.id, e.primaryMuscles]))
      const todayWk = updatedWorkouts.filter(w => w.date === todayStr)
      const quest = getDailyQuest(todayStr)
      const questKey = `${todayStr}-${quest.id}`
      let completedQuests = [...p.completedQuests]
      let questBonus = 0, questCoinBonus = 0
      if (!completedQuests.includes(questKey) && checkQuestCompletion(quest, todayWk, newPRExercises.length > 0, exMuscleMap)) {
        questBonus = quest.xpReward; questCoinBonus = quest.coinReward
        completedQuests = [...completedQuests, questKey]
      }

      const finalXP = newTotalXP + questBonus
      const newLevel = calcLevel(finalXP)
      const updatedProgress: UserProgress = { ...p, totalXP: finalXP, xp: finalXP - calcLevelXP(newLevel), level: newLevel, coins: p.coins + coinsEarned + questCoinBonus, currentStreak: streak, longestStreak: Math.max(p.longestStreak, streak), completedQuests, achievements: [...p.achievements] }

      const newAch = checkAchievements(updatedWorkouts, updatedProgress, prsMap, exMuscleMap)
      const achXP = newAch.reduce((s, id) => s + (achievementsList.find(a => a.id === id)?.xpReward ?? 0), 0)
      updatedProgress.totalXP += achXP; updatedProgress.level = calcLevel(updatedProgress.totalXP)
      updatedProgress.xp = updatedProgress.totalXP - calcLevelXP(updatedProgress.level)
      updatedProgress.achievements = [...p.achievements, ...newAch]
      await saveUserProgress(updatedProgress)

      setFinishResult({ xpGained: updatedProgress.totalXP - p.totalXP, newPRs: newPRExercises, leveledUp: newLevel > p.level, newLevel })
      setSession(null); saveSession(null); await load()
    } finally { setSaving(false) }
  }

  async function handleDeleteRoutine(id: string) {
    await deleteRoutine(id)
    setRoutines(prev => prev.filter(r => r.id !== id))
  }

  async function handleSaveRoutine(r: Routine) {
    await saveRoutine(r)
    setRoutines(prev => [...prev, r])
  }

  const currentLevel = progress ? calcLevel(progress.totalXP) : 1
  const xpProgress   = progress ? calcLevelProgress(progress.totalXP) : 0
  const xpForNext    = progress ? calcNextLevelXP(currentLevel) - calcLevelXP(currentLevel) : 50
  const xpInLevel    = progress ? progress.totalXP - calcLevelXP(currentLevel) : 0
  const totalSets    = todayWorkouts.reduce((s, w) => s + (w.detailedExercises?.reduce((s2, ex) => s2 + ex.sets.filter(st => st.completed).length, 0) ?? 0), 0)
  const totalVolume  = todayWorkouts.reduce((s, w) => s + (w.totalVolume ?? 0), 0)
  const todayXP      = todayWorkouts.reduce((s, w) => s + (w.xpEarned ?? 0), 0)
  const filteredEx   = exercises.filter(e => e.name.toLowerCase().includes(pickerSearch.toLowerCase()) || e.category.toLowerCase().includes(pickerSearch.toLowerCase()))

  return (
    <div className="flex flex-col gap-0 px-4 pt-4 pb-6">
      {/* View toggle pill */}
      <div className="flex rounded-full p-1 mb-4 w-fit self-center" style={{ background: 'var(--loft-card2)', border: '1px solid var(--loft-border)' }}>
        {(['tracker', 'plan'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="px-5 py-1.5 rounded-full text-sm font-bold transition-all capitalize"
            style={view === v ? {
              background: 'linear-gradient(135deg, var(--loft-accent), var(--loft-accent2))',
              boxShadow: 'var(--loft-glow-sm)',
              color: '#fff',
            } : { color: 'var(--loft-muted)' }}
          >
            {v === 'plan' ? 'My Plan' : 'Tracker'}
          </button>
        ))}
      </div>

      {/* ─── MY PLAN view ─── */}
      {view === 'plan' && (
        <AnimatePresence mode="wait">
          <motion.div key="plan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center justify-center h-40 rounded-3xl" style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}>
              <p style={{ color: 'var(--loft-muted)' }} className="text-sm font-semibold">My Plan coming soon</p>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ─── TRACKER view ─── */}
      {view === 'tracker' && (
        <AnimatePresence mode="wait">
          <motion.div key="tracker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Hero stats card */}
            <div className="loft-card rounded-3xl p-5 border border-[rgba(255,255,255,0.06)]">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-xs font-black px-2.5 py-1 rounded-full"
                      style={{ background: 'linear-gradient(135deg, var(--loft-accent), var(--loft-accent2))', color: '#fff', boxShadow: 'var(--loft-glow-sm)' }}
                    >
                      LVL {currentLevel}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--loft-muted)' }}>{xpInLevel} / {xpForNext} XP</span>
                  </div>
                  <div className="h-1.5 rounded-full w-48 overflow-hidden" style={{ background: 'var(--loft-card2)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: 'linear-gradient(90deg, var(--loft-accent), var(--loft-accent2))', boxShadow: '0 0 8px rgba(59,158,255,0.5)' }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(xpProgress * 100)}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {overallRank && (
                    <div className="flex flex-col items-center">
                      <RankBadge tier={overallRank.tier} subTier={overallRank.subTier} size={36} />
                      <span className="text-[9px] font-black mt-0.5" style={{ color: TIER_COLORS[overallRank.tier].bg }}>{overallRank.displayName}</span>
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <Flame size={15} className="text-orange-400" />
                      <span className="text-base font-black" style={{ color: 'var(--loft-text)' }}>{progress?.currentStreak ?? 0}</span>
                    </div>
                    <button onClick={() => setShowProfile(true)} className="p-1.5 rounded-xl" style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)' }}>
                      <Settings2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[
                  { label: 'Sets',     value: totalSets },
                  { label: 'Volume',   value: totalVolume >= 1000 ? `${(totalVolume/1000).toFixed(1)}t` : `${totalVolume}kg` },
                  { label: 'XP Today', value: `+${todayXP}` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-2xl p-3 text-center" style={{ background: 'var(--loft-card2)' }}>
                    <p className="text-lg font-black" style={{ color: 'var(--loft-text)' }}>{value}</p>
                    <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--loft-faint)' }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Finish result banner */}
            <AnimatePresence>
              {finishResult && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl p-4"
                  style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-emerald-400">Workout Complete! 🎉</p>
                      <p className="text-sm text-emerald-500">+{finishResult.xpGained} XP{finishResult.newPRs.length > 0 ? ` · ${finishResult.newPRs.length} PR${finishResult.newPRs.length > 1 ? 's' : ''}` : ''}{finishResult.leveledUp ? ` · Level ${finishResult.newLevel}! 🚀` : ''}</p>
                    </div>
                    <button onClick={() => setFinishResult(null)} style={{ color: 'rgba(74,222,128,0.6)' }}>×</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── Active session ─── */}
            {session ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-black text-sm" style={{ color: 'var(--loft-text)' }}>
                      {session.routineName ?? 'Active Workout'}
                    </span>
                    <span className="font-mono text-sm" style={{ color: 'var(--loft-muted)' }}>{formatElapsed(elapsed)}</span>
                  </div>
                  <select
                    value={session.type}
                    onChange={e => updateSession({ ...session, type: e.target.value as 'strength' | 'cardio' | 'other' })}
                    className="text-xs rounded-xl px-2 py-1.5 outline-none font-semibold"
                    style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)', border: '1px solid var(--loft-border)' }}
                  >
                    <option value="strength">Strength</option>
                    <option value="cardio">Cardio</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <AnimatePresence initial={false}>
                  {session.exercises.map((ex, exIdx) => (
                    <motion.div
                      key={`${ex.exerciseId}-${exIdx}`}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                      className="rounded-3xl p-4 mb-3 border"
                      style={{ background: 'var(--loft-card)', borderColor: 'var(--loft-border)' }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <ExerciseIcon exerciseId={ex.exerciseId} size={16} />
                        <p className="font-bold flex-1 text-sm" style={{ color: 'var(--loft-text)' }}>{ex.exerciseName}</p>
                        <button onClick={() => removeExercise(exIdx)} style={{ color: 'var(--loft-faint)' }} className="hover:text-rose-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <div className="grid grid-cols-[28px_1fr_1fr_32px_20px] gap-1.5 text-[9px] font-black uppercase tracking-wider px-1" style={{ color: 'var(--loft-faint)' }}>
                          <span>#</span><span>kg</span><span>Reps</span><span></span><span></span>
                        </div>
                        {ex.sets.map((set, setIdx) => (
                          <div
                            key={setIdx}
                            className="grid grid-cols-[28px_1fr_1fr_32px_20px] gap-1.5 items-center rounded-xl px-1 py-0.5 transition-colors"
                            style={{ background: set.completed ? 'rgba(59,158,255,0.10)' : 'transparent' }}
                          >
                            <span className="text-xs font-bold" style={{ color: 'var(--loft-faint)' }}>{setIdx + 1}</span>
                            <input
                              type="number" min={0} step={0.5}
                              value={set.weight || ''}
                              onChange={e => updateSet(exIdx, setIdx, 'weight', parseFloat(e.target.value) || 0)}
                              className="rounded-xl px-2 py-1.5 text-sm text-center font-bold outline-none w-full"
                              style={{ background: 'var(--loft-card2)', color: 'var(--loft-text)', border: '1px solid var(--loft-border)' }}
                            />
                            <input
                              type="number" min={0}
                              value={set.reps || ''}
                              onChange={e => updateSet(exIdx, setIdx, 'reps', parseInt(e.target.value) || 0)}
                              className="rounded-xl px-2 py-1.5 text-sm text-center font-bold outline-none w-full"
                              style={{ background: 'var(--loft-card2)', color: 'var(--loft-text)', border: '1px solid var(--loft-border)' }}
                            />
                            <button
                              onClick={() => toggleSet(exIdx, setIdx)}
                              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                              style={set.completed ? {
                                background: 'linear-gradient(135deg, var(--loft-accent), var(--loft-accent2))',
                                boxShadow: 'var(--loft-glow-sm)',
                              } : { background: 'var(--loft-card2)', border: '1px solid var(--loft-border)' }}
                            >
                              <Check size={13} color={set.completed ? '#fff' : 'var(--loft-faint)'} />
                            </button>
                            <button onClick={() => removeSet(exIdx, setIdx)} style={{ color: 'var(--loft-faint)' }} className="hover:text-rose-400 text-sm">×</button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => addSet(exIdx)} className="mt-2 text-xs font-bold" style={{ color: 'var(--loft-accent)' }}>
                        + Add Set
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>

                <button
                  onClick={() => setShowPicker(true)}
                  className="w-full border-2 border-dashed rounded-3xl py-3 text-sm font-bold flex items-center justify-center gap-2 mb-4 transition-colors"
                  style={{ borderColor: 'var(--loft-border2)', color: 'var(--loft-muted)' }}
                >
                  <Plus size={16} /> Add Exercise
                </button>

                <div className="flex gap-3">
                  <button
                    onClick={discardWorkout}
                    className="flex-1 py-3.5 rounded-full font-bold text-sm"
                    style={{ border: '1px solid var(--loft-border2)', color: 'var(--loft-muted)' }}
                  >
                    Discard
                  </button>
                  <button
                    onClick={finishWorkout}
                    disabled={saving}
                    className="flex-1 py-3.5 rounded-full font-black text-sm flex items-center justify-center gap-2 loft-btn-accent disabled:opacity-60"
                  >
                    <Flag size={15} /> {saving ? 'Saving…' : 'Finish'}
                  </button>
                </div>
              </div>
            ) : (
              /* ─── No active session: show routines ─── */
              <div>
                {/* Collapsible routines header */}
                <button
                  onClick={() => setRoutinesOpen(v => !v)}
                  className="w-full flex items-center justify-between mb-3"
                >
                  <span className="text-sm font-black uppercase tracking-wider" style={{ color: 'var(--loft-muted)' }}>
                    My Routines ({routines.length})
                  </span>
                  {routinesOpen ? <ChevronUp size={16} style={{ color: 'var(--loft-faint)' }} /> : <ChevronDown size={16} style={{ color: 'var(--loft-faint)' }} />}
                </button>

                <AnimatePresence>
                  {routinesOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} className="overflow-hidden"
                    >
                      {routines.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-36 rounded-3xl mb-3" style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}>
                          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--loft-muted)' }}>No routines yet</p>
                          <button onClick={() => setShowAddRoutine(true)} className="px-5 py-2.5 rounded-full font-black text-sm loft-btn-accent">
                            + New Routine
                          </button>
                        </div>
                      ) : (
                        <>
                          {routines.map(r => (
                            <RoutineCard
                              key={r.id}
                              routine={r}
                              exercises={exercises}
                              onStart={() => startRoutine(r)}
                              onDelete={() => handleDeleteRoutine(r.id)}
                            />
                          ))}
                          <button
                            onClick={() => setShowAddRoutine(true)}
                            className="w-full py-3 rounded-full text-sm font-bold mb-2"
                            style={{ border: '1px dashed var(--loft-border2)', color: 'var(--loft-muted)' }}
                          >
                            + New Routine
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Quick start button */}
                <button
                  onClick={startBlankWorkout}
                  className="w-full py-3.5 rounded-full font-bold text-sm mt-2"
                  style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border2)', color: 'var(--loft-muted)' }}
                >
                  Start Empty Session
                </button>
              </div>
            )}

            {/* Completed today */}
            {todayWorkouts.length > 0 && (
              <div>
                <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'var(--loft-faint)' }}>Completed Today</p>
                {todayWorkouts.map(w => (
                  <div key={w.id} className="rounded-2xl p-4 mb-2 border" style={{ background: 'var(--loft-card)', borderColor: 'var(--loft-border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex gap-2">
                        <span className="text-xs font-bold capitalize" style={{ color: 'var(--loft-accent)' }}>{w.type}</span>
                        <span className="text-xs" style={{ color: 'var(--loft-faint)' }}>{w.duration}min</span>
                      </div>
                      {w.xpEarned && <span className="text-xs font-black text-amber-400">+{w.xpEarned} XP</span>}
                    </div>
                    {w.detailedExercises && w.detailedExercises.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {w.detailedExercises.slice(0, 4).map(ex => (
                          <span key={ex.exerciseId} className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--loft-card2)', color: 'var(--loft-muted)' }}>
                            {ex.exerciseName}
                          </span>
                        ))}
                        {w.detailedExercises.length > 4 && <span className="text-xs" style={{ color: 'var(--loft-faint)' }}>+{w.detailedExercises.length - 4} more</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Modals */}
      <ProfileModal isOpen={showProfile} onClose={() => { setShowProfile(false); void load() }} />

      <Modal isOpen={showPicker} onClose={() => { setShowPicker(false); setPickerSearch('') }} title="Add Exercise">
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5" style={{ background: 'var(--loft-card2)', border: '1px solid var(--loft-border)' }}>
            <Search size={14} style={{ color: 'var(--loft-faint)' }} />
            <input
              autoFocus value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--loft-text)' }}
            />
            {pickerSearch && <button onClick={() => setPickerSearch('')}><X size={13} style={{ color: 'var(--loft-faint)' }} /></button>}
          </div>
          <div className="max-h-72 overflow-y-auto scroll-area space-y-1">
            {filteredEx.slice(0, 35).map(ex => (
              <button
                key={ex.id}
                onClick={() => addExerciseToSession(ex)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors hover:opacity-80"
                style={{ background: 'var(--loft-card2)' }}
              >
                <ExerciseIcon exerciseId={ex.id} category={ex.category} size={15} />
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--loft-text)' }}>{ex.name}</p>
                  <p className="text-xs" style={{ color: 'var(--loft-faint)' }}>{ex.category} · {ex.equipment}</p>
                </div>
                <Plus size={14} style={{ color: 'var(--loft-accent)' }} />
              </button>
            ))}
            {filteredEx.length === 0 && <p className="text-sm text-center py-4" style={{ color: 'var(--loft-faint)' }}>No exercises found</p>}
          </div>
        </div>
      </Modal>

      <RoutineCreateModal
        isOpen={showAddRoutine}
        onClose={() => setShowAddRoutine(false)}
        exercises={exercises}
        onSave={handleSaveRoutine}
      />
    </div>
  )
}
