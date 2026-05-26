import {
  GiWeightLiftingUp, GiWeight, GiMuscleUp, GiBiceps, GiBodyBalance,
  GiRunningNinja, GiJumpingRope, GiCycling, GiSwimfins,
  GiChestArmor, GiArmSling,
  GiFootsteps, GiKneeling,
  GiSwordsPower,
} from 'react-icons/gi'

// GiWeight substitutes for GiDumbbell/GiBarbell (those don't exist in this version)
const GiBarbell = GiWeightLiftingUp
const GiDumbbell = GiWeight
const GiAbdominals = GiBodyBalance
const GiLegsBack = GiKneeling

const EXERCISE_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  // Chest
  'barbell-bench-press':   GiWeightLiftingUp,
  'incline-bench-press':   GiWeightLiftingUp,
  'decline-bench-press':   GiWeightLiftingUp,
  'dumbbell-fly':          GiChestArmor,
  'cable-crossover':       GiChestArmor,
  'push-up':               GiBodyBalance,
  'chest-press-machine':   GiWeightLiftingUp,
  'incline-dumbbell-press':GiWeightLiftingUp,
  'pec-deck-fly':          GiChestArmor,
  'dips-chest':            GiMuscleUp,
  // Back
  'deadlift':              GiBarbell,
  'barbell-row':           GiBarbell,
  'pull-up':               GiBiceps,
  'lat-pulldown':          GiBarbell,
  'seated-cable-row':      GiBarbell,
  't-bar-row':             GiBarbell,
  'dumbbell-row':          GiDumbbell,
  'face-pull':             GiArmSling,
  'barbell-shrug':         GiBarbell,
  'good-morning':          GiKneeling,
  'hyperextension':        GiKneeling,
  'chin-up':               GiBiceps,
  'pull-up-negative':      GiBiceps,
  // Legs
  'barbell-squat':         GiKneeling,
  'front-squat':           GiKneeling,
  'leg-press':             GiLegsBack,
  'romanian-deadlift':     GiBarbell,
  'leg-curl':              GiLegsBack,
  'leg-extension':         GiLegsBack,
  'walking-lunge':         GiFootsteps,
  'bulgarian-split-squat': GiKneeling,
  'hip-thrust':            GiKneeling,
  'goblet-squat':          GiKneeling,
  'hack-squat':            GiKneeling,
  'box-jump':              GiRunningNinja,
  'standing-calf-raise':   GiFootsteps,
  'seated-calf-raise':     GiFootsteps,
  // Shoulders
  'overhead-press':        GiBarbell,
  'arnold-press':          GiDumbbell,
  'lateral-raise':         GiDumbbell,
  'front-raise':           GiDumbbell,
  'rear-delt-fly':         GiDumbbell,
  'upright-row':           GiBarbell,
  'machine-shoulder-press':GiWeightLiftingUp,
  'cable-lateral-raise':   GiArmSling,
  // Arms
  'barbell-curl':          GiBiceps,
  'dumbbell-curl':         GiBiceps,
  'hammer-curl':           GiBiceps,
  'preacher-curl':         GiBiceps,
  'cable-curl':            GiBiceps,
  'tricep-pushdown':       GiMuscleUp,
  'skull-crusher':         GiBarbell,
  'close-grip-bench-press':GiWeightLiftingUp,
  'overhead-tricep-extension': GiMuscleUp,
  'diamond-push-up':       GiBodyBalance,
  'wrist-curl':            GiArmSling,
  // Core
  'plank':                 GiBodyBalance,
  'crunch':                GiAbdominals,
  'russian-twist':         GiAbdominals,
  'leg-raise':             GiAbdominals,
  'ab-wheel-rollout':      GiAbdominals,
  'cable-crunch':          GiAbdominals,
  'side-plank':            GiBodyBalance,
  'bicycle-crunch':        GiAbdominals,
  // Cardio
  'running':               GiRunningNinja,
  'cycling':               GiCycling,
  'rowing-machine':        GiBarbell,
  'jump-rope':             GiJumpingRope,
  'burpees':               GiRunningNinja,
  'mountain-climbers':     GiRunningNinja,
  'elliptical':            GiRunningNinja,
  'swimming':              GiSwimfins,
  // Full body
  'clean-and-press':       GiBarbell,
  'thruster':              GiBarbell,
  'turkish-get-up':        GiDumbbell,
  'farmers-walk':          GiDumbbell,
  'kettlebell-swing':      GiDumbbell,
  'battle-rope':           GiSwordsPower,
  'sled-push':             GiMuscleUp,
  'bear-crawl':            GiBodyBalance,
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  'Chest':     GiWeightLiftingUp,
  'Back':      GiBarbell,
  'Legs':      GiKneeling,
  'Shoulders': GiDumbbell,
  'Arms':      GiBiceps,
  'Core':      GiAbdominals,
  'Cardio':    GiRunningNinja,
  'Full Body': GiMuscleUp,
}

interface Props {
  exerciseId?: string
  category?: string
  size?: number
  className?: string
}

export default function ExerciseIcon({ exerciseId, category, size = 20, className = '' }: Props) {
  const Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> =
    (exerciseId ? EXERCISE_ICONS[exerciseId] : undefined)
    ?? (category ? CATEGORY_ICONS[category] : undefined)
    ?? GiWeight

  return (
    <div
      className={`flex items-center justify-center rounded-2xl flex-shrink-0 ${className}`}
      style={{
        width: size + 16,
        height: size + 16,
        background: 'rgba(59,158,255,0.10)',
        border: '1px solid rgba(59,158,255,0.18)',
      }}
    >
      <Icon size={size} style={{ color: 'var(--loft-accent)' }} />
    </div>
  )
}
