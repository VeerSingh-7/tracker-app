import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO } from 'date-fns'
import { TrendingUp, Award } from 'lucide-react'
import Card from '../components/Card'
import { getWorkouts, getAllPersonalRecords, getExercises } from '../db'
import { epley1RM } from './utils'
import type { Workout, PersonalRecord, Exercise } from '../types'

interface ChartPoint {
  date: string
  weight: number
  est1RM: number
  volume: number
}

export default function ProgressTab() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [allPRs, setAllPRs] = useState<PersonalRecord[]>([])
  const [activeChart, setActiveChart] = useState<'weight' | 'est1rm' | 'volume'>('weight')

  function buildChart(workouts: Workout[], exerciseId: string) {
    const byDate: Record<string, ChartPoint> = {}
    for (const w of workouts) {
      if (!w.detailedExercises) continue
      const ex = w.detailedExercises.find(e => e.exerciseId === exerciseId)
      if (!ex) continue
      const completedSets = ex.sets.filter(s => s.completed)
      if (!completedSets.length) continue
      const maxWeight = Math.max(...completedSets.map(s => s.weight))
      const maxEst1RM = Math.max(...completedSets.map(s => epley1RM(s.weight, s.reps)))
      const vol = completedSets.reduce((sum, s) => sum + s.weight * s.reps, 0)
      byDate[w.date] = { date: w.date, weight: maxWeight, est1RM: Math.round(maxEst1RM * 10) / 10, volume: vol }
    }
    setChartData(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)))
  }

  useEffect(() => {
    Promise.all([getWorkouts(), getAllPersonalRecords(), getExercises()]).then(([workouts, prList, exList]) => {
      setAllPRs(prList)
      const usedIds = new Set<string>()
      for (const w of workouts) {
        for (const ex of (w.detailedExercises ?? [])) usedIds.add(ex.exerciseId)
      }
      const used = exList.filter(e => usedIds.has(e.id))
      setExercises(used.length > 0 ? used : exList)
      if (used.length > 0) {
        setSelectedId(used[0].id)
        buildChart(workouts, used[0].id)
      }
    })
  }, [])

  async function onSelectExercise(id: string) {
    setSelectedId(id)
    const workouts = await getWorkouts()
    buildChart(workouts, id)
  }

  const chartKey = activeChart === 'weight' ? 'weight' : activeChart === 'est1rm' ? 'est1RM' : 'volume'
  const chartLabel = activeChart === 'weight' ? 'Weight (kg)' : activeChart === 'est1rm' ? 'Est. 1RM (kg)' : 'Volume (kg)'
  const selectedPR = allPRs.find(p => p.exerciseId === selectedId)
  const selectedEx = exercises.find(e => e.id === selectedId)

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      {/* Exercise selector */}
      <div>
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Exercise</label>
        <select
          value={selectedId}
          onChange={e => onSelectExercise(e.target.value)}
          className="w-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        >
          {exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {/* PR card */}
      {selectedPR && (
        <Card padding="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/40 rounded-xl flex items-center justify-center">
              <Award size={20} className="text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Personal Record</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">
                {selectedPR.weight} kg × {selectedPR.reps} reps
                <span className="text-sm text-slate-400 font-normal ml-2">~ {Math.round(selectedPR.est1RM)} kg 1RM</span>
              </p>
              <p className="text-xs text-slate-400">{format(parseISO(selectedPR.date), 'MMM d, yyyy')}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Chart type tabs */}
      {chartData.length > 0 && (
        <>
          <div className="flex gap-2">
            {(['weight', 'est1rm', 'volume'] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveChart(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  activeChart === t ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {t === 'weight' ? 'Weight' : t === 'est1rm' ? 'Est. 1RM' : 'Volume'}
              </button>
            ))}
          </div>

          <Card padding="p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <TrendingUp size={12} /> {selectedEx?.name} — {chartLabel}
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={d => format(parseISO(d), 'MMM d')}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip
                  labelFormatter={d => format(parseISO(d as string), 'MMM d, yyyy')}
                  formatter={(v: unknown) => [`${v} kg`, chartLabel]}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey={chartKey}
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ fill: '#2563eb', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#2563eb' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {chartData.length === 0 && selectedId && (
        <Card padding="p-8">
          <div className="text-center text-slate-400">
            <div className="text-3xl mb-2">📈</div>
            <p className="font-medium">No data yet</p>
            <p className="text-sm mt-1">Log workouts with this exercise to see progress charts</p>
          </div>
        </Card>
      )}

      {/* All PRs list */}
      {allPRs.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">All Personal Records</p>
          <div className="space-y-2">
            {allPRs.sort((a, b) => b.est1RM - a.est1RM).map(pr => (
              <div key={pr.exerciseId} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{pr.exerciseName}</p>
                  <p className="text-xs text-slate-400">{format(parseISO(pr.date), 'MMM d, yyyy')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-blue-600">{pr.weight} kg × {pr.reps}</p>
                  <p className="text-xs text-slate-400">~{Math.round(pr.est1RM)} kg 1RM</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {allPRs.length === 0 && (
        <Card padding="p-8">
          <div className="text-center text-slate-400">
            <div className="text-3xl mb-2">🏅</div>
            <p className="font-medium">No records yet</p>
            <p className="text-sm mt-1">Complete sets in Today tab to set your first PR</p>
          </div>
        </Card>
      )}
    </div>
  )
}
