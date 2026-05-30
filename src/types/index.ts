export interface WorkoutExercise {
  name: string
  sets: number
  reps: number
  weight: number
}

export interface ExerciseSet {
  weight: number
  reps: number
  completed: boolean
  xpAwarded?: boolean
}

export interface WorkoutExerciseDetailed {
  exerciseId: string
  exerciseName: string
  sets: ExerciseSet[]
}

export interface Workout {
  id: string
  date: string
  type: 'cardio' | 'strength' | 'other'
  duration: number
  notes: string
  exercises: WorkoutExercise[]
  detailedExercises?: WorkoutExerciseDetailed[]
  xpEarned?: number
  totalVolume?: number
}

export interface Exercise {
  id: string
  name: string
  category: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  equipment: string
  instructions: string
  isCustom: boolean
}

export interface PersonalRecord {
  exerciseId: string
  exerciseName: string
  weight: number
  reps: number
  date: string
  est1RM: number
  rank?: string
  lp?: number
}

export interface UserProfile {
  id: 'main'
  gender: 'male' | 'female'
  bodyweightKg: number
  heightCm?: number
  dateOfBirth?: string   // 'YYYY-MM-DD'
  units?: 'metric' | 'imperial'
  preferredColor?: 'red' | 'blue'
  updatedAt: string
}

export interface UserProgress {
  id: 'main'
  level: number
  xp: number
  totalXP: number
  coins: number
  currentStreak: number
  longestStreak: number
  dailyQuestId: string | null
  dailyQuestDate: string | null
  completedQuests: string[]
  achievements: string[]
  unlockedCosmetics: string[]
  activeTheme: string
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  conditionDescription: string
  xpReward: number
}

export interface DailyQuest {
  id: string
  name: string
  description: string
  type: 'sets' | 'muscle' | 'pr' | 'workout' | 'volume' | 'cardio'
  target?: number
  targetMuscle?: string
  xpReward: number
  coinReward: number
}

export interface ShopItem {
  id: string
  name: string
  description: string
  category: 'theme' | 'icon' | 'frame'
  price: number
  preview: string
}

export interface SpendingEntry {
  id: string
  date: string
  amount: number
  category: 'food' | 'transport' | 'bills' | 'fun' | 'other'
  note: string
}

export interface IncomeEntry {
  id: string
  date: string
  amount: number
  source: 'work' | 'freelance' | 'gift' | 'other'
  note: string
}

export interface GameScore {
  gameId: string
  bestScore: number
  lastPlayed: string
  extra?: Record<string, unknown>
}

export interface RoutineExercise {
  exerciseId: string
  exerciseName: string
  sets: number
  targetReps?: number
  targetWeight?: number
}

export interface Routine {
  id: string
  name: string
  exercises: RoutineExercise[]
  createdAt: string
}

export interface TournamentRecord {
  id: string
  date: string
  mode: '2p' | 'ai'
  difficulty?: 'easy' | 'medium' | 'hard'
  games: string[]
  scores: Record<string, { p1: number; p2: number }>
  winner: 'p1' | 'p2' | 'draw'
}

// ─── Revision (study tool) ──────────────────────────────────────────────────
export interface RevSubject {
  id: string
  name: string
  examBoard: string      // e.g. 'AQA', 'Edexcel'
  tier: string           // 'Higher' | 'Foundation' | '' (no tier)
  colour: string         // hex accent colour
  createdAt: string
}

export interface RevTopic {
  id: string
  subjectId: string
  name: string
  order: number
  createdAt: string
}

export type RevCardType = 'quote_analysis' | 'theme_quotes' | 'character_arc' | 'term_definition' | 'basic'

export interface RevCard {
  id: string
  topicId: string
  subjectId: string
  front: string
  back: string
  createdAt: string
  // ── Richer card model (DB v11) ──
  cardType: RevCardType    // default 'basic'
  themes: string[]         // e.g. ['ambition','guilt'] — default []
  location: string         // e.g. 'Act 1 Scene 5', 'Ozymandias', '' — default ''
  reversible: boolean      // study back→front too — default false
  // ── Review-tracking fields ──
  // Initialised here but NOT used yet. Stage 2 (quizzes) and stage 3
  // (spaced repetition) will read/write these. Do not wire them up yet.
  lastReviewed: string | null
  timesReviewed: number
  timesCorrect: number
  timesWrong: number
}

export type Tab = 'dashboard' | 'workouts' | 'money' | 'games' | 'revision'
export type WorkoutSubTab = 'tracker' | 'library' | 'progress' | 'bodygraph' | 'achievements' | 'quest' | 'history' | 'shop'
