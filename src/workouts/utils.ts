import { format, subDays, parseISO } from 'date-fns'
import type { Workout, DailyQuest, UserProgress, PersonalRecord } from '../types'
import { questPool } from '../data/quests'
import { achievementsList } from '../data/achievements'

export function calcLevel(totalXP: number): number {
  return Math.floor(Math.sqrt(totalXP / 50)) + 1
}

export function calcLevelXP(level: number): number {
  return (level - 1) ** 2 * 50
}

export function calcNextLevelXP(level: number): number {
  return level ** 2 * 50
}

export function calcLevelProgress(totalXP: number): number {
  const level = calcLevel(totalXP)
  const current = calcLevelXP(level)
  const next = calcNextLevelXP(level)
  if (next === current) return 1
  return (totalXP - current) / (next - current)
}

export function epley1RM(weight: number, reps: number): number {
  if (reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export function computeStreak(workouts: Workout[]): number {
  if (!workouts.length) return 0
  const dates = new Set(workouts.map(w => w.date))
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  let current = dates.has(todayStr) ? new Date() : subDays(new Date(), 1)
  let streak = 0
  while (dates.has(format(current, 'yyyy-MM-dd'))) {
    streak++
    current = subDays(current, 1)
  }
  return streak
}

export function getDayOfYear(date: Date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

export function getDailyQuest(dateStr: string): DailyQuest {
  const day = getDayOfYear(parseISO(dateStr))
  return questPool[day % questPool.length]
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function checkQuestCompletion(
  quest: DailyQuest,
  todayWorkouts: Workout[],
  newPRsToday: boolean,
  exerciseMuscleMap: Record<string, string[]>
): boolean {
  switch (quest.type) {
    case 'workout':
      return todayWorkouts.length > 0
    case 'cardio':
      return todayWorkouts.some(w => w.type === 'cardio')
    case 'pr':
      return newPRsToday
    case 'sets': {
      const total = todayWorkouts.reduce((sum, w) => {
        if (!w.detailedExercises) return sum
        return sum + w.detailedExercises.reduce((s2, ex) =>
          s2 + ex.sets.filter(s => s.completed).length, 0)
      }, 0)
      return total >= (quest.target ?? 1)
    }
    case 'muscle': {
      if (!quest.targetMuscle) return false
      return todayWorkouts.some(w =>
        w.detailedExercises?.some(ex => {
          const muscles = exerciseMuscleMap[ex.exerciseId] ?? []
          return muscles.includes(quest.targetMuscle!) && ex.sets.some(s => s.completed)
        }) ?? false
      )
    }
    case 'volume': {
      const total = todayWorkouts.reduce((sum, w) => {
        if (w.totalVolume != null) return sum + w.totalVolume
        if (!w.detailedExercises) return sum
        return sum + w.detailedExercises.reduce((s2, ex) =>
          s2 + ex.sets.filter(s => s.completed).reduce((s3, s) => s3 + s.weight * s.reps, 0), 0)
      }, 0)
      return total >= (quest.target ?? 0)
    }
    default:
      return false
  }
}

export function checkAchievements(
  workouts: Workout[],
  progress: UserProgress,
  prs: Record<string, PersonalRecord>,
  exerciseMuscleMap: Record<string, string[]>
): string[] {
  const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')
  const recentWorkouts = workouts.filter(w => w.date >= sevenDaysAgo)

  const majorGroups = ['chest', 'lats', 'quads', 'shoulders', 'biceps', 'abs']
  const recentMuscles = new Set<string>()
  for (const w of recentWorkouts) {
    for (const ex of (w.detailedExercises ?? [])) {
      for (const m of (exerciseMuscleMap[ex.exerciseId] ?? [])) {
        recentMuscles.add(m)
      }
    }
  }
  const allMusclesTrained = majorGroups.every(m => recentMuscles.has(m))

  const checks: Record<string, boolean> = {
    'first-workout': workouts.length >= 1,
    'five-workouts': workouts.length >= 5,
    'ten-workouts': workouts.length >= 10,
    'fifty-workouts': workouts.length >= 50,
    'hundred-workouts': workouts.length >= 100,
    'streak-3': progress.currentStreak >= 3,
    'streak-7': progress.currentStreak >= 7,
    'streak-30': progress.currentStreak >= 30,
    'streak-100': progress.currentStreak >= 100,
    'bench-100': (prs['barbell-bench-press']?.weight ?? 0) >= 100,
    'squat-100': (prs['barbell-squat']?.weight ?? 0) >= 100,
    'deadlift-100': (prs['deadlift']?.weight ?? 0) >= 100,
    'overhead-60': (prs['overhead-press']?.weight ?? 0) >= 60,
    'all-muscles': allMusclesTrained,
    'volume-10k': workouts.some(w => (w.totalVolume ?? 0) >= 10000),
    'first-pr': Object.keys(prs).length >= 1,
    'five-prs': Object.keys(prs).length >= 5,
    'ten-prs': Object.keys(prs).length >= 10,
    'twenty-prs': Object.keys(prs).length >= 20,
    'level-5': progress.level >= 5,
    'level-10': progress.level >= 10,
    'level-20': progress.level >= 20,
    'ten-quests': progress.completedQuests.length >= 10,
    'twenty-quests': progress.completedQuests.length >= 20,
    'five-unlocks': progress.unlockedCosmetics.length >= 5,
  }

  return achievementsList
    .filter(a => checks[a.id] && !progress.achievements.includes(a.id))
    .map(a => a.id)
}

export function getAchievementProgress(
  id: string,
  workouts: Workout[],
  progress: UserProgress,
  prs: Record<string, PersonalRecord>
): { current: number; target: number } | null {
  const w = workouts.length
  const s = progress.currentStreak
  const l = progress.level
  const p = Object.keys(prs).length
  const q = progress.completedQuests.length
  const c = progress.unlockedCosmetics.length

  const map: Record<string, { current: number; target: number }> = {
    'first-workout': { current: Math.min(w, 1), target: 1 },
    'five-workouts': { current: Math.min(w, 5), target: 5 },
    'ten-workouts': { current: Math.min(w, 10), target: 10 },
    'fifty-workouts': { current: Math.min(w, 50), target: 50 },
    'hundred-workouts': { current: Math.min(w, 100), target: 100 },
    'streak-3': { current: Math.min(s, 3), target: 3 },
    'streak-7': { current: Math.min(s, 7), target: 7 },
    'streak-30': { current: Math.min(s, 30), target: 30 },
    'streak-100': { current: Math.min(s, 100), target: 100 },
    'bench-100': { current: Math.min(prs['barbell-bench-press']?.weight ?? 0, 100), target: 100 },
    'squat-100': { current: Math.min(prs['barbell-squat']?.weight ?? 0, 100), target: 100 },
    'deadlift-100': { current: Math.min(prs['deadlift']?.weight ?? 0, 100), target: 100 },
    'overhead-60': { current: Math.min(prs['overhead-press']?.weight ?? 0, 60), target: 60 },
    'first-pr': { current: Math.min(p, 1), target: 1 },
    'five-prs': { current: Math.min(p, 5), target: 5 },
    'ten-prs': { current: Math.min(p, 10), target: 10 },
    'twenty-prs': { current: Math.min(p, 20), target: 20 },
    'level-5': { current: Math.min(l, 5), target: 5 },
    'level-10': { current: Math.min(l, 10), target: 10 },
    'level-20': { current: Math.min(l, 20), target: 20 },
    'ten-quests': { current: Math.min(q, 10), target: 10 },
    'twenty-quests': { current: Math.min(q, 20), target: 20 },
    'five-unlocks': { current: Math.min(c, 5), target: 5 },
  }

  return map[id] ?? null
}
