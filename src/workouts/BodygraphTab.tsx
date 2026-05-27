import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { subDays } from 'date-fns'
import { X, ChevronRight, Shield } from 'lucide-react'
import { getWorkouts, getExercises, getUserProfile, getAllPersonalRecords } from '../db'
import { computeRank, TIER_COLORS, TIERS } from './rankUtils'
import ExerciseIcon from '../components/ExerciseIcon'
import ProfileModal from './ProfileModal'
import type { Exercise, PersonalRecord, UserProfile } from '../types'
import type { Tier } from '../data/strengthStandards'

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest',
  shoulders: 'Front Deltoids',
  biceps: 'Biceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  'hip-flexors': 'Hip Flexors',
  quads: 'Quadriceps',
  calves: 'Calves',
  traps: 'Trapezius',
  'rear-delts': 'Rear Deltoids',
  lats: 'Lats',
  back: 'Upper Back',
  triceps: 'Triceps',
  'lower-back': 'Lower Back',
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
}

const TIERS_ORDERED: Tier[] = ['wood','bronze','silver','gold','platinum','diamond','champion','titan','olympian']
const BODY_BASE = '#1a2540'
const UNRANKED_INACTIVE = '#2a3a58'
const ACTIVE_COLOR = '#1e4f90'

type MuscleDetailEx = { exercise: Exercise; rank: ReturnType<typeof computeRank> }

interface BodyProps {
  getFill: (id: string) => string
  getOpacity: (id: string) => number
  onTap: (id: string) => void
  hasHighlight: (id: string) => boolean
  prefix: string
}

function BodyFront({ getFill, getOpacity, onTap, hasHighlight, prefix }: BodyProps) {
  function muscle(id: string, children: React.ReactNode) {
    return (
      <g
        key={id}
        onClick={() => onTap(id)}
        style={{ cursor: 'pointer' }}
        opacity={getOpacity(id)}
      >
        <g fill={getFill(id)}>{children}</g>
        {hasHighlight(id) && (
          <g fill={`url(#${prefix}-hl)`} style={{ pointerEvents: 'none' }}>{children}</g>
        )}
      </g>
    )
  }

  return (
    <svg viewBox="0 0 200 480" className="w-full">
      <defs>
        <radialGradient id={`${prefix}-hl`} cx="35%" cy="28%" r="65%">
          <stop offset="0%" stopColor="white" stopOpacity="0.30" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Silhouette */}
      <circle cx="100" cy="38" r="30" fill={BODY_BASE} />
      <rect x="89" y="64" width="22" height="20" rx="4" fill={BODY_BASE} />
      <path d="M44,82 L156,82 L148,210 L52,210 Z" fill={BODY_BASE} />
      <rect x="22" y="88" width="26" height="130" rx="13" fill={BODY_BASE} />
      <rect x="152" y="88" width="26" height="130" rx="13" fill={BODY_BASE} />
      <path d="M52,206 L148,206 L144,260 L56,260 Z" fill={BODY_BASE} />
      <rect x="54" y="256" width="40" height="110" rx="18" fill={BODY_BASE} />
      <rect x="106" y="256" width="40" height="110" rx="18" fill={BODY_BASE} />
      <rect x="58" y="362" width="32" height="110" rx="14" fill={BODY_BASE} />
      <rect x="110" y="362" width="32" height="110" rx="14" fill={BODY_BASE} />

      {/* Chest */}
      {muscle('chest', <>
        <ellipse cx="78" cy="110" rx="26" ry="22" />
        <ellipse cx="122" cy="110" rx="26" ry="22" />
      </>)}

      {/* Front deltoids */}
      {muscle('shoulders', <>
        <ellipse cx="40" cy="94" rx="17" ry="15" />
        <ellipse cx="160" cy="94" rx="17" ry="15" />
      </>)}

      {/* Biceps */}
      {muscle('biceps', <>
        <ellipse cx="30" cy="130" rx="10" ry="27" />
        <ellipse cx="170" cy="130" rx="10" ry="27" />
      </>)}

      {/* Forearms */}
      {muscle('forearms', <>
        <ellipse cx="30" cy="186" rx="9" ry="24" />
        <ellipse cx="170" cy="186" rx="9" ry="24" />
      </>)}

      {/* Abs */}
      {muscle('abs', <>
        <rect x="84" y="136" width="13" height="15" rx="4" />
        <rect x="103" y="136" width="13" height="15" rx="4" />
        <rect x="84" y="155" width="13" height="15" rx="4" />
        <rect x="103" y="155" width="13" height="15" rx="4" />
        <rect x="84" y="174" width="13" height="15" rx="4" />
        <rect x="103" y="174" width="13" height="15" rx="4" />
      </>)}

      {/* Obliques */}
      {muscle('obliques', <>
        <ellipse cx="66" cy="168" rx="13" ry="30" />
        <ellipse cx="134" cy="168" rx="13" ry="30" />
      </>)}

      {/* Hip flexors */}
      {muscle('hip-flexors', <>
        <ellipse cx="76" cy="232" rx="15" ry="14" />
        <ellipse cx="124" cy="232" rx="15" ry="14" />
      </>)}

      {/* Quads */}
      {muscle('quads', <>
        <ellipse cx="74" cy="308" rx="18" ry="50" />
        <ellipse cx="126" cy="308" rx="18" ry="50" />
      </>)}

      {/* Calves front (tibialis) */}
      {muscle('calves', <>
        <ellipse cx="74" cy="398" rx="12" ry="32" />
        <ellipse cx="126" cy="398" rx="12" ry="32" />
      </>)}
    </svg>
  )
}

