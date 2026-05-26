import { TIERS, EXERCISE_STANDARDS, CATEGORY_STANDARDS, TIER_COLORS, TIER_NAMES } from '../data/strengthStandards'
import type { Tier } from '../data/strengthStandards'

export interface RankInfo {
  tier: Tier
  subTier: 1 | 2 | 3
  lp: number
  rankString: string
  displayName: string
}

export function computeRank(
  est1RM: number,
  bodyweightKg: number,
  gender: 'male' | 'female',
  exerciseId: string,
  category: string,
): RankInfo | null {
  if (est1RM <= 0 || bodyweightKg <= 0) return null

  const standards = EXERCISE_STANDARDS[exerciseId] ?? CATEGORY_STANDARDS[category]
  if (!standards) return null

  const thresholds = gender === 'male' ? standards.male : standards.female
  const ratio = est1RM / bodyweightKg

  if (ratio < thresholds[0]) return null

  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (ratio >= thresholds[i]) {
      const tier = TIERS[i]
      const tierFloor = thresholds[i]
      const tierCeil = thresholds[i + 1]
      const tierRange = tierCeil - tierFloor

      const progress = Math.min((ratio - tierFloor) / tierRange, 0.9999)
      const subTierIdx = Math.min(2, Math.floor(progress * 3))
      const subTier = (subTierIdx + 1) as 1 | 2 | 3

      const subStart = subTierIdx / 3
      const subProgress = (progress - subStart) / (1 / 3)
      const lp = Math.min(99, Math.round(subProgress * 100))

      const roman = ['I', 'II', 'III'][subTierIdx]
      return {
        tier,
        subTier,
        lp,
        rankString: `${tier}_${subTier}`,
        displayName: `${TIER_NAMES[tier]} ${roman}`,
      }
    }
  }
  return null
}

const COMPOUND_WEIGHTS: Record<string, number> = {
  'barbell-squat': 3, 'deadlift': 3, 'barbell-bench-press': 3,
  'overhead-press': 2, 'barbell-row': 2, 'pull-up': 2, 'chin-up': 2,
  'front-squat': 1.5, 'romanian-deadlift': 1.5, 'hip-thrust': 1.5,
  'dips-chest': 1.5, 'sumo-deadlift': 2, 'trap-bar-deadlift': 2,
  'push-press': 1.5, 'pendlay-row': 1.5, 'power-clean': 2,
}

export function computeOverallRank(
  prs: Array<{ exerciseId: string; est1RM: number }>,
  bodyweightKg: number,
  gender: 'male' | 'female',
  exercises: Array<{ id: string; category: string }>,
): RankInfo | null {
  const exMap = Object.fromEntries(exercises.map(e => [e.id, e.category]))
  let totalWeight = 0
  let weightedScore = 0

  for (const pr of prs) {
    const category = exMap[pr.exerciseId] ?? 'Full Body'
    const rank = computeRank(pr.est1RM, bodyweightKg, gender, pr.exerciseId, category)
    if (!rank) continue

    const w = COMPOUND_WEIGHTS[pr.exerciseId] ?? 1
    const score = TIERS.indexOf(rank.tier) * 300 + (rank.subTier - 1) * 100 + rank.lp
    weightedScore += score * w
    totalWeight += w
  }

  if (totalWeight === 0) return null

  const avgScore = weightedScore / totalWeight
  const tierIdx = Math.min(8, Math.floor(avgScore / 300))
  const remaining = avgScore % 300
  const subTierIdx = Math.min(2, Math.floor(remaining / 100))
  const lp = Math.min(99, Math.round(remaining % 100))

  const tier = TIERS[tierIdx]
  const subTier = (subTierIdx + 1) as 1 | 2 | 3
  const roman = ['I', 'II', 'III'][subTierIdx]

  return {
    tier,
    subTier,
    lp,
    rankString: `${tier}_${subTier}`,
    displayName: `${TIER_NAMES[tier]} ${roman}`,
  }
}

export { TIER_COLORS, TIER_NAMES, TIERS }
export type { Tier }
