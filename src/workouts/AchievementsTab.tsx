import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { getWorkouts, getAllPersonalRecords, getUserProgress } from '../db'
import { calcLevel, calcLevelXP, calcNextLevelXP, calcLevelProgress, getAchievementProgress } from './utils'
import { achievementsList } from '../data/achievements'
import type { UserProgress, PersonalRecord, Workout } from '../types'

export default function AchievementsTab() {
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [prs, setPRs] = useState<Record<string, PersonalRecord>>({})

  useEffect(() => {
    Promise.all([getUserProgress(), getWorkouts(), getAllPersonalRecords()]).then(([p, w, prList]) => {
      setProgress(p)
      setWorkouts(w)
      setPRs(Object.fromEntries(prList.map(pr => [pr.exerciseId, pr])))
    })
  }, [])

  const level = progress ? calcLevel(progress.totalXP) : 1
  const xpProgress = progress ? calcLevelProgress(progress.totalXP) : 0
  const xpInLevel = progress ? progress.totalXP - calcLevelXP(level) : 0
  const xpForLevel = progress ? calcNextLevelXP(level) - calcLevelXP(level) : 50

  const unlockedIds = new Set(progress?.achievements ?? [])

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      {/* Level hero */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-blue-200 text-xs font-semibold uppercase tracking-wider">Current Level</p>
            <p className="text-4xl font-black">{level}</p>
          </div>
          <div className="text-right">
            <p className="text-blue-200 text-xs">Total XP</p>
            <p className="text-2xl font-bold">{progress?.totalXP ?? 0}</p>
            <p className="text-blue-200 text-xs">{progress?.achievements.length ?? 0} / {achievementsList.length} badges</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white/20 rounded-full h-2.5">
            <motion.div
              className="bg-white h-2.5 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(xpProgress * 100, 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <span className="text-xs text-blue-200 flex-shrink-0">{xpInLevel} / {xpForLevel}</span>
        </div>
        <p className="text-xs text-blue-200 mt-1">{xpForLevel - xpInLevel} XP to Level {level + 1}</p>
      </div>

      {/* Unlocked count */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Badges — {unlockedIds.size} / {achievementsList.length} unlocked
        </p>
      </div>

      {/* Achievement grid */}
      <div className="grid grid-cols-2 gap-3">
        {achievementsList.map(ach => {
          const unlocked = unlockedIds.has(ach.id)
          const progressData = progress ? getAchievementProgress(ach.id, workouts, progress, prs) : null
          const pct = progressData ? progressData.current / progressData.target : unlocked ? 1 : 0

          return (
            <motion.div
              key={ach.id}
              layout
              className={`rounded-2xl p-4 border transition-all ${
                unlocked
                  ? 'bg-white dark:bg-slate-900 border-blue-100 dark:border-blue-900/50 shadow-sm shadow-blue-100 dark:shadow-blue-900/30'
                  : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <span className={`text-2xl ${unlocked ? '' : 'grayscale opacity-40'}`}>{ach.icon}</span>
                {unlocked && <span className="text-[10px] bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-bold">✓</span>}
              </div>
              <p className={`text-sm font-bold mb-0.5 ${unlocked ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>
                {ach.name}
              </p>
              <p className="text-[11px] text-slate-400 leading-tight mb-2">{ach.conditionDescription}</p>

              {/* Progress bar */}
              {!unlocked && progressData && (
                <div>
                  <div className="bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mb-1">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(pct * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">{progressData.current} / {progressData.target}</p>
                </div>
              )}

              {ach.xpReward > 0 && (
                <p className={`text-[10px] font-semibold mt-1 ${unlocked ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}>
                  +{ach.xpReward} XP
                </p>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
