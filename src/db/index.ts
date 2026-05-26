import { openDB, type IDBPDatabase } from 'idb'
import type { Workout, SpendingEntry, IncomeEntry, GameScore, Exercise, PersonalRecord, UserProgress, UserProfile, Routine, TournamentRecord } from '../types'
import { defaultExercises } from '../data/exercises'
import { calcLevel } from '../workouts/utils'

interface TrackerDB {
  workouts: { key: string; value: Workout; indexes: { 'by-date': string } }
  spending: { key: string; value: SpendingEntry; indexes: { 'by-date': string } }
  income: { key: string; value: IncomeEntry; indexes: { 'by-date': string } }
  gameScores: { key: string; value: GameScore }
  exercises: { key: string; value: Exercise }
  personalRecords: { key: string; value: PersonalRecord }
  userProgress: { key: string; value: UserProgress }
  userProfile: { key: string; value: UserProfile }
  routines: { key: string; value: Routine }
  tournaments: { key: string; value: TournamentRecord }
}

let dbPromise: Promise<IDBPDatabase<TrackerDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TrackerDB>('tracker-app', 9, {
      async upgrade(db, oldVersion, _nv, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('workouts', { keyPath: 'id' }).createIndex('by-date', 'date')
          db.createObjectStore('spending', { keyPath: 'id' }).createIndex('by-date', 'date')
          // habits and mood were created in v1 but removed in v6 — not created for fresh installs
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('income')) {
            db.createObjectStore('income', { keyPath: 'id' }).createIndex('by-date', 'date')
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('gameScores')) {
            db.createObjectStore('gameScores', { keyPath: 'gameId' })
          }
        }
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains('exercises')) {
            db.createObjectStore('exercises', { keyPath: 'id' })
          }
          if (!db.objectStoreNames.contains('personalRecords')) {
            db.createObjectStore('personalRecords', { keyPath: 'exerciseId' })
          }
          if (!db.objectStoreNames.contains('userProgress')) {
            db.createObjectStore('userProgress', { keyPath: 'id' })
          }
        }
        if (oldVersion < 5 && oldVersion >= 1) {
          // Migrate existing habits: assign categoryId (store being deleted in v6 anyway)
          if (db.objectStoreNames.contains('habits')) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const habitStore = (transaction as any).objectStore('habits')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const all = await habitStore.getAll() as any[]
            await Promise.all(
              all.filter((h: { categoryId?: string }) => !h.categoryId)
                .map((h: { name: string }) => habitStore.put({ ...h, categoryId: 'lifestyle', targetPerWeek: 7 }))
            )
          }
        }
        if (oldVersion < 6) {
          // Remove habits and mood stores — no longer part of the app
          const names = Array.from(db.objectStoreNames)
          if (names.includes('habits')) db.deleteObjectStore('habits')
          if (names.includes('mood')) db.deleteObjectStore('mood')
        }
        if (oldVersion < 7) {
          if (!db.objectStoreNames.contains('userProfile')) {
            db.createObjectStore('userProfile', { keyPath: 'id' })
          }
        }
        if (oldVersion < 8) {
          if (!db.objectStoreNames.contains('routines')) {
            db.createObjectStore('routines', { keyPath: 'id' })
          }
        }
        if (oldVersion < 9) {
          if (!db.objectStoreNames.contains('tournaments')) {
            db.createObjectStore('tournaments', { keyPath: 'id' })
          }
        }
      },
    })
  }
  return dbPromise
}

// Workouts
export async function getWorkouts(): Promise<Workout[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('workouts', 'by-date')
  return all.reverse()
}
export async function saveWorkout(w: Workout): Promise<void> {
  await (await getDB()).put('workouts', w)
}
export async function deleteWorkout(id: string): Promise<void> {
  await (await getDB()).delete('workouts', id)
}

// Spending
export async function getSpending(): Promise<SpendingEntry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('spending', 'by-date')
  return all.reverse()
}
export async function saveSpending(e: SpendingEntry): Promise<void> {
  await (await getDB()).put('spending', e)
}
export async function deleteSpending(id: string): Promise<void> {
  await (await getDB()).delete('spending', id)
}

// Income
export async function getIncome(): Promise<IncomeEntry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('income', 'by-date')
  return all.reverse()
}
export async function saveIncome(e: IncomeEntry): Promise<void> {
  await (await getDB()).put('income', e)
}
export async function deleteIncome(id: string): Promise<void> {
  await (await getDB()).delete('income', id)
}

// Game Scores
export async function getGameScore(gameId: string): Promise<GameScore | undefined> {
  return (await getDB()).get('gameScores', gameId)
}
export async function saveGameScore(score: GameScore): Promise<void> {
  await (await getDB()).put('gameScores', score)
}
export async function getAllGameScores(): Promise<GameScore[]> {
  return (await getDB()).getAll('gameScores')
}

// Exercises
export async function getExercises(): Promise<Exercise[]> {
  const db = await getDB()
  const all = await db.getAll('exercises')
  const defaultCount = all.filter(e => !e.isCustom).length
  if (defaultCount < defaultExercises.length) {
    // Upsert all default exercises (adds new ones without touching custom exercises)
    const tx = db.transaction('exercises', 'readwrite')
    for (const ex of defaultExercises) await tx.store.put(ex)
    await tx.done
    return db.getAll('exercises')
  }
  return all
}
export async function saveExercise(e: Exercise): Promise<void> {
  await (await getDB()).put('exercises', e)
}
export async function deleteExercise(id: string): Promise<void> {
  await (await getDB()).delete('exercises', id)
}