function BodyBack({ getFill, getOpacity, onTap, hasHighlight, prefix }: BodyProps) {
  function muscle(id: string, children: React.ReactNode) {
    return (
      <g
        key={id}
        onClick={() => onTap(id)}
        style={{ cursor: 'pointer' }}
        opacity={getOpacity(id)}
      >
        <g fill={getFill(id)}>{children}</g>
        {hasHighlight(id) && (
          <g fill={`url(#${prefix}-hl)`} style={{ pointerEvents: 'none' }}>{children}</g>
        )}
      </g>
    )
  }

  return (
    <svg viewBox="0 0 200 480" className="w-full">
      <defs>
        <radialGradient id={`${prefix}-hl`} cx="35%" cy="28%" r="65%">
          <stop offset="0%" stopColor="white" stopOpacity="0.30" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Silhouette */}
      <circle cx="100" cy="38" r="30" fill={BODY_BASE} />
      <rect x="89" y="64" width="22" height="20" rx="4" fill={BODY_BASE} />
      <path d="M44,82 L156,82 L148,210 L52,210 Z" fill={BODY_BASE} />
      <rect x="22" y="88" width="26" height="130" rx="13" fill={BODY_BASE} />
      <rect x="152" y="88" width="26" height="130" rx="13" fill={BODY_BASE} />
      <path d="M52,206 L148,206 L144,260 L56,260 Z" fill={BODY_BASE} />
      <rect x="54" y="256" width="40" height="110" rx="18" fill={BODY_BASE} />
      <rect x="106" y="256" width="40" height="110" rx="18" fill={BODY_BASE} />
      <rect x="58" y="362" width="32" height="110" rx="14" fill={BODY_BASE} />
      <rect x="110" y="362" width="32" height="110" rx="14" fill={BODY_BASE} />

      {/* Traps */}
      {muscle('traps', <>
        <path d="M70,82 L100,104 L130,82 Z" />
        <ellipse cx="100" cy="90" rx="26" ry="13" />
      </>)}

      {/* Rear deltoids */}
      {muscle('rear-delts', <>
        <ellipse cx="40" cy="94" rx="16" ry="15" />
        <ellipse cx="160" cy="94" rx="16" ry="15" />
      </>)}

      {/* Lats */}
      {muscle('lats', <>
        <ellipse cx="62" cy="148" rx="18" ry="46" />
        <ellipse cx="138" cy="148" rx="18" ry="46" />
      </>)}

      {/* Upper back / rhomboids */}
      {muscle('back', <>
        <rect x="78" y="112" width="44" height="46" rx="9" />
      </>)}

      {/* Triceps */}
      {muscle('triceps', <>
        <ellipse cx="30" cy="130" rx="10" ry="30" />
        <ellipse cx="170" cy="130" rx="10" ry="30" />
      </>)}

      {/* Forearms (extensor side) */}
      {muscle('forearms', <>
        <ellipse cx="30" cy="186" rx="9" ry="24" />
        <ellipse cx="170" cy="186" rx="9" ry="24" />
      </>)}

      {/* Lower back / erector spinae */}
      {muscle('lower-back', <>
        <rect x="83" y="162" width="34" height="40" rx="7" />
      </>)}

      {/* Glutes */}
      {muscle('glutes', <>
        <ellipse cx="76" cy="228" rx="23" ry="26" />
        <ellipse cx="124" cy="228" rx="23" ry="26" />
      </>)}

      {/* Hamstrings */}
      {muscle('hamstrings', <>
        <ellipse cx="74" cy="306" rx="17" ry="46" />
        <ellipse cx="126" cy="306" rx="17" ry="46" />
      </>)}

      {/* Calves (gastrocnemius) */}
      {muscle('calves', <>
        <ellipse cx="74" cy="394" rx="14" ry="36" />
        <ellipse cx="126" cy="394" rx="14" ry="36" />
      </>)}
    </svg>
  )
}

