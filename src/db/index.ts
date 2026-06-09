import { openDB, type IDBPDatabase } from 'idb'
import type { Workout, SpendingEntry, IncomeEntry, GameScore, Exercise, PersonalRecord, UserProgress, UserProfile, Routine, TournamentRecord, RevSubject, RevTopic, RevCard, AppSecurity, Project, ProjectTransaction } from '../types'
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
  // Revision (feature removed; stores retained so the DB version doesn't go backwards)
  revSubjects: { key: string; value: RevSubject }
  revTopics: { key: string; value: RevTopic; indexes: { 'by-subject': string } }
  revCards: { key: string; value: RevCard; indexes: { 'by-topic': string; 'by-subject': string } }
  // App lock (single 'main' record holding salted password + recovery hashes)
  appSecurity: { key: string; value: AppSecurity }
  // Projects hub (replaced the old Money page). The old spending/income stores
  // are retained empty in the schema but are no longer read, written or seeded.
  projects: { key: string; value: Project }
  projectTransactions: { key: string; value: ProjectTransaction; indexes: { 'by-project': string } }
}

let dbPromise: Promise<IDBPDatabase<TrackerDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TrackerDB>('tracker-app', 13, {
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
        if (oldVersion < 10) {
          // Revision stores — retained in the schema so the DB version does not
          // go backwards. The Revision feature has been removed, so nothing reads,
          // writes, or seeds these stores anymore.
          if (!db.objectStoreNames.contains('revSubjects')) {
            db.createObjectStore('revSubjects', { keyPath: 'id' })
          }
          if (!db.objectStoreNames.contains('revTopics')) {
            db.createObjectStore('revTopics', { keyPath: 'id' }).createIndex('by-subject', 'subjectId')
          }
          if (!db.objectStoreNames.contains('revCards')) {
            const cardStore = db.createObjectStore('revCards', { keyPath: 'id' })
            cardStore.createIndex('by-topic', 'topicId')
            cardStore.createIndex('by-subject', 'subjectId')
          }
        }
        if (oldVersion < 12) {
          // App lock — additive store only; existing stores untouched.
          if (!db.objectStoreNames.contains('appSecurity')) {
            db.createObjectStore('appSecurity', { keyPath: 'id' })
          }
        }
        if (oldVersion < 13) {
          // Projects hub — additive stores only. The old spending/income stores
          // are left in place (and empty); their data is intentionally discarded.
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' })
          }
          if (!db.objectStoreNames.contains('projectTransactions')) {
            db.createObjectStore('projectTransactions', { keyPath: 'id' })
              .createIndex('by-project', 'projectId')
          }
          // Seed a single starter project (runs once, on the v13 migration).
          const projectStore = transaction.objectStore('projects')
          await projectStore.put({
            id: 'seed-ironside-mechanics',
            name: 'Ironside Mechanics',
            status: 'active',
            link: 'https://ironside-mechanics.framer.website',
            notes: 'Web design demo / portfolio piece',
            colour: '#3b9eff',
            createdAt: new Date().toISOString(),
          })
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

// Projects
export async function getProjects(): Promise<Project[]> {
  const all = await (await getDB()).getAll('projects')
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
export async function saveProject(p: Project): Promise<void> {
  await (await getDB()).put('projects', p)
}
export async function deleteProject(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['projects', 'projectTransactions'], 'readwrite')
  // Cascade: remove the project's transactions, then the project itself.
  const txnIds = await tx.objectStore('projectTransactions').index('by-project').getAllKeys(id)
  for (const key of txnIds) await tx.objectStore('projectTransactions').delete(key)
  await tx.objectStore('projects').delete(id)
  await tx.done
}

// Project Transactions
export async function getProjectTransactions(projectId: string): Promise<ProjectTransaction[]> {
  const all = await (await getDB()).getAllFromIndex('projectTransactions', 'by-project', projectId)
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}
export async function getAllProjectTransactions(): Promise<ProjectTransaction[]> {
  return (await getDB()).getAll('projectTransactions')
}
export async function saveProjectTransaction(t: ProjectTransaction): Promise<void> {
  await (await getDB()).put('projectTransactions', t)
}
export async function deleteProjectTransaction(id: string): Promise<void> {
  await (await getDB()).delete('projectTransactions', id)
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

// App Security (password lock). Stored as a single 'main' record; never exported,
// imported or cleared so the lock survives data backups/restores/wipes.
export async function getAppSecurity(): Promise<AppSecurity | null> {
  return (await (await getDB()).get('appSecurity', 'main')) ?? null
}
export async function saveAppSecurity(s: AppSecurity): Promise<void> {
  await (await getDB()).put('appSecurity', s)
}

// Export / Import / Clear
export async function exportAllData() {
  const db = await getDB()
  return {
    workouts: await db.getAll('workouts'),
    gameScores: await db.getAll('gameScores'),
    exercises: await db.getAll('exercises'),
    personalRecords: await db.getAll('personalRecords'),
    userProgress: await db.getAll('userProgress'),
    userProfile: await db.getAll('userProfile'),
    routines: await db.getAll('routines'),
    tournaments: await db.getAll('tournaments'),
    projects: await db.getAll('projects'),
    projectTransactions: await db.getAll('projectTransactions'),
  }
}

export async function importAllData(data: {
  workouts?: Workout[]
  gameScores?: GameScore[]
  exercises?: Exercise[]
  personalRecords?: PersonalRecord[]
  userProgress?: UserProgress[]
  userProfile?: UserProfile[]
  routines?: Routine[]
  tournaments?: TournamentRecord[]
  projects?: Project[]
  projectTransactions?: ProjectTransaction[]
}) {
  const db = await getDB()
  const stores = ['workouts', 'gameScores', 'exercises', 'personalRecords', 'userProgress', 'userProfile', 'routines', 'tournaments', 'projects', 'projectTransactions'] as const
  const tx = db.transaction(stores, 'readwrite')
  if (data.workouts) for (const w of data.workouts) await tx.objectStore('workouts').put(w)
  if (data.gameScores) for (const g of data.gameScores) await tx.objectStore('gameScores').put(g)
  if (data.exercises) for (const e of data.exercises) await tx.objectStore('exercises').put(e)
  if (data.personalRecords) for (const p of data.personalRecords) await tx.objectStore('personalRecords').put(p)
  if (data.userProgress) for (const p of data.userProgress) await tx.objectStore('userProgress').put(p)
  if (data.userProfile) for (const p of data.userProfile) await tx.objectStore('userProfile').put(p)
  if (data.routines) for (const r of data.routines) await tx.objectStore('routines').put(r)
  if (data.tournaments) for (const t of data.tournaments) await tx.objectStore('tournaments').put(t)
  if (data.projects) for (const p of data.projects) await tx.objectStore('projects').put(p)
  if (data.projectTransactions) for (const t of data.projectTransactions) await tx.objectStore('projectTransactions').put(t)
  await tx.done
}

export async function clearAllData() {
  const db = await getDB()
  const stores = ['workouts', 'gameScores', 'exercises', 'personalRecords', 'userProgress', 'userProfile', 'routines', 'tournaments', 'projects', 'projectTransactions'] as const
  const tx = db.transaction(stores, 'readwrite')
  for (const s of stores) await tx.objectStore(s).clear()
  await tx.done
}
