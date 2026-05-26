import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, subDays } from 'date-fns'
import { X } from 'lucide-react'
import { getWorkouts, getExercises, getUserProfile, getAllPersonalRecords } from '../db'
import { computeRank, TIER_COLORS } from './rankUtils'
import type { Exercise } from '../types'

type Period = 'week' | 'month'
type View = 'front' | 'back'

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest', shoulders: 'Front Deltoids', biceps: 'Biceps', forearms: 'Forearms',
  abs: 'Abs', obliques: 'Obliques', quads: 'Quadriceps', calves: 'Calves',
  'hip-flexors': 'Hip Flexors', traps: 'Trapezius', 'rear-delts': 'Rear Deltoids',
  lats: 'Lats', back: 'Upper Back', triceps: 'Triceps', 'lower-back': 'Lower Back',
  glutes: 'Glutes', hamstrings: 'Hamstrings',
}

function getMuscleColor(
  muscleId: string,
  rankColors: Record<string, string>,
  muscleCounts: Record<string, number>,
  hasProfile: boolean,
): string {
  if (hasProfile && rankColors[muscleId]) return rankColors[muscleId]
  const count = muscleCounts[muscleId] ?? 0
  if (count === 0) return 'transparent'
  if (count <= 2) return '#93c5fd'
  if (count <= 5) return '#3b82f6'
  if (count <= 9) return '#1d4ed8'
  return '#1e3a8a'
}

function BodyFront({
  muscleCounts, rankColors, hasProfile, onTap, base,
}: {
  muscleCounts: Record<string, number>
  rankColors: Record<string, string>
  hasProfile: boolean
  onTap: (m: string) => void
  base: string
}) {
  function fill(id: string) {
    return getMuscleColor(id, rankColors, muscleCounts, hasProfile)
  }
  function opac(id: string) {
    const c = muscleCounts[id] ?? 0
    const hasRank = hasProfile && rankColors[id]
    return c > 0 || hasRank ? 0.88 : 0
  }

  return (
    <svg viewBox="0 0 200 500" className="w-full drop-shadow-sm">
      {/* Body silhouette */}
      <circle cx="100" cy="38" r="30" fill={base} />
      <rect x="89" y="64" width="22" height="20" rx="4" fill={base} />
      <path d="M44,82 L156,82 L148,210 L52,210 Z" fill={base} />
      <rect x="22" y="88" width="26" height="130" rx="13" fill={base} />
      <rect x="152" y="88" width="26" height="130" rx="13" fill={base} />
      <path d="M52,206 L148,206 L144,260 L56,260 Z" fill={base} />
      <rect x="54" y="256" width="40" height="110" rx="18" fill={base} />
      <rect x="106" y="256" width="40" height="110" rx="18" fill={base} />
      <rect x="58" y="362" width="32" height="110" rx="14" fill={base} />
      <rect x="110" y="362" width="32" height="110" rx="14" fill={base} />

      {/* Muscle overlays — front */}
      {/* Chest */}
      <ellipse cx="78" cy="110" rx="26" ry="22" fill={fill('chest')} opacity={opac('chest')} onClick={() => onTap('chest')} style={{ cursor: 'pointer' }} />
      <ellipse cx="122" cy="110" rx="26" ry="22" fill={fill('chest')} opacity={opac('chest')} onClick={() => onTap('chest')} style={{ cursor: 'pointer' }} />
      {/* Front shoulders */}
      <ellipse cx="40" cy="94" rx="18" ry="16" fill={fill('shoulders')} opacity={opac('shoulders')} onClick={() => onTap('shoulders')} style={{ cursor: 'pointer' }} />
      <ellipse cx="160" cy="94" rx="18" ry="16" fill={fill('shoulders')} opacity={opac('shoulders')} onClick={() => onTap('shoulders')} style={{ cursor: 'pointer' }} />
      {/* Biceps */}
      <ellipse cx="30" cy="130" rx="10" ry="28" fill={fill('biceps')} opacity={opac('biceps')} onClick={() => onTap('biceps')} style={{ cursor: 'pointer' }} />
      <ellipse cx="170" cy="130" rx="10" ry="28" fill={fill('biceps')} opacity={opac('biceps')} onClick={() => onTap('biceps')} style={{ cursor: 'pointer' }} />
      {/* Forearms */}
      <ellipse cx="30" cy="188" rx="9" ry="24" fill={fill('forearms')} opacity={opac('forearms')} onClick={() => onTap('forearms')} style={{ cursor: 'pointer' }} />
      <ellipse cx="170" cy="188" rx="9" ry="24" fill={fill('forearms')} opacity={opac('forearms')} onClick={() => onTap('forearms')} style={{ cursor: 'pointer' }} />
      {/* Abs */}
      <rect x="83" y="136" width="14" height="16" rx="4" fill={fill('abs')} opacity={opac('abs')} onClick={() => onTap('abs')} style={{ cursor: 'pointer' }} />
      <rect x="103" y="136" width="14" height="16" rx="4" fill={fill('abs')} opacity={opac('abs')} onClick={() => onTap('abs')} style={{ cursor: 'pointer' }} />
      <rect x="83" y="156" width="14" height="16" rx="4" fill={fill('abs')} opacity={opac('abs')} onClick={() => onTap('abs')} style={{ cursor: 'pointer' }} />
      <rect x="103" y="156" width="14" height="16" rx="4" fill={fill('abs')} opacity={opac('abs')} onClick={() => onTap('abs')} style={{ cursor: 'pointer' }} />
      <rect x="83" y="176" width="14" height="16" rx="4" fill={fill('abs')} opacity={opac('abs')} onClick={() => onTap('abs')} style={{ cursor: 'pointer' }} />
      <rect x="103" y="176" width="14" height="16" rx="4" fill={fill('abs')} opacity={opac('abs')} onClick={() => onTap('abs')} style={{ cursor: 'pointer' }} />
      {/* Obliques */}
      <ellipse cx="66" cy="168" rx="14" ry="32" fill={fill('obliques')} opacity={opac('obliques')} onClick={() => onTap('obliques')} style={{ cursor: 'pointer' }} />
      <ellipse cx="134" cy="168" rx="14" ry="32" fill={fill('obliques')} opacity={opac('obliques')} onClick={() => onTap('obliques')} style={{ cursor: 'pointer' }} />
      {/* Hip flexors */}
      <ellipse cx="76" cy="232" rx="16" ry="14" fill={fill('hip-flexors')} opacity={opac('hip-flexors')} onClick={() => onTap('hip-flexors')} style={{ cursor: 'pointer' }} />
      <ellipse cx="124" cy="232" rx="16" ry="14" fill={fill('hip-flexors')} opacity={opac('hip-flexors')} onClick={() => onTap('hip-flexors')} style={{ cursor: 'pointer' }} />
      {/* Quads */}
      <ellipse cx="74" cy="310" rx="18" ry="50" fill={fill('quads')} opacity={opac('quads')} onClick={() => onTap('quads')} style={{ cursor: 'pointer' }} />
      <ellipse cx="126" cy="310" rx="18" ry="50" fill={fill('quads')} opacity={opac('quads')} onClick={() => onTap('quads')} style={{ cursor: 'pointer' }} />
      {/* Calves front */}
      <ellipse cx="74" cy="400" rx="13" ry="34" fill={fill('calves')} opacity={opac('calves')} onClick={() => onTap('calves')} style={{ cursor: 'pointer' }} />
      <ellipse cx="126" cy="400" rx="13" ry="34" fill={fill('calves')} opacity={opac('calves')} onClick={() => onTap('calves')} style={{ cursor: 'pointer' }} />
    </svg>
  )
}

