import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { Timer, Activity, ChevronDown, ChevronUp, Trash2, Zap, Dumbbell } from 'lucide-react'
import { getWorkouts, deleteWorkout } from '../db'
import type { Workout } from '../types'

type Filter = 'all' | 'strength' | 'cardio' | 'other'

const FILTER_LABELS: Record<Filter, string> = { all: 'All', strength: 'Strength', cardio: 'Cardio', other: 'Other' }

const TYPE_ICON = { cardio: Zap, strength: Dumbbell, other: Activity }
const TYPE_COLOR = {
  strength: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40',
  cardio: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40',
  other: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
}

export default function HistoryTab() {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = () => getWorkouts().then(setWorkouts)
  useEffect(() => { load() }, [])

  const filtered = workouts.filter(w => filter === 'all' || w.type === filter)

  async function handleDelete(id: string) {
    await deleteWorkout(id)
    setExpanded(null)
    load()
  }

  const totalVolume = workouts.reduce((s, w) => s + (w.totalVolume ?? 0), 0)
  const totalDuration = workouts.reduce((s, w) => s + w.duration, 0)

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-6">
      {/* Summary strip */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-4 grid grid-cols-3 divide-x divide-white/10">
        <div className="text-center pr-4">
          <p className="text-2xl font-bold text-white">{workouts.length}</p>
          <p className="text-xs text-slate-400">sessions</p>
        </div>
        <div className="text-center px-4">
          <p className="text-2xl font-bold text-white">{Math.round(totalDuration / 60 * 10) / 10}h</p>
          <p className="text-xs text-slate-400">total time</p>
        </div>
        <div className="text-center pl-4">
          <p className="text-xl font-bold text-white">{totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${totalVolume}kg`}</p>
          <p className="text-xs text-slate-400">volume</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(Object.keys(FILTER_LABELS) as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Workout list */}
      <AnimatePresence initial={false}>
        {filtered.map(w => {
          const TypeIcon = TYPE_ICON[w.type]
          const isExpanded = expanded === w.id
          const exercises = w.detailedExercises ?? []
          const legacyExercises = w.exercises

          return (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              layout
            >
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <button
                  className="w-full text-left p-4"
                  onClick={() => setExpanded(isExpanded ? null : w.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TYPE_COLOR[w.type]}`}>
                      <TypeIcon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 capitalize">{w.type}</span>
                        <span className="text-xs text-slate-400">{format(new Date(w.date + 'T00:00:00'), 'EEE, MMM d')}</span>
                        {w.xpEarned && <span className="text-xs font-bold text-amber-500">+{w.xpEarned} XP</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {w.duration > 0 && (
                          <div className="flex items-center gap-1">
                            <Timer size={11} className="text-slate-400" />
                            <span className="text-xs text-slate-500">{w.duration}min</span>
                          </div>
                        )}
                        {(exercises.length > 0 || legacyExercises.length > 0) && (
                          <div className="flex items-center gap-1">
                            <Activity size={11} className="text-slate-400" />
                            <span className="text-xs text-slate-500">
                              {exercises.length || legacyExercises.length} exercise{(exercises.length || legacyExercises.length) !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        {w.totalVolume != null && w.totalVolume > 0 && (
                          <span className="text-xs text-slate-400">{w.totalVolume >= 1000 ? `${(w.totalVolume / 1000).toFixed(1)}t` : `${w.totalVolume}kg`}</span>
                        )}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />}
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                        {w.notes && <p className="text-sm text-slate-500 dark:text-slate-400 italic">"{w.notes}"</p>}

                        {exercises.length > 0 ? (
                          exercises.map((ex, i) => (
                            <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">{ex.exerciseName}</p>
                              <div className="space-y-0.5">
                                {ex.sets.filter(s => s.completed).map((s, j) => (
                                  <p key={j} className="text-xs text-slate-500 dark:text-slate-400">
                                    Set {j + 1}: {s.weight} kg × {s.reps} reps
                                  </p>
                                ))}
                                {ex.sets.filter(s => s.completed).length === 0 && (
                                  <p className="text-xs text-slate-400">No completed sets</p>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          legacyExercises.map((ex, i) => (
                            <div key={i} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{ex.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{ex.sets} sets × {ex.reps} reps @ {ex.weight} kg</p>
                            </div>
                          ))
                        )}

                        <button
                          onClick={() => handleDelete(w.id)}
                          className="w-full border border-rose-200 dark:border-rose-900 text-rose-500 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mt-2"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-medium">No workouts yet</p>
          <p className="text-sm mt-1">Head to Today to log your first session</p>
        </div>
      )}
    </div>
  )
}
