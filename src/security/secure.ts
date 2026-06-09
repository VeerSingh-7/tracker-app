import { getAppSecurity, saveAppSecurity } from '../db'

// Preset recovery questions for the lock-screen setup flow. The UI also offers a
// "Write my own" custom option alongside these.
export const RECOVERY_QUESTIONS = [
  "First pet's name",
  'Town you were born in',
  "Favourite teacher's name",
  "Mother's maiden name",
  'Name of your first school',
]

export const CUSTOM_QUESTION = '__custom__'

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 16 random bytes as hex — unique per credential so identical passwords hash differently.
export function randomSalt(bytes = 16): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// SHA-256(`${salt}:${value}`) → hex. Convenience privacy, not bank-level security.
export async function hashWithSalt(value: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${value}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

// Recovery answers are matched case/space-insensitively so the user isn't locked
// out by capitalisation or trailing spaces.
export function normaliseAnswer(answer: string): string {
  return answer.trim().toLowerCase()
}

export async function hasPasswordSet(): Promise<boolean> {
  return (await getAppSecurity()) !== null
}

export async function getRecoveryQuestion(): Promise<string | null> {
  return (await getAppSecurity())?.recoveryQuestion ?? null
}

export async function verifyPassword(password: string): Promise<boolean> {
  const sec = await getAppSecurity()
  if (!sec) return false
  return (await hashWithSalt(password, sec.salt)) === sec.passwordHash
}

export async function verifyRecoveryAnswer(answer: string): Promise<boolean> {
  const sec = await getAppSecurity()
  if (!sec) return false
  return (await hashWithSalt(normaliseAnswer(answer), sec.recoverySalt)) === sec.recoveryHash
}

// First-time setup: write password + recovery credentials from scratch.
export async function setupSecurity(password: string, question: string, answer: string): Promise<void> {
  const salt = randomSalt()
  const recoverySalt = randomSalt()
  const now = new Date().toISOString()
  await saveAppSecurity({
    id: 'main',
    salt,
    passwordHash: await hashWithSalt(password, salt),
    recoveryQuestion: question,
    recoverySalt,
    recoveryHash: await hashWithSalt(normaliseAnswer(answer), recoverySalt),
    createdAt: now,
    updatedAt: now,
  })
}

// Re-salt and re-hash a new password, keeping the existing recovery credentials.
export async function changePassword(newPassword: string): Promise<void> {
  const sec = await getAppSecurity()
  if (!sec) throw new Error('No password is set up yet')
  const salt = randomSalt()
  await saveAppSecurity({
    ...sec,
    salt,
    passwordHash: await hashWithSalt(newPassword, salt),
    updatedAt: new Date().toISOString(),
  })
}

// Replace the recovery question/answer, keeping the existing password.
export async function changeRecovery(question: string, answer: string): Promise<void> {
  const sec = await getAppSecurity()
  if (!sec) throw new Error('No password is set up yet')
  const recoverySalt = randomSalt()
  await saveAppSecurity({
    ...sec,
    recoveryQuestion: question,
    recoverySalt,
    recoveryHash: await hashWithSalt(normaliseAnswer(answer), recoverySalt),
    updatedAt: new Date().toISOString(),
  })
}