export default function BodygraphTab() {
  const [muscleCounts, setMuscleCounts] = useState<Record<string, number>>({})
  const [rankColors, setRankColors] = useState<Record<string, string>>({})
  const [muscleRanks, setMuscleRanks] = useState<Record<string, { tier: Tier; displayName: string }>>({})
  const [hasProfile, setHasProfile] = useState(false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [allPRs, setAllPRs] = useState<PersonalRecord[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)
  const [muscleDetailExs, setMuscleDetailExs] = useState<MuscleDetailEx[]>([])
  const [lastWorkout, setLastWorkout] = useState<{ date: string; muscleCount: number } | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)

  const load = useCallback(async () => {
    const [workouts, exList, prof, prs] = await Promise.all([
        getWorkouts(), getExercises(), getUserProfile(), getAllPersonalRecords(),
      ])
      setExercises(exList)
      setAllPRs(prs)
      setProfile(prof)
      setHasProfile(!!prof)

      const cutoff = subDays(new Date(), 7).toISOString().slice(0, 10)
      const exMap = Object.fromEntries(exList.map(e => [e.id, e.primaryMuscles]))

      const counts: Record<string, number> = {}
      for (const w of workouts.filter(w => w.date >= cutoff)) {
        for (const ex of (w.detailedExercises ?? [])) {
          for (const m of (exMap[ex.exerciseId] ?? [])) {
            counts[m] = (counts[m] ?? 0) + ex.sets.filter(s => s.completed).length
          }
        }
      }
      setMuscleCounts(counts)

      const recentSorted = workouts
        .filter(w => w.date >= cutoff)
        .sort((a, b) => b.date.localeCompare(a.date))
      if (recentSorted.length > 0) {
        const muscleSet = new Set<string>()
        for (const ex of (recentSorted[0].detailedExercises ?? [])) {
          for (const m of (exMap[ex.exerciseId] ?? [])) muscleSet.add(m)
        }
        setLastWorkout({ date: recentSorted[0].date, muscleCount: muscleSet.size })
      }

      if (!prof) { setRankColors({}); setMuscleRanks({}); return }

      const exCatMap = Object.fromEntries(exList.map(e => [e.id, e.category]))
      const muscleToEx: Record<string, string[]> = {}
      for (const ex of exList) {
        for (const m of ex.primaryMuscles) {
          muscleToEx[m] = muscleToEx[m] ?? []
          muscleToEx[m].push(ex.id)
        }
      }

      const colors: Record<string, string> = {}
      const ranks: Record<string, { tier: Tier; displayName: string }> = {}
      for (const [mId, exIds] of Object.entries(muscleToEx)) {
        let best = -1
        let bestColor = ''
        let bestTier: Tier | null = null
        let bestDisplay = ''
        for (const exId of exIds) {
          const pr = prs.find(p => p.exerciseId === exId)
          if (!pr) continue
          const rank = computeRank(pr.est1RM, prof.bodyweightKg, prof.gender, exId, exCatMap[exId] ?? '')
          if (!rank) continue
          const score = TIERS.indexOf(rank.tier) * 300 + (rank.subTier - 1) * 100 + rank.lp
          if (score > best) {
            best = score
            bestColor = TIER_COLORS[rank.tier].bg
            bestTier = rank.tier
            bestDisplay = rank.displayName
          }
        }
        if (bestColor && bestTier) {
          colors[mId] = bestColor
          ranks[mId] = { tier: bestTier, displayName: bestDisplay }
        }
      }
      setRankColors(colors)
      setMuscleRanks(ranks)
  }, [])

  useEffect(() => { load() }, [load])

  function handleTapMuscle(muscleId: string) {
    setSelectedMuscle(muscleId)
    const exs = exercises.filter(e => e.primaryMuscles.includes(muscleId))
    if (!profile) {
      setMuscleDetailExs(exs.map(ex => ({ exercise: ex, rank: null })))
      return
    }
    const exCatMap = Object.fromEntries(exercises.map(e => [e.id, e.category]))
    const detailed: MuscleDetailEx[] = exs.map(ex => {
      const pr = allPRs.find(p => p.exerciseId === ex.id)
      const rank = pr
        ? computeRank(pr.est1RM, profile.bodyweightKg, profile.gender, ex.id, exCatMap[ex.id] ?? '')
        : null
      return { exercise: ex, rank }
    })
    detailed.sort((a, b) => {
      const sa = a.rank ? TIERS.indexOf(a.rank.tier) * 300 + (a.rank.subTier - 1) * 100 + a.rank.lp : -1
      const sb = b.rank ? TIERS.indexOf(b.rank.tier) * 300 + (b.rank.subTier - 1) * 100 + b.rank.lp : -1
      return sb - sa
    })
    setMuscleDetailExs(detailed)
  }

  function getFill(id: string) {
    if (rankColors[id]) return rankColors[id]
    return (muscleCounts[id] ?? 0) > 0 ? ACTIVE_COLOR : UNRANKED_INACTIVE
  }

  function getOpacity(id: string) {
    if (rankColors[id]) return 1
    return (muscleCounts[id] ?? 0) > 0 ? 0.72 : 0.38
  }

  function hasHighlight(id: string) {
    return !!rankColors[id]
  }

  const rankedMuscles = Object.entries(muscleRanks)
    .sort((a, b) => TIERS_ORDERED.indexOf(b[1].tier) - TIERS_ORDERED.indexOf(a[1].tier))

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      {/* Side-by-side body figures */}
      <div
        className="rounded-3xl p-4 border"
        style={{ background: 'var(--loft-card)', borderColor: 'var(--loft-border)' }}
      >
        <div className="flex justify-between mb-2 px-1">
          <span className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--loft-muted)' }}>FRONT</span>
          <span className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--loft-muted)' }}>BACK</span>
        </div>
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <BodyFront
              getFill={getFill}
              getOpacity={getOpacity}
              onTap={handleTapMuscle}
              hasHighlight={hasHighlight}
              prefix="front"
            />
          </div>
          <div className="flex-1">
            <BodyBack
              getFill={getFill}
              getOpacity={getOpacity}
              onTap={handleTapMuscle}
              hasHighlight={hasHighlight}
              prefix="back"
            />
          </div>
        </div>
        <p className="text-center text-[10px] mt-2" style={{ color: 'var(--loft-faint)' }}>
          Tap any muscle for exercises
        </p>
      </div>

      {/* Rank colour legend */}
      {hasProfile && (
        <div
          className="rounded-2xl px-4 py-3 border"
          style={{ background: 'var(--loft-card)', borderColor: 'var(--loft-border)' }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--loft-muted)' }}>
            Colour = your strength rank for that muscle
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {TIERS_ORDERED.map(tier => (
              <div key={tier} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TIER_COLORS[tier].bg }} />
                <span className="text-[10px] capitalize" style={{ color: 'var(--loft-muted)' }}>{tier}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No profile — tappable CTA card */}
      {!hasProfile && (
        <button
          onClick={() => setShowProfileModal(true)}
          className="w-full rounded-2xl p-4 text-left"
          style={{
            background: 'rgba(6,182,212,0.07)',
            border: '1.5px solid rgba(6,182,212,0.25)',
            boxShadow: '0 0 20px rgba(6,182,212,0.08)',
          }}
        >
          <div className="flex items-start gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(6,182,212,0.12)' }}
            >
              <Shield size={18} style={{ color: 'var(--loft-accent)' }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--loft-text)' }}>
                Set up your Strength Profile
              </p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--loft-muted)' }}>
                Add your bodyweight, height, age, and gender — required to rank your lifts
              </p>
            </div>
          </div>
          <div
            className="w-full py-2.5 rounded-xl text-sm font-bold text-center"
            style={{
              background: 'linear-gradient(135deg, var(--loft-accent), var(--loft-accent2))',
              boxShadow: '0 0 14px rgba(6,182,212,0.3)',
              color: '#fff',
            }}
          >
            SET UP PROFILE
          </div>
        </button>
      )}

      {/* Last workout card */}
      {lastWorkout && (
        <div
          className="rounded-2xl px-4 py-3 border flex items-center gap-3"
          style={{ background: 'rgba(59,158,255,0.07)', borderColor: 'rgba(59,158,255,0.20)' }}
        >
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: 'var(--loft-text)' }}>Last workout</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--loft-muted)' }}>
              Trained&nbsp;
              <span style={{ color: 'var(--loft-accent)' }}>{lastWorkout.muscleCount}</span>
              &nbsp;muscle group{lastWorkout.muscleCount !== 1 ? 's' : ''} this week
            </p>
          </div>
          <span
            className="text-[11px] font-bold px-3 py-1.5 rounded-full loft-btn-accent"
          >
            View
          </span>
        </div>
      )}

      {/* Muscle Rankings */}
      {rankedMuscles.length > 0 && (
        <div>
          <h3 className="text-sm font-black mb-2" style={{ color: 'var(--loft-text)' }}>
            Muscle Rankings
          </h3>
          <div className="space-y-1.5">
            {rankedMuscles.map(([id, { tier, displayName }]) => (
              <button
                key={id}
                onClick={() => handleTapMuscle(id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left"
                style={{ background: 'var(--loft-card)', borderColor: 'var(--loft-border)' }}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: TIER_COLORS[tier].bg }}
                />
                <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--loft-text)' }}>
                  {MUSCLE_LABELS[id] ?? id}
                </span>
                <span className="text-xs font-bold" style={{ color: TIER_COLORS[tier].bg }}>
                  {displayName}
                </span>
                <ChevronRight size={14} style={{ color: 'var(--loft-faint)' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Muscle detail bottom sheet */}
      <AnimatePresence>
        {selectedMuscle && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              style={{ background: '#000' }}
              onClick={() => setSelectedMuscle(null)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl pb-safe flex flex-col"
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

              {/* Header */}
              <div
                className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b"
                style={{ borderColor: 'var(--loft-border)' }}
              >
                <div className="flex items-center gap-2.5">
                  {rankColors[selectedMuscle] && (
                    <div
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: rankColors[selectedMuscle] }}
                    />
                  )}
                  <div>
                    <h3 className="text-base font-bold" style={{ color: 'var(--loft-text)' }}>
                      {MUSCLE_LABELS[selectedMuscle] ?? selectedMuscle}
                    </h3>
                    {muscleRanks[selectedMuscle] && (
                      <p className="text-xs font-semibold" style={{ color: rankColors[selectedMuscle] }}>
                        {muscleRanks[selectedMuscle].displayName}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedMuscle(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--loft-card)' }}
                >
                  <X size={16} style={{ color: 'var(--loft-muted)' }} />
                </button>
              </div>

              {/* Exercise list */}
              <div className="flex-1 overflow-y-auto scroll-area px-4 py-3 space-y-2">
                {muscleDetailExs.length === 0 ? (
                  <p className="text-sm text-center py-6" style={{ color: 'var(--loft-muted)' }}>
                    No exercises found for this muscle
                  </p>
                ) : (
                  muscleDetailExs.map(({ exercise: ex, rank }) => (
                    <div
                      key={ex.id}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 border"
                      style={{ background: 'var(--loft-card)', borderColor: 'var(--loft-border)' }}
                    >
                      <ExerciseIcon exerciseId={ex.id} category={ex.category} size={18} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--loft-text)' }}>
                          {ex.name}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--loft-muted)' }}>{ex.equipment}</p>
                      </div>
                      {rank ? (
                        <span
                          className="text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0"
                          style={{
                            background: `${TIER_COLORS[rank.tier].bg}22`,
                            color: TIER_COLORS[rank.tier].bg,
                            border: `1px solid ${TIER_COLORS[rank.tier].bg}44`,
                          }}
                        >
                          {rank.displayName}
                        </span>
                      ) : (muscleCounts[selectedMuscle] ?? 0) > 0 ? (
                        <span
                          className="text-[11px] px-2 py-1 rounded-full flex-shrink-0"
                          style={{ background: 'rgba(59,158,255,0.12)', color: 'var(--loft-accent)' }}
                        >
                          {muscleCounts[selectedMuscle]} sets
                        </span>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Profile setup modal — triggered from the CTA card */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => {
          setShowProfileModal(false)
          load()
        }}
      />
    </div>
  )
}