// Personal Records
export async function getPersonalRecord(exerciseId: string): Promise<PersonalRecord | undefined> {
  return (await getDB()).get('personalRecords', exerciseId)
}
export async function getAllPersonalRecords(): Promise<PersonalRecord[]> {
  return (await getDB()).getAll('personalRecords')
}
export async function savePersonalRecord(pr: PersonalRecord): Promise<void> {
  await (await getDB()).put('personalRecords', pr)
}

// User Progress
const DEFAULT_PROGRESS: UserProgress = {
  id: 'main',
  level: 1,
  xp: 0,
  totalXP: 0,
  coins: 0,
  currentStreak: 0,
  longestStreak: 0,
  dailyQuestId: null,
  dailyQuestDate: null,
  completedQuests: [],
  achievements: [],
  unlockedCosmetics: ['theme-ocean'],
  activeTheme: 'theme-ocean',
}

export async function getUserProgress(): Promise<UserProgress> {
  const db = await getDB()
  const p = await db.get('userProgress', 'main')
  return p ?? DEFAULT_PROGRESS
}

export async function saveUserProgress(p: UserProgress): Promise<void> {
  const level = calcLevel(p.totalXP)
  const levelXP = (level - 1) ** 2 * 50
  await (await getDB()).put('userProgress', { ...p, level, xp: p.totalXP - levelXP })
}

// User Profile
export async function getUserProfile(): Promise<UserProfile | null> {
  return (await getDB()).get('userProfile', 'main') ?? null
}
export async function saveUserProfile(p: UserProfile): Promise<void> {
  await (await getDB()).put('userProfile', p)
}

// Routines
export async function getRoutines(): Promise<Routine[]> {
  return (await getDB()).getAll('routines')
}
export async function saveRoutine(r: Routine): Promise<void> {
  await (await getDB()).put('routines', r)
}
export async function deleteRoutine(id: string): Promise<void> {
  await (await getDB()).delete('routines', id)
}

// Tournaments
export async function saveTournament(t: TournamentRecord): Promise<void> {
  await (await getDB()).put('tournaments', t)
}
export async function getAllTournaments(): Promise<TournamentRecord[]> {
  return (await getDB()).getAll('tournaments')
}

// Export / Import / Clear
export async function exportAllData() {
  const db = await getDB()
  return {
    workouts: await db.getAll('workouts'),
    spending: await db.getAll('spending'),
    income: await db.getAll('income'),
    gameScores: await db.getAll('gameScores'),
    exercises: await db.getAll('exercises'),
    personalRecords: await db.getAll('personalRecords'),
    userProgress: await db.getAll('userProgress'),
    userProfile: await db.getAll('userProfile'),
    routines: await db.getAll('routines'),
    tournaments: await db.getAll('tournaments'),
  }
}

export async function importAllData(data: {
  workouts?: Workout[]
  spending?: SpendingEntry[]
  income?: IncomeEntry[]
  gameScores?: GameScore[]
  exercises?: Exercise[]
  personalRecords?: PersonalRecord[]
  userProgress?: UserProgress[]
  userProfile?: UserProfile[]
  routines?: Routine[]
  tournaments?: TournamentRecord[]
}) {
  const db = await getDB()
  const stores = ['workouts', 'spending', 'income', 'gameScores', 'exercises', 'personalRecords', 'userProgress', 'userProfile', 'routines', 'tournaments'] as const
  const tx = db.transaction(stores, 'readwrite')
  if (data.workouts) for (const w of data.workouts) await tx.objectStore('workouts').put(w)
  if (data.spending) for (const s of data.spending) await tx.objectStore('spending').put(s)
  if (data.income) for (const i of data.income) await tx.objectStore('income').put(i)
  if (data.gameScores) for (const g of data.gameScores) await tx.objectStore('gameScores').put(g)
  if (data.exercises) for (const e of data.exercises) await tx.objectStore('exercises').put(e)
  if (data.personalRecords) for (const p of data.personalRecords) await tx.objectStore('personalRecords').put(p)
  if (data.userProgress) for (const p of data.userProgress) await tx.objectStore('userProgress').put(p)
  if (data.userProfile) for (const p of data.userProfile) await tx.objectStore('userProfile').put(p)
  if (data.routines) for (const r of data.routines) await tx.objectStore('routines').put(r)
  if (data.tournaments) for (const t of data.tournaments) await tx.objectStore('tournaments').put(t)
  await tx.done
}

export async function clearAllData() {
  const db = await getDB()
  const stores = ['workouts', 'spending', 'income', 'gameScores', 'exercises', 'personalRecords', 'userProgress', 'userProfile', 'routines', 'tournaments'] as const
  const tx = db.transaction(stores, 'readwrite')
  await tx.objectStore('workouts').clear()
  await tx.objectStore('spending').clear()
  await tx.objectStore('income').clear()
  await tx.objectStore('gameScores').clear()
  await tx.objectStore('exercises').clear()
  await tx.objectStore('personalRecords').clear()
  await tx.objectStore('userProgress').clear()
  await tx.objectStore('userProfile').clear()
  await tx.objectStore('routines').clear()
  await tx.objectStore('tournaments').clear()
  await tx.done
}
