export type TwoPlayerMode = '2p' | 'ai'
export type AIDifficulty = 'easy' | 'medium' | 'hard'

export interface TwoPlayerGameProps {
  mode: TwoPlayerMode
  difficulty: AIDifficulty
  p1Color?: 'red' | 'blue'
  onBack: () => void
  onGameEnd?: (winner: 'p1' | 'p2' | 'draw') => void
  tournamentMode?: boolean
}
