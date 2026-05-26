import type { DailyQuest } from '../types'

export const questPool: DailyQuest[] = [
  { id: 'q-first-set', name: 'First Rep', description: 'Complete at least 1 set today', type: 'sets', target: 1, xpReward: 50, coinReward: 10 },
  { id: 'q-triple', name: 'Triple Threat', description: 'Complete 3 sets of any exercise', type: 'sets', target: 3, xpReward: 50, coinReward: 10 },
  { id: 'q-ten-sets', name: 'Set Crusher', description: 'Complete 10 sets total today', type: 'sets', target: 10, xpReward: 50, coinReward: 10 },
  { id: 'q-twenty-sets', name: 'Full Power', description: 'Complete 20 sets total today', type: 'sets', target: 20, xpReward: 50, coinReward: 15 },
  { id: 'q-chest', name: 'Chest Day', description: 'Train your chest today', type: 'muscle', targetMuscle: 'chest', xpReward: 50, coinReward: 10 },
  { id: 'q-back', name: 'Back Attack', description: 'Train your lats today', type: 'muscle', targetMuscle: 'lats', xpReward: 50, coinReward: 10 },
  { id: 'q-legs', name: 'Leg Day', description: 'Train your quads today', type: 'muscle', targetMuscle: 'quads', xpReward: 50, coinReward: 10 },
  { id: 'q-shoulders', name: 'Shoulder Session', description: 'Train your shoulders today', type: 'muscle', targetMuscle: 'shoulders', xpReward: 50, coinReward: 10 },
  { id: 'q-core', name: 'Core Circuit', description: 'Train your abs today', type: 'muscle', targetMuscle: 'abs', xpReward: 50, coinReward: 10 },
  { id: 'q-arms', name: 'Arm Pump', description: 'Train your biceps today', type: 'muscle', targetMuscle: 'biceps', xpReward: 50, coinReward: 10 },
  { id: 'q-tris', name: 'Tricep Burn', description: 'Train your triceps today', type: 'muscle', targetMuscle: 'triceps', xpReward: 50, coinReward: 10 },
  { id: 'q-glutes', name: 'Glute Gains', description: 'Train your glutes today', type: 'muscle', targetMuscle: 'glutes', xpReward: 50, coinReward: 10 },
  { id: 'q-cardio', name: 'Cardio Blast', description: 'Complete a cardio workout', type: 'cardio', xpReward: 50, coinReward: 10 },
  { id: 'q-pr', name: 'PR Hunter', description: 'Set a new personal record today', type: 'pr', xpReward: 50, coinReward: 15 },
  { id: 'q-vol-5k', name: 'Volume Pusher', description: 'Lift 5,000 kg total volume today', type: 'volume', target: 5000, xpReward: 50, coinReward: 15 },
  { id: 'q-workout', name: 'Show Up', description: 'Complete any workout session today', type: 'workout', xpReward: 50, coinReward: 10 },
  { id: 'q-vol-10k', name: 'Heavy Day', description: 'Lift 10,000 kg total volume today', type: 'volume', target: 10000, xpReward: 50, coinReward: 20 },
  { id: 'q-hamstrings', name: 'Hamstring Hell', description: 'Train your hamstrings today', type: 'muscle', targetMuscle: 'hamstrings', xpReward: 50, coinReward: 10 },
]