function BodyBack({
  muscleCounts, rankColors, hasProfile, onTap, base,
}: {
  muscleCounts: Record<string, number>
  rankColors: Record<string, string>
  hasProfile: boolean
  onTap: (m: string) => void
  base: string
}) {
  function fill(id: string) {
    return getMuscleColor(id, rankColors, muscleCounts, hasProfile)
  }
  function opac(id: string) {
    const c = muscleCounts[id] ?? 0
    const hasRank = hasProfile && rankColors[id]
    return c > 0 || hasRank ? 0.88 : 0
  }

  return (
    <svg viewBox="0 0 200 500" className="w-full drop-shadow-sm">
      {/* Same silhouette */}
      <circle cx="100" cy="38" r="30" fill={base} />
      <rect x="89" y="64" width="22" height="20" rx="4" fill={base} />
      <path d="M44,82 L156,82 L148,210 L52,210 Z" fill={base} />
      <rect x="22" y="88" width="26" height="130" rx="13" fill={base} />
      <rect x="152" y="88" width="26" height="130" rx="13" fill={base} />
      <path d="M52,206 L148,206 L144,260 L56,260 Z" fill={base} />
      <rect x="54" y="256" width="40" height="110" rx="18" fill={base} />
      <rect x="106" y="256" width="40" height="110" rx="18" fill={base} />
      <rect x="58" y="362" width="32" height="110" rx="14" fill={base} />
      <rect x="110" y="362" width="32" height="110" rx="14" fill={base} />

      {/* Traps */}
      <path d="M70,82 L100,104 L130,82 Z" fill={fill('traps')} opacity={opac('traps')} onClick={() => onTap('traps')} style={{ cursor: 'pointer' }} />
      <ellipse cx="100" cy="92" rx="28" ry="14" fill={fill('traps')} opacity={opac('traps')} onClick={() => onTap('traps')} style={{ cursor: 'pointer' }} />
      {/* Rear delts */}
      <ellipse cx="40" cy="94" rx="17" ry="15" fill={fill('rear-delts')} opacity={opac('rear-delts')} onClick={() => onTap('rear-delts')} style={{ cursor: 'pointer' }} />
      <ellipse cx="160" cy="94" rx="17" ry="15" fill={fill('rear-delts')} opacity={opac('rear-delts')} onClick={() => onTap('rear-delts')} style={{ cursor: 'pointer' }} />
      {/* Lats */}
      <ellipse cx="62" cy="148" rx="18" ry="46" fill={fill('lats')} opacity={opac('lats')} onClick={() => onTap('lats')} style={{ cursor: 'pointer' }} />
      <ellipse cx="138" cy="148" rx="18" ry="46" fill={fill('lats')} opacity={opac('lats')} onClick={() => onTap('lats')} style={{ cursor: 'pointer' }} />
      {/* Upper back */}
      <rect x="78" y="110" width="44" height="48" rx="10" fill={fill('back')} opacity={opac('back')} onClick={() => onTap('back')} style={{ cursor: 'pointer' }} />
      {/* Triceps */}
      <ellipse cx="30" cy="132" rx="10" ry="30" fill={fill('triceps')} opacity={opac('triceps')} onClick={() => onTap('triceps')} style={{ cursor: 'pointer' }} />
      <ellipse cx="170" cy="132" rx="10" ry="30" fill={fill('triceps')} opacity={opac('triceps')} onClick={() => onTap('triceps')} style={{ cursor: 'pointer' }} />
      {/* Forearms back */}
      <ellipse cx="30" cy="188" rx="9" ry="24" fill={fill('forearms')} opacity={opac('forearms')} onClick={() => onTap('forearms')} style={{ cursor: 'pointer' }} />
      <ellipse cx="170" cy="188" rx="9" ry="24" fill={fill('forearms')} opacity={opac('forearms')} onClick={() => onTap('forearms')} style={{ cursor: 'pointer' }} />
      {/* Lower back */}
      <rect x="82" y="162" width="36" height="40" rx="8" fill={fill('lower-back')} opacity={opac('lower-back')} onClick={() => onTap('lower-back')} style={{ cursor: 'pointer' }} />
      {/* Glutes */}
      <ellipse cx="76" cy="230" rx="24" ry="26" fill={fill('glutes')} opacity={opac('glutes')} onClick={() => onTap('glutes')} style={{ cursor: 'pointer' }} />
      <ellipse cx="124" cy="230" rx="24" ry="26" fill={fill('glutes')} opacity={opac('glutes')} onClick={() => onTap('glutes')} style={{ cursor: 'pointer' }} />
      {/* Hamstrings */}
      <ellipse cx="74" cy="308" rx="17" ry="46" fill={fill('hamstrings')} opacity={opac('hamstrings')} onClick={() => onTap('hamstrings')} style={{ cursor: 'pointer' }} />
      <ellipse cx="126" cy="308" rx="17" ry="46" fill={fill('hamstrings')} opacity={opac('hamstrings')} onClick={() => onTap('hamstrings')} style={{ cursor: 'pointer' }} />
      {/* Calves back */}
      <ellipse cx="74" cy="396" rx="14" ry="36" fill={fill('calves')} opacity={opac('calves')} onClick={() => onTap('calves')} style={{ cursor: 'pointer' }} />
      <ellipse cx="126" cy="396" rx="14" ry="36" fill={fill('calves')} opacity={opac('calves')} onClick={() => onTap('calves')} style={{ cursor: 'pointer' }} />
    </svg>
  )
}

