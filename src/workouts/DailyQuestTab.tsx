import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Gift, CheckCircle } from 'lucide-react'
import Card from '../components/Card'
import { getWorkouts, getAllPersonalRecords, getUserProgress, saveUserProgress, getExercises } from '../db'
import { getDailyQuest, checkQuestCompletion, calcLevel, calcLevelXP } from './utils'
import { today } from '../utils'
import type { UserProgress, Workout, DailyQuest } from '../types'

export default function DailyQuestTab() {
  const [progress, setProgress] = useState<UserProgress | null>(null)
  const [quest, setQuest] = useState<DailyQuest | null>(null)
  const [todayWorkouts, setTodayWorkouts] = useState<Workout[]>([])
  const [questMet, setQuestMet] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const [recentQuests, setRecentQuests] = useState<{ date: string; questName: string }[]>([])

  const todayStr = today()

  useEffect(() => {
    async function load() {
      const q = getDailyQuest(todayStr)
      setQuest(q)

      const [allWorkouts, p, prList, exList] = await Promise.all([
        getWorkouts(), getUserProgress(), getAllPersonalRecords(), getExercises(),
      ])
      setProgress(p)

      const tw = allWorkouts.filter(w => w.date === todayStr)
      setTodayWorkouts(tw)

      const exMap: Record<string, string[]> = Object.fromEntries(exList.map(e => [e.id, e.primaryMuscles]))
      const hasNewPRToday = prList.some(pr => pr.date === todayStr)

      setQuestMet(checkQuestCompletion(q, tw, hasNewPRToday, exMap))

      const questKey = `${todayStr}-${q.id}`
      setClaimed(p.completedQuests.includes(questKey))

      // Build recent quests history
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - i - 1)
        const ds = format(d, 'yyyy-MM-dd')
        const dq = getDailyQuest(ds)
        return { date: ds, questName: dq.name, completed: p.completedQuests.includes(`${ds}-${dq.id}`) }
      })
      setRecentQuests(last7.filter(q => q.completed).map(q => ({ date: q.date, questName: q.questName })))
    }
    load()
  }, [todayStr])

  async function claimReward() {
    if (!quest || !progress || claiming || claimed) return
    setClaiming(true)
    try {
      const questKey = `${todayStr}-${quest.id}`
      const newTotalXP = progress.totalXP + quest.xpReward
      const newLevel = calcLevel(newTotalXP)
      const updated: UserProgress = {
        ...progress,
        totalXP: newTotalXP,
        xp: newTotalXP - calcLevelXP(newLevel),
        level: newLevel,
        coins: progress.coins + quest.coinReward,
        completedQuests: [...progress.completedQuests, questKey],
        dailyQuestId: quest.id,
        dailyQuestDate: todayStr,
      }
      await saveUserProgress(updated)
      setProgress(updated)
      setClaimed(true)
    } finally { setClaiming(false) }
  }

  const questTypeLabel: Record<string, string> = {
    sets: '💪 Sets Challenge',
    muscle: '🎯 Muscle Focus',
    pr: '🏅 PR Challenge',
    workout: '✅ Workout',
    volume: '📦 Volume',
    cardio: '🏃 Cardio',
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      {/* Today's quest */}
      {quest && (
        <div className={`rounded-2xl p-5 border-2 transition-all ${
          claimed
            ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900'
            : 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-100 dark:border-blue-900'
        }`}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Today's Quest</p>
              <p className="text-lg font-black text-slate-900 dark:text-slate-100">{quest.name}</p>
            </div>
            <span className="text-2xl">{claimed ? '✅' : '🎯'}</span>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{quest.description}</p>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full font-semibold shadow-sm">
              {questTypeLabel[quest.type] ?? quest.type}
            </span>
            <span className="text-xs font-bold text-amber-600">+{quest.xpReward} XP</span>
            <span className="text-xs font-bold text-yellow-500">+{quest.coinReward} 💰</span>
          </div>

          {claimed ? (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle size={18} />
              <p className="font-semibold text-sm">Quest Complete! Reward claimed.</p>
            </div>
          ) : questMet ? (
            <button
              onClick={claimReward}
              disabled={claiming}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:bg-blue-700 disabled:opacity-60"
            >
              <Gift size={16} /> {claiming ? 'Claiming...' : 'Claim Reward!'}
            </button>
          ) : (
            <div className="bg-white/60 dark:bg-slate-800/60 rounded-xl p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Complete the quest conditions above, then come back to claim your reward.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {progress && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Completed', value: progress.completedQuests.length },
            { label: 'Streak Bonus', value: `${Math.min(progress.currentStreak, 7)}d` },
            { label: 'XP from Quests', value: `${progress.completedQuests.length * 50}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-3 text-center shadow-sm">
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Today's workout progress */}
      {todayWorkouts.length > 0 && (
        <Card padding="p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Today's Activity</p>
          <div className="space-y-1.5">
            {todayWorkouts.map(w => (
              <div key={w.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-300 capitalize">{w.type} — {w.duration}min</span>
                <span className="text-blue-600 font-semibold text-xs">{w.detailedExercises?.length ?? w.exercises.length} exercises</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent completions */}
      {recentQuests.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Recently Completed</p>
          <div className="space-y-2">
            {recentQuests.slice(0, 5).map(({ date, questName }) => (
              <div key={date} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{questName}</p>
                  <p className="text-xs text-slate-400">{format(new Date(date + 'T00:00:00'), 'EEE, MMM d')}</p>
                </div>
                <span className="text-green-500">✓</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentQuests.length === 0 && !quest && (
        <Card padding="p-8">
          <div className="text-center text-slate-400">
            <div className="text-3xl mb-2">📜</div>
            <p className="font-medium">No quests completed yet</p>
            <p className="text-sm mt-1">Complete today's quest above to get started!</p>
          </div>
        </Card>
      )}
    </div>
  )
}
