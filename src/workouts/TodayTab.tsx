import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Check, Play, Flag, Flame, Settings2 } from 'lucide-react'
import Card from '../components/Card'
import Modal from '../components/Modal'
import {
  getWorkouts, saveWorkout, getUserProgress, saveUserProgress,
  getExercises, savePersonalRecord, getAllPersonalRecords, getUserProfile,
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
import type { Workout, Exercise, UserProgress, PersonalRecord, WorkoutExerciseDetailed } from '../types'
import type { RankInfo } from './rankUtils'
import { achievementsList } from '../data/achievements'

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

function saveSession(s: ActiveSession | null) {
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  else localStorage.removeItem(STORAGE_KEY)
}

export default function TodayTab() {
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [todayWorkouts, setTodayWorkouts] = useState<Workout[]>([])
  const [session, setSession] = useState<ActiveSession | null>(loadSession)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [finishResult, setFinishResult] = useState<{ xpGained: number; newPRs: string[]; leveledUp: boolean; newLevel: number } | null>(null)
  const [overallRank, setOverallRank] = useState<RankInfo | null>(null)
  const [showProfile, setShowProfile] = useState(false)

  const todayStr = today()

  const load = useCallback(async () => {
    const [allWorkouts, p, exList, profile, allPRs] = await Promise.all([
      getWorkouts(), getUserProgress(), getExercises(), getUserProfile(), getAllPersonalRecords(),
    ])
    setTodayWorkouts(allWorkouts.filter(w => w.date === todayStr))
    setProgress(p)
    setExercises(exList)
    if (profile && allPRs.length > 0) {
      setOverallRank(computeOverallRank(allPRs, profile.bodyweightKg, profile.gender, exList))
    } else {
      setOverallRank(null)
    }
  }, [todayStr])

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [todayStr])

  useEffect(() => {
    if (!session) return
    const start = new Date(session.startedAt).getTime()
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [session?.startedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  function startWorkout() {
    const s: ActiveSession = { startedAt: new Date().toISOString(), type: 'strength', notes: '', exercises: [] }
    setSession(s)
    saveSession(s)
  }

  function discardWorkout() {
    setSession(null)
    saveSession(null)
  }

  function updateSession(s: ActiveSession) {
    setSession(s)
    saveSession(s)
  }

  function addExerciseToSession(ex: Exercise) {
    if (!session) return
    const updated: ActiveSession = {
      ...session,
      exercises: [
        ...session.exercises,
        { exerciseId: ex.id, exerciseName: ex.name, sets: [{ weight: 0, reps: 0, completed: false }] },
      ],
    }
    updateSession(updated)
    setShowPicker(false)
    setPickerSearch('')
  }

  function removeExerciseFromSession(exIdx: number) {
    if (!session) return
    updateSession({ ...session, exercises: session.exercises.filter((_, i) => i !== exIdx) })
  }

  function addSet(exIdx: number) {
    if (!session) return
    const ex = session.exercises[exIdx]
    const lastSet = ex.sets[ex.sets.length - 1]
    const newSet = lastSet ? { ...lastSet, completed: false } : { weight: 0, reps: 0, completed: false }
    const updated = session.exercises.map((e, i) =>
      i === exIdx ? { ...e, sets: [...e.sets, newSet] } : e
    )
    updateSession({ ...session, exercises: updated })
  }

  function updateSet(exIdx: number, setIdx: number, field: 'weight' | 'reps', val: number) {
    if (!session) return
    const updated = session.exercises.map((ex, i) =>
      i === exIdx ? {
        ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, [field]: val } : s)
      } : ex
    )
    updateSession({ ...session, exercises: updated })
  }

  function toggleSet(exIdx: number, setIdx: number) {
    if (!session) return
    const updated = session.exercises.map((ex, i) =>
      i === exIdx ? {
        ...ex, sets: ex.sets.map((s, j) => j === setIdx ? { ...s, completed: !s.completed } : s)
      } : ex
    )
    updateSession({ ...session, exercises: updated })
  }

  function removeSet(exIdx: number, setIdx: number) {
    if (!session) return
    const updated = session.exercises.map((ex, i) =>
      i === exIdx ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) } : ex
    )
    updateSession({ ...session, exercises: updated })
  }

  async function finishWorkout() {
    if (!session || saving) return
    setSaving(true)
    try {
      const allWorkouts = await getWorkouts()
      const p = await getUserProgress()
      const allPRs = await getAllPersonalRecords()
      const prsMap: Record<string, PersonalRecord> = Object.fromEntries(allPRs.map(pr => [pr.exerciseId, pr]))

      let xpEarned = 25
      let coinsEarned = 5
      let totalVolume = 0
      const newPRExercises: string[] = []

      for (const ex of session.exercises) {
        for (const set of ex.sets) {
          if (!set.completed) continue
          if (!set.xpAwarded) {
            xpEarned += 10
            coinsEarned += 1
          }
          totalVolume += set.weight * set.reps
          const est1 = epley1RM(set.weight, set.reps)
          const existing = prsMap[ex.exerciseId]
          if (!existing || est1 > existing.est1RM) {
            xpEarned += 5
            coinsEarned += 2
            newPRExercises.push(ex.exerciseId)
            const pr: PersonalRecord = { exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, weight: set.weight, reps: set.reps, date: todayStr, est1RM: est1 }
            prsMap[ex.exerciseId] = pr
            await savePersonalRecord(pr)
          }
        }
      }

      const duration = Math.round(elapsed / 60)
      const legacyExercises = session.exercises.map(ex => ({
        name: ex.exerciseName,
        sets: ex.sets.filter(s => s.completed).length,
        reps: ex.sets[0]?.reps ?? 0,
        weight: ex.sets[0]?.weight ?? 0,
      }))

      const workout: Workout = {
        id: uid(), date: todayStr, type: session.type, duration,
        notes: session.notes, exercises: legacyExercises,
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
      let questBonus = 0
      let questCoinBonus = 0
      if (!completedQuests.includes(questKey) && checkQuestCompletion(quest, todayWk, newPRExercises.length > 0, exMuscleMap)) {
        questBonus = quest.xpReward
        questCoinBonus = quest.coinReward
        completedQuests = [...completedQuests, questKey]
      }

      const finalXP = newTotalXP + questBonus
      const newLevel = calcLevel(finalXP)
      const updatedProgress: UserProgress = {
        ...p,
        totalXP: finalXP,
        xp: finalXP - calcLevelXP(newLevel),
        level: newLevel,
        coins: p.coins + coinsEarned + questCoinBonus,
        currentStreak: streak,
        longestStreak: Math.max(p.longestStreak, streak),
        completedQuests,
        achievements: [...p.achievements],
      }

      const newAchievements = checkAchievements(updatedWorkouts, updatedProgress, prsMap, exMuscleMap)
      const achXP = newAchievements.reduce((sum, id) => sum + (achievementsList.find(a => a.id === id)?.xpReward ?? 0), 0)
      updatedProgress.totalXP += achXP
      updatedProgress.level = calcLevel(updatedProgress.totalXP)
      updatedProgress.xp = updatedProgress.totalXP - calcLevelXP(updatedProgress.level)
      updatedProgress.achievements = [...p.achievements, ...newAchievements]

      await saveUserProgress(updatedProgress)
      setFinishResult({ xpGained: updatedProgress.totalXP - p.totalXP, newPRs: newPRExercises, leveledUp: newLevel > p.level, newLevel })
      setSession(null)
      saveSession(null)
      await load()
    } finally { setSaving(false) }
  }

  const xpProgress = progress ? calcLevelProgress(progress.totalXP) : 0
  const currentLevel = progress ? calcLevel(progress.totalXP) : 1
  const xpForNext = progress ? calcNextLevelXP(currentLevel) - calcLevelXP(currentLevel) : 50
  const xpInLevel = progress ? progress.totalXP - calcLevelXP(currentLevel) : 0

  const totalCompletedSets = todayWorkouts.reduce((sum, w) =>
    sum + (w.detailedExercises?.reduce((s2, ex) => s2 + ex.sets.filter(s => s.completed).length, 0) ?? 0), 0)
  const totalVolume = todayWorkouts.reduce((sum, w) => sum + (w.totalVolume ?? 0), 0)
  const todayXP = todayWorkouts.reduce((sum, w) => sum + (w.xpEarned ?? 0), 0)

  const filteredExercises = exercises.filter(e =>
    e.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    e.category.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      {/* Hero card */}
      <Card padding="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">LVL {currentLevel}</span>
              <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">{xpInLevel} / {xpForNext} XP</span>
            </div>
            <div className="w-48 bg-slate-100 dark:bg-slate-800 rounded-full h-2 mt-2">
              <motion.div
                className="bg-blue-600 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(xpProgress * 100)}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {overallRank && (
              <div className="flex flex-col items-center">
                <RankBadge tier={overallRank.tier} subTier={overallRank.subTier} size={36} />
                <span className="text-[9px] font-bold mt-0.5" style={{ color: TIER_COLORS[overallRank.tier].bg }}>
                  {overallRank.displayName}
                </span>
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <div className="text-center">
                <div className="flex items-center gap-1">
                  <Flame size={16} className="text-orange-500" />
                  <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{progress?.currentStreak ?? 0}</span>
                </div>
                <p className="text-[10px] text-slate-400">streak</p>
              </div>
              <button
                onClick={() => setShowProfile(true)}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                title="Strength Profile"
              >
                <Settings2 size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: 'Sets', value: totalCompletedSets },
            { label: 'Volume', value: `${(totalVolume / 1000).toFixed(1)}t`, raw: totalVolume },
            { label: 'XP Today', value: `+${todayXP}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{totalVolume > 999 && label === 'Volume' ? `${(totalVolume / 1000).toFixed(1)}t` : value}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Finish result toast */}
      <AnimatePresence>
        {finishResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-green-700 dark:text-green-400">Workout Complete! 🎉</p>
                <p className="text-sm text-green-600 dark:text-green-500">+{finishResult.xpGained} XP earned{finishResult.newPRs.length > 0 ? ` · ${finishResult.newPRs.length} new PR${finishResult.newPRs.length > 1 ? 's' : ''}` : ''}{finishResult.leveledUp ? ` · Level up → ${finishResult.newLevel}! 🚀` : ''}</p>
              </div>
              <button onClick={() => setFinishResult(null)} className="text-green-400 text-lg leading-none">×</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active workout section */}
      {session ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-bold text-slate-900 dark:text-slate-100">Active Workout</span>
              <span className="text-sm text-slate-500 font-mono">{formatElapsed(elapsed)}</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={session.type}
                onChange={e => updateSession({ ...session, type: e.target.value as 'strength' | 'cardio' | 'other' })}
                className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-700 focus:outline-none"
              >
                <option value="strength">Strength</option>
                <option value="cardio">Cardio</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {session.exercises.map((ex, exIdx) => (
              <motion.div key={`${ex.exerciseId}-${exIdx}`}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 mb-3 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{ex.exerciseName}</p>
                  <button onClick={() => removeExerciseFromSession(exIdx)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="space-y-2">
                  {/* Header */}
                  <div className="grid grid-cols-[28px_1fr_1fr_32px_24px] gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    <span>#</span><span>kg</span><span>Reps</span><span></span><span></span>
                  </div>
                  {ex.sets.map((set, setIdx) => (
                    <div key={setIdx} className={`grid grid-cols-[28px_1fr_1fr_32px_24px] gap-1.5 items-center transition-colors rounded-lg px-1 py-0.5 ${set.completed ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}>
                      <span className="text-xs text-slate-400 font-medium">{setIdx + 1}</span>
                      <input
                        type="number" min={0} step={0.5}
                        value={set.weight || ''}
                        onChange={e => updateSet(exIdx, setIdx, 'weight', parseFloat(e.target.value) || 0)}
                        className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm text-center text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                      />
                      <input
                        type="number" min={0}
                        value={set.reps || ''}
                        onChange={e => updateSet(exIdx, setIdx, 'reps', parseInt(e.target.value) || 0)}
                        className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm text-center text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                      />
                      <button
                        onClick={() => toggleSet(exIdx, setIdx)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${set.completed ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'}`}
                      >
                        <Check size={14} />
                      </button>
                      <button onClick={() => removeSet(exIdx, setIdx)} className="text-slate-200 dark:text-slate-700 hover:text-rose-400 transition-colors">
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <button onClick={() => addSet(exIdx)} className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-semibold">
                  + Add Set
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          <button
            onClick={() => setShowPicker(true)}
            className="w-full border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-2xl py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-600 transition-colors mb-4"
          >
            <Plus size={16} /> Add Exercise
          </button>

          <div className="flex gap-3">
            <button onClick={discardWorkout} className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 py-3 rounded-xl font-semibold text-sm">
              Discard
            </button>
            <button
              onClick={finishWorkout}
              disabled={saving}
              className="flex-2 flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:bg-blue-700 disabled:opacity-60"
            >
              <Flag size={16} /> {saving ? 'Saving...' : 'Finish Workout'}
            </button>
          </div>
        </div>
      ) : (
        <Card padding="p-6">
          <div className="text-center">
            <div className="text-4xl mb-3">🏋️</div>
            <p className="font-bold text-slate-900 dark:text-slate-100 mb-1">
              {todayWorkouts.length > 0 ? 'Add Another Session?' : 'Ready to train?'}
            </p>
            <p className="text-sm text-slate-400 mb-5">
              {todayWorkouts.length > 0
                ? `${todayWorkouts.length} session${todayWorkouts.length > 1 ? 's' : ''} completed today`
                : 'Tap to start logging your workout'}
            </p>
            <button
              onClick={startWorkout}
              className="bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold flex items-center gap-2 mx-auto shadow-sm shadow-blue-200 dark:shadow-blue-900 active:bg-blue-700"
            >
              <Play size={16} /> Start Workout
            </button>
          </div>
        </Card>
      )}

      {/* Completed today */}
      {todayWorkouts.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Completed Today</p>
          {todayWorkouts.map(w => (
            <div key={w.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 mb-2 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-blue-600 capitalize">{w.type}</span>
                  <span className="text-xs text-slate-400 ml-2">{w.duration}min</span>
                </div>
                {w.xpEarned && <span className="text-xs font-bold text-amber-600">+{w.xpEarned} XP</span>}
              </div>
              {w.detailedExercises && w.detailedExercises.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {w.detailedExercises.slice(0, 4).map(ex => (
                    <span key={ex.exerciseId} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                      {ex.exerciseName}
                    </span>
                  ))}
                  {w.detailedExercises.length > 4 && (
                    <span className="text-xs text-slate-400">+{w.detailedExercises.length - 4} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Profile modal */}
      <ProfileModal isOpen={showProfile} onClose={() => { setShowProfile(false); void load() }} />

      {/* Exercise picker modal */}
      <Modal isOpen={showPicker} onClose={() => { setShowPicker(false); setPickerSearch('') }} title="Add Exercise">
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Search exercises..."
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            autoFocus
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="max-h-64 overflow-y-auto space-y-1 -mx-2 px-2">
            {filteredExercises.slice(0, 30).map(ex => (
              <button
                key={ex.id}
                onClick={() => addExerciseToSession(ex)}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{ex.name}</p>
                  <p className="text-xs text-slate-400">{ex.category} · {ex.equipment}</p>
                </div>
                <Plus size={14} className="text-blue-600 flex-shrink-0" />
              </button>
            ))}
            {filteredExercises.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">No exercises found</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