export default function BodyMapTab() {
  const [period, setPeriod] = useState<Period>('week')
  const [view, setView] = useState<View>('front')
  const [muscleCounts, setMuscleCounts] = useState<Record<string, number>>({})
  const [rankColors, setRankColors] = useState<Record<string, string>>({})
  const [hasProfile, setHasProfile] = useState(false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)
  const isDark = document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches
  const bodyBase = isDark ? '#334155' : '#e2e8f0'

  useEffect(() => {
    async function load() {
      const [workouts, exList, profile, allPRs] = await Promise.all([
        getWorkouts(), getExercises(), getUserProfile(), getAllPersonalRecords(),
      ])

      setExercises(exList)
      setHasProfile(!!profile)

      const cutoff = format(subDays(new Date(), period === 'week' ? 7 : 30), 'yyyy-MM-dd')
      const recent = workouts.filter(w => w.date >= cutoff)
      const exMap: Record<string, string[]> = Object.fromEntries(exList.map(e => [e.id, e.primaryMuscles]))

      const counts: Record<string, number> = {}
      for (const w of recent) {
        for (const ex of (w.detailedExercises ?? [])) {
          const muscles = exMap[ex.exerciseId] ?? []
          for (const m of muscles) counts[m] = (counts[m] ?? 0) + ex.sets.filter(s => s.completed).length
        }
      }
      setMuscleCounts(counts)

      if (!profile) { setRankColors({}); return }

      const exCategoryMap = Object.fromEntries(exList.map(e => [e.id, e.category]))
      // For each muscle, find the best-ranked exercise that targets it
      const muscleToExercises: Record<string, string[]> = {}
      for (const ex of exList) {
        for (const m of ex.primaryMuscles) {
          muscleToExercises[m] = muscleToExercises[m] ?? []
          muscleToExercises[m].push(ex.id)
        }
      }

      const colors: Record<string, string> = {}
      for (const [muscleId, exIds] of Object.entries(muscleToExercises)) {
        let bestScore = -1
        let bestColor = ''
        for (const exId of exIds) {
          const pr = allPRs.find(p => p.exerciseId === exId)
          if (!pr) continue
          const rank = computeRank(pr.est1RM, profile.bodyweightKg, profile.gender, exId, exCategoryMap[exId] ?? '')
          if (!rank) continue
          const score = ['wood','bronze','silver','gold','platinum','diamond','champion','titan','olympian'].indexOf(rank.tier) * 300 + (rank.subTier - 1) * 100 + rank.lp
          if (score > bestScore) {
            bestScore = score
            bestColor = TIER_COLORS[rank.tier].bg
          }
        }
        if (bestColor) colors[muscleId] = bestColor
      }
      setRankColors(colors)
    }
    load()
  }, [period])

  const muscleExercises = selectedMuscle
    ? exercises.filter(e => e.primaryMuscles.includes(selectedMuscle))
    : []

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      {/* Period toggle */}
      <div className="flex gap-2">
        {(['week', 'month'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              period === p ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            This {p === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>

      {/* Rank colour hint */}
      {hasProfile ? (
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Muscle colours = your strength rank</p>
          <div className="flex flex-wrap gap-2">
            {(['wood','bronze','silver','gold','platinum','diamond','champion','titan','olympian'] as const).map(tier => (
              <div key={tier} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TIER_COLORS[tier].bg }} />
                <span className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">{tier}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-2xl px-4 py-3">
          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
            Set up your Strength Profile (Today tab) to see rank colours on the body map.
          </p>
        </div>
      )}

      {/* Front / Back toggle */}
      <div className="flex gap-2">
        {(['front', 'back'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors capitalize ${
              view === v
                ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Body SVG with crossfade */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-center shadow-sm overflow-hidden relative" style={{ minHeight: 300 }}>
        <div className="w-40">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {view === 'front'
                ? <BodyFront muscleCounts={muscleCounts} rankColors={rankColors} hasProfile={hasProfile} onTap={setSelectedMuscle} base={bodyBase} />
                : <BodyBack muscleCounts={muscleCounts} rankColors={rankColors} hasProfile={hasProfile} onTap={setSelectedMuscle} base={bodyBase} />
              }
            </motion.div>
          </AnimatePresence>
        </div>
        <p className="absolute bottom-3 right-4 text-[10px] text-slate-400">Tap a muscle</p>
      </div>

      {/* Trained muscle chips */}
      {Object.keys(muscleCounts).filter(k => muscleCounts[k] > 0).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(muscleCounts).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a).map(([m, c]) => (
            <button
              key={m}
              onClick={() => setSelectedMuscle(m)}
              className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${!rankColors[m] ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' : ''}`}
              style={rankColors[m]
                ? { backgroundColor: `${rankColors[m]}22`, color: rankColors[m], border: `1px solid ${rankColors[m]}55` }
                : undefined
              }
            >
              {MUSCLE_LABELS[m] ?? m} · {c}
            </button>
          ))}
        </div>
      )}

      {/* Muscle detail popup */}
      <AnimatePresence>
        {selectedMuscle && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setSelectedMuscle(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 rounded-t-3xl max-h-[90dvh] flex flex-col pb-safe"
            >
              <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  {rankColors[selectedMuscle] && (
                    <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: rankColors[selectedMuscle] }} />
                  )}
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {MUSCLE_LABELS[selectedMuscle] ?? selectedMuscle}
                  </h3>
                </div>
                <button onClick={() => setSelectedMuscle(null)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X size={18} />
                </button>
              </div>
              <div className="px-5 py-4 flex-1 overflow-y-auto scroll-area">
                {muscleExercises.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No exercises found for this muscle</p>
                ) : (
                  <div className="space-y-2">
                    {muscleExercises.map(ex => {
                      const count = muscleCounts[selectedMuscle] ?? 0
                      return (
                        <div key={ex.id} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ex.name}</p>
                            <p className="text-xs text-slate-400">{ex.equipment}</p>
                          </div>
                          {count > 0 && (
                            <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">
                              {count} sets
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
