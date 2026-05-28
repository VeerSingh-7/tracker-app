import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Trophy, Users, User, CheckSquare, Square } from 'lucide-react'
import { getAllGameScores, getAllTournaments, saveTournament, getUserProfile, saveUserProfile } from '../db'
import type { GameScore, TournamentRecord } from '../types'
import type { TwoPlayerMode, AIDifficulty } from '../games/twoplayer/types'
import Game2048 from '../games/Game2048'
import Snake from '../games/Snake'
import MemoryMatch from '../games/MemoryMatch'
import Wordle from '../games/Wordle'
import WhackAMole from '../games/WhackAMole'
import Sudoku from '../games/Sudoku'
import Solitaire from '../games/Solitaire'
import TicTacToe2P from '../games/twoplayer/TicTacToe2P'
import PingPong2P from '../games/twoplayer/PingPong2P'
import AirHockey2P from '../games/twoplayer/AirHockey2P'
import FlappyJump2P from '../games/twoplayer/FlappyJump2P'
import Archery2P from '../games/twoplayer/Archery2P'
import Tennis2P from '../games/twoplayer/Tennis2P'
import PenaltyKicks2P from '../games/twoplayer/PenaltyKicks2P'
import Chess2P from '../games/twoplayer/Chess2P'
import Pool2P from '../games/twoplayer/Pool2P'

// ─── Types ───────────────────────────────────────────────────────────────────
type SoloGameId = '2048' | 'snake' | 'memory' | 'wordle' | 'mole' | 'sudoku' | 'solitaire'
type TwoPlayerGameId = 'tictactoe' | 'pingpong' | 'airhockey' | 'flappyjump' | 'archery' | 'tennis' | 'penalty' | 'chess' | 'pool'
type TournamentPhase = 'game' | 'interstitial' | 'result'
interface TournamentState {
  mode: TwoPlayerMode; difficulty: AIDifficulty; p1Color: 'red' | 'blue'
  gameIds: TwoPlayerGameId[]; currentIdx: number
  scores: Record<string, { p1: number; p2: number }>
  phase: TournamentPhase
}
type GamesView =
  | { type: 'hub' }
  | { type: 'solo'; gameId: SoloGameId }
  | { type: 'pregame'; gameId: TwoPlayerGameId }
  | { type: 'playing2p'; gameId: TwoPlayerGameId; mode: TwoPlayerMode; difficulty: AIDifficulty; p1Color: 'red' | 'blue' }
  | { type: 'tournament-setup' }
  | { type: 'tournament'; tState: TournamentState }

// ─── Game definitions ─────────────────────────────────────────────────────────
const SOLO_DEFS = [
  { id: '2048' as SoloGameId, emoji: '🔢', name: '2048', tagline: 'Merge tiles to 2048' },
  { id: 'snake' as SoloGameId, emoji: '🐍', name: 'Snake', tagline: 'Eat and grow' },
  { id: 'memory' as SoloGameId, emoji: '🃏', name: 'Memory Match', tagline: 'Find all pairs' },
  { id: 'wordle' as SoloGameId, emoji: '🔤', name: 'Wordle', tagline: 'Guess the word' },
  { id: 'mole' as SoloGameId, emoji: '🐭', name: 'Whack-a-Mole', tagline: 'Whack as many as you can!' },
  { id: 'sudoku' as SoloGameId, emoji: '🔢', name: 'Sudoku', tagline: 'Fill the 9×9 grid' },
  { id: 'solitaire' as SoloGameId, emoji: '🃏', name: 'Solitaire', tagline: 'Classic Klondike card game' },
]
const TWO_PLAYER_DEFS: { id: TwoPlayerGameId; name: string; emoji: string; tagline: string }[] = [
  { id: 'tictactoe', name: 'Tic-Tac-Toe', emoji: '❌', tagline: 'Classic X vs O battle' },
  { id: 'pingpong', name: 'Ping Pong', emoji: '🏓', tagline: 'First to 7 wins' },
  { id: 'airhockey', name: 'Air Hockey', emoji: '🏒', tagline: 'First to 5 goals wins' },
  { id: 'flappyjump', name: 'Flappy Jump', emoji: '🐦', tagline: 'Survive the longest' },
  { id: 'archery', name: 'Archery', emoji: '🏹', tagline: 'Best of 5 arrows each' },
  { id: 'tennis', name: 'Tennis', emoji: '🎾', tagline: 'First to 7 wins' },
  { id: 'penalty', name: 'Penalty Kicks', emoji: '⚽', tagline: '5 shots each, best wins' },
  { id: 'chess', name: 'Chess', emoji: '♟', tagline: 'Classic strategy game' },
  { id: 'pool',  name: 'Pool', emoji: '🎱', tagline: '8-ball billiards' },
]
const TWO_PLAYER_COMPONENTS = {
  tictactoe: TicTacToe2P, pingpong: PingPong2P,
  airhockey: AirHockey2P, flappyjump: FlappyJump2P,
  archery: Archery2P, tennis: Tennis2P, penalty: PenaltyKicks2P, chess: Chess2P,
  pool: Pool2P,
} as const
const SOLO_COMPONENTS = {
  '2048': Game2048, snake: Snake, memory: MemoryMatch, wordle: Wordle, mole: WhackAMole,
  sudoku: Sudoku, solitaire: Solitaire,
} as const

// ─── SVG Illustrations ────────────────────────────────────────────────────────
function TicTacToeSvg() {
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#tttBg)" />
      <defs>
        <linearGradient id="tttBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b1a8a" /><stop offset="1" stopColor="#1a0a4a" />
        </linearGradient>
      </defs>
      {/* Grid */}
      {[66, 132].map(x => <line key={x} x1={x} y1="16" x2={x} y2="140" stroke="rgba(255,255,255,0.25)" strokeWidth="3" strokeLinecap="round" />)}
      {[68, 100].map(y => <line key={y} x1="16" y1={y} x2="184" y2={y} stroke="rgba(255,255,255,0.25)" strokeWidth="3" strokeLinecap="round" />)}
      {/* X marks - red */}
      {[[33, 42], [166, 42], [100, 110]].map(([cx, cy], i) => (
        <g key={i}>
          <line x1={cx-15} y1={cy-15} x2={cx+15} y2={cy+15} stroke="#ef4444" strokeWidth="7" strokeLinecap="round" />
          <line x1={cx+15} y1={cy-15} x2={cx-15} y2={cy+15} stroke="#ef4444" strokeWidth="7" strokeLinecap="round" />
        </g>
      ))}
      {/* O marks - blue */}
      {[[100, 42], [33, 110], [166, 110]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="18" stroke="#3b82f6" strokeWidth="7" fill="none" />
      ))}
      {/* Win line */}
      <line x1="33" y1="42" x2="166" y2="110" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      {/* Sparkles */}
      {[[22, 18], [178, 20], [22, 140], [178, 138]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#fbbf24" opacity="0.6" />
      ))}
    </svg>
  )
}

function PingPongSvg() {
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#ppBg)" />
      <defs>
        <linearGradient id="ppBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0a4a1a" /><stop offset="1" stopColor="#041810" />
        </linearGradient>
      </defs>
      {/* Table edges */}
      <rect x="14" y="14" width="172" height="128" rx="8" stroke="rgba(255,255,255,0.15)" strokeWidth="2" fill="none" />
      {/* Center line dashed */}
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1={32 + i * 20} y1="78" x2={44 + i * 20} y2="78" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
      ))}
      {/* P2 paddle (blue, top) */}
      <rect x="72" y="24" width="56" height="12" rx="6" fill="#3b82f6" />
      <ellipse cx="100" cy="30" rx="6" ry="3" fill="rgba(255,255,255,0.3)" />
      {/* P1 paddle (red, bottom) */}
      <rect x="72" y="120" width="56" height="12" rx="6" fill="#ef4444" />
      <ellipse cx="100" cy="126" rx="6" ry="3" fill="rgba(255,255,255,0.3)" />
      {/* Ball with trails */}
      <circle cx="118" cy="66" r="5" fill="rgba(255,255,255,0.2)" />
      <circle cx="110" cy="72" r="6" fill="rgba(255,255,255,0.5)" />
      <circle cx="100" cy="80" r="7.5" fill="#ffffff" />
      {/* Score */}
      <text x="24" y="84" fontFamily="Inter,sans-serif" fontSize="18" fontWeight="800" fill="rgba(239,68,68,0.85)">3</text>
      <text x="168" y="84" fontFamily="Inter,sans-serif" fontSize="18" fontWeight="800" fill="rgba(59,130,246,0.85)" textAnchor="end">5</text>
    </svg>
  )
}

function AirHockeySvg() {
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#ahBg)" />
      <defs>
        <linearGradient id="ahBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0c2040" /><stop offset="1" stopColor="#041020" />
        </linearGradient>
      </defs>
      {/* Table */}
      <rect x="14" y="14" width="172" height="128" rx="12" fill="rgba(0,80,160,0.18)" stroke="rgba(59,158,255,0.35)" strokeWidth="2" />
      {/* Goals */}
      <rect x="70" y="14" width="60" height="16" rx="0" fill="rgba(239,68,68,0.25)" stroke="#ef4444" strokeWidth="1.5" />
      <rect x="70" y="126" width="60" height="16" rx="0" fill="rgba(59,130,246,0.25)" stroke="#3b82f6" strokeWidth="1.5" />
      {/* Center line */}
      <line x1="14" y1="78" x2="186" y2="78" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeDasharray="8 5" />
      {/* Center circle */}
      <circle cx="100" cy="78" r="28" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" fill="none" />
      {/* P1 paddle (red) */}
      <circle cx="68" cy="110" r="20" fill="#ef4444" opacity="0.9" />
      <circle cx="68" cy="110" r="8" fill="rgba(255,255,255,0.25)" />
      {/* P2 paddle (blue) */}
      <circle cx="134" cy="48" r="20" fill="#3b82f6" opacity="0.9" />
      <circle cx="134" cy="48" r="8" fill="rgba(255,255,255,0.25)" />
      {/* Puck */}
      <circle cx="100" cy="82" r="13" fill="#dde8ff" opacity="0.9" />
      <circle cx="100" cy="82" r="5" fill="rgba(80,100,140,0.6)" />
      {/* Velocity lines from puck */}
      <line x1="92" y1="78" x2="78" y2="70" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" />
      <line x1="90" y1="82" x2="74" y2="80" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function FlappyJumpSvg() {
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#fjTopBg)" clipPath="url(#fjTop)" />
      <rect width="200" height="156" rx="16" fill="url(#fjBotBg)" clipPath="url(#fjBot)" />
      <defs>
        <linearGradient id="fjTopBg" x1="0" y1="0" x2="0" y2="78" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a2e5a" /><stop offset="1" stopColor="#0e1e3a" />
        </linearGradient>
        <linearGradient id="fjBotBg" x1="0" y1="78" x2="0" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a3a20" /><stop offset="1" stopColor="#0e2014" />
        </linearGradient>
        <clipPath id="fjTop"><rect x="0" y="0" width="200" height="78" rx="16" /></clipPath>
        <clipPath id="fjBot"><rect x="0" y="78" width="200" height="78" rx="16" /></clipPath>
      </defs>
      {/* Top half pipes */}
      <rect x="130" y="0" width="28" height="36" fill="#2d8a3e" />
      <rect x="126" y="30" width="36" height="10" rx="3" fill="#3daa4e" />
      <rect x="130" y="54" width="28" height="24" fill="#2d8a3e" />
      <rect x="126" y="54" width="36" height="10" rx="3" fill="#3daa4e" />
      {/* Red bird (top half) */}
      <circle cx="58" cy="40" r="13" fill="#ef4444" />
      <circle cx="63" cy="36" r="4.5" fill="white" />
      <circle cx="64" cy="36" r="2.5" fill="#111" />
      <polygon points="71,40 79,37 79,43" fill="#f97316" />
      {/* Divider */}
      <rect x="0" y="75" width="200" height="6" fill="rgba(255,255,255,0.18)" />
      {/* Bottom half pipes */}
      <rect x="158" y="82" width="28" height="30" fill="#2d8a3e" />
      <rect x="154" y="82" width="36" height="10" rx="3" fill="#3daa4e" />
      <rect x="158" y="124" width="28" height="32" fill="#2d8a3e" />
      <rect x="154" y="120" width="36" height="10" rx="3" fill="#3daa4e" />
      {/* Blue bird (bottom half) */}
      <circle cx="58" cy="118" r="13" fill="#3b82f6" />
      <circle cx="63" cy="114" r="4.5" fill="white" />
      <circle cx="64" cy="114" r="2.5" fill="#111" />
      <polygon points="71,118 79,115 79,121" fill="#f97316" />
      {/* Score pills */}
      <rect x="86" y="30" width="30" height="18" rx="9" fill="rgba(255,255,255,0.12)" />
      <text x="101" y="43" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="12" fontWeight="800" fill="rgba(239,68,68,0.9)">4</text>
      <rect x="86" y="108" width="30" height="18" rx="9" fill="rgba(255,255,255,0.12)" />
      <text x="101" y="121" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="12" fontWeight="800" fill="rgba(59,130,246,0.9)">2</text>
    </svg>
  )
}

function ArcherySvg() {
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#archBg)" />
      <defs>
        <linearGradient id="archBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a0a2e" /><stop offset="1" stopColor="#0a0516" />
        </linearGradient>
      </defs>
      {/* Target rings (right side) */}
      <circle cx="148" cy="78" r="48" fill="#1a5276" />
      <circle cx="148" cy="78" r="38" fill="#000" opacity="0.5"/>
      <circle cx="148" cy="78" r="28" fill="#c0392b" />
      <circle cx="148" cy="78" r="18" fill="#e74c3c" />
      <circle cx="148" cy="78" r="10" fill="#ffd700" />
      <circle cx="148" cy="78" r="5" fill="#fff700" />
      {/* Ring outlines */}
      {[48,38,28,18,10].map((r,i) => <circle key={i} cx="148" cy="78" r={r} stroke="rgba(255,255,255,0.2)" strokeWidth="1" fill="none"/>)}
      {/* Bow (left side) */}
      <path d="M 38,30 Q 20,78 38,126" stroke="#92400e" strokeWidth="5" fill="none" strokeLinecap="round"/>
      <line x1="38" y1="30" x2="38" y2="126" stroke="#d97706" strokeWidth="2" strokeDasharray="4,4"/>
      {/* Arrow */}
      <line x1="42" y1="78" x2="138" y2="78" stroke="#d97706" strokeWidth="3" strokeLinecap="round"/>
      <polygon points="138,74 148,78 138,82" fill="#d97706"/>
      {/* Fletching */}
      <polygon points="42,78 30,72 34,78" fill="#ef4444" opacity="0.8"/>
      <polygon points="42,78 30,84 34,78" fill="#ef4444" opacity="0.8"/>
      {/* Score text */}
      <text x="148" y="143" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="10" fontWeight="800" fill="rgba(255,255,255,0.6)">BULLSEYE</text>
    </svg>
  )
}

function TennisSvg() {
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#tenBg)" />
      <defs>
        <linearGradient id="tenBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#064e3b" /><stop offset="1" stopColor="#022c22" />
        </linearGradient>
      </defs>
      {/* Court lines */}
      <rect x="20" y="14" width="160" height="128" rx="4" stroke="rgba(255,255,255,0.4)" strokeWidth="2" fill="none"/>
      <line x1="20" y1="78" x2="180" y2="78" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
      <line x1="100" y1="14" x2="100" y2="78" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
      <line x1="100" y1="78" x2="100" y2="142" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
      <line x1="20" y1="42" x2="180" y2="42" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
      <line x1="20" y1="114" x2="180" y2="114" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
      {/* Net */}
      <rect x="20" y="72" width="160" height="12" rx="2" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
      <line x1="100" y1="72" x2="100" y2="84" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
      {/* P1 racket (red, bottom) */}
      <ellipse cx="100" cy="124" rx="22" ry="8" fill="#ef4444" opacity="0.9"/>
      <line x1="100" y1="132" x2="100" y2="142" stroke="#92400e" strokeWidth="4" strokeLinecap="round"/>
      {/* P2 racket (blue, top) */}
      <ellipse cx="100" cy="32" rx="22" ry="8" fill="#3b82f6" opacity="0.9"/>
      <line x1="100" y1="24" x2="100" y2="14" stroke="#1e3a8a" strokeWidth="4" strokeLinecap="round"/>
      {/* Ball */}
      <circle cx="128" cy="60" r="8" fill="#facc15"/>
      <path d="M 124,54 Q 128,58 124,66" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" fill="none"/>
      <path d="M 132,54 Q 128,58 132,66" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" fill="none"/>
      {/* Score */}
      <text x="25" y="100" fontFamily="Inter,sans-serif" fontSize="16" fontWeight="800" fill="rgba(239,68,68,0.9)">3</text>
      <text x="175" y="60" fontFamily="Inter,sans-serif" fontSize="16" fontWeight="800" fill="rgba(59,130,246,0.9)" textAnchor="end">5</text>
    </svg>
  )
}

function PenaltyKicksSvg() {
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#pkBg)" />
      <defs>
        <linearGradient id="pkBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0a2a0a" /><stop offset="1" stopColor="#041408" />
        </linearGradient>
      </defs>
      {/* Pitch stripes */}
      {[0,1,2,3].map(i => (
        <rect key={i} x={i*50} y="80" width="50" height="76" fill={i%2===0 ? 'rgba(255,255,255,0.025)' : 'transparent'} />
      ))}
      {/* Penalty spot */}
      <circle cx="100" cy="128" r="3" fill="rgba(255,255,255,0.4)" />
      {/* Penalty arc */}
      <path d="M 68,104 A 40,40 0 0 1 132,104" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" fill="none" />
      {/* Penalty box */}
      <rect x="48" y="80" width="104" height="40" rx="0" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" fill="none" />
      {/* Goal frame */}
      <rect x="60" y="14" width="80" height="52" rx="2" fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" />
      {/* Net hatching */}
      {Array.from({length: 9}, (_, i) => (
        <line key={`v${i}`} x1={65 + i*9} y1="16" x2={65 + i*9} y2="64" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      ))}
      {Array.from({length: 6}, (_, i) => (
        <line key={`h${i}`} x1="62" y1={20 + i*8} x2="138" y2={20 + i*8} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      ))}
      {/* Goal posts */}
      <line x1="60" y1="14" x2="60" y2="80" stroke="rgba(255,255,255,0.8)" strokeWidth="3" strokeLinecap="round" />
      <line x1="140" y1="14" x2="140" y2="80" stroke="rgba(255,255,255,0.8)" strokeWidth="3" strokeLinecap="round" />
      <line x1="60" y1="14" x2="140" y2="14" stroke="rgba(255,255,255,0.8)" strokeWidth="3" strokeLinecap="round" />
      {/* Keeper (blue, diving right) */}
      <ellipse cx="120" cy="48" rx="12" ry="7" fill="#3b82f6" transform="rotate(-30 120 48)" />
      <circle cx="108" cy="41" r="7" fill="#3b82f6" />
      <circle cx="107" cy="39" r="5" fill="#60a5fa" />
      {/* Shooter (red, bottom) */}
      <circle cx="100" cy="118" r="7" fill="#ef4444" />
      <rect x="96" y="122" width="8" height="10" rx="3" fill="#ef4444" />
      {/* Ball mid-air */}
      <circle cx="100" cy="85" r="9" fill="white" />
      <path d="M100 76 L103 82 L100 85 L97 82 Z" fill="#222" opacity="0.6" />
      <path d="M91 82 L97 82 L100 85 L97 89 L91 88 Z" fill="#222" opacity="0.4" />
      {/* Motion trail */}
      <circle cx="100" cy="97" r="5" fill="rgba(255,255,255,0.2)" />
      <circle cx="100" cy="107" r="3" fill="rgba(255,255,255,0.1)" />
      {/* Score dots P1 */}
      {[0,1,2].map(i => <circle key={`p1-${i}`} cx={16 + i*12} cy="148" r="4" fill={i<2 ? '#10b981' : 'rgba(255,255,255,0.15)'} />)}
      {/* Score dots P2 */}
      {[0,1,2].map(i => <circle key={`p2-${i}`} cx={160 + i*12} cy="148" r="4" fill={i<1 ? '#10b981' : 'rgba(255,255,255,0.15)'} />)}
    </svg>
  )
}

function ChessSvg() {
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#chessBg)" />
      <defs>
        <linearGradient id="chessBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a0f2e" /><stop offset="1" stopColor="#0a0618" />
        </linearGradient>
      </defs>
      {/* 5×5 board */}
      {Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) => (
          <rect key={`${r}-${c}`}
            x={28 + c * 28} y={14 + r * 26}
            width={28} height={26}
            fill={(r + c) % 2 === 0 ? '#f0d9b5' : '#b58863'}
            opacity={0.9}
          />
        ))
      )}
      {/* Board border */}
      <rect x="28" y="14" width="140" height="130" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" rx="2" />
      {/* Check glow on one square */}
      <rect x="56" y="66" width="28" height="26" fill="rgba(220,40,40,0.55)" rx="1" />
      <rect x="56" y="66" width="28" height="26" fill="none" stroke="#ef4444" strokeWidth="2" rx="1" />
      {/* White King ♔ on glowing square */}
      <text x="70" y="84" textAnchor="middle" fontSize="19" fill="#1a0f2e"
        fontFamily="serif" style={{ filter: 'drop-shadow(0 0 3px rgba(255,100,100,0.8))' }}>♔</text>
      {/* Black Queen ♛ */}
      <text x="98" y="58" textAnchor="middle" fontSize="19" fill="#1a0f2e" fontFamily="serif">♛</text>
      {/* White Knight ♘ */}
      <text x="126" y="110" textAnchor="middle" fontSize="17" fill="#5c3d1e" fontFamily="serif"
        style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}>♘</text>
      {/* Black Rook ♜ */}
      <text x="42" y="136" textAnchor="middle" fontSize="16" fill="#1a0f2e" fontFamily="serif">♜</text>
      {/* White Pawn ♙ */}
      <text x="154" y="32" textAnchor="middle" fontSize="14" fill="#5c3d1e" fontFamily="serif">♙</text>
      {/* "CHECK" label */}
      <rect x="60" y="142" width="80" height="12" rx="6" fill="rgba(220,40,40,0.18)" />
      <text x="100" y="151" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="8" fontWeight="800" fill="#ef4444" letterSpacing="1">CHECK</text>
    </svg>
  )
}

function PoolSvg() {
  const ballCols = ['#f5c518','#1d4ed8','#dc2626','#7c3aed','#ea580c','#15803d','#1a1a1a']
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#poolBg)" />
      <defs>
        <linearGradient id="poolBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a0d05" /><stop offset="1" stopColor="#0d0803" />
        </linearGradient>
      </defs>
      {/* Rail */}
      <rect x="8" y="8" width="184" height="140" rx="8" fill="#6b3a1f" />
      {/* Felt */}
      <rect x="22" y="22" width="156" height="112" rx="4" fill="#0a5a2a" />
      {/* Head string */}
      <line x1="24" y1="50" x2="176" y2="50" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" strokeDasharray="3,4" />
      {/* Pockets */}
      {[[22,22],[178,22],[22,78],[178,78],[22,134],[178,134]].map(([px,py],i) => (
        <circle key={i} cx={px} cy={py} r="7" fill="#111" stroke="rgba(100,60,20,0.6)" strokeWidth="1.2" />
      ))}
      {/* Rack triangle */}
      {[
        [100,100], [93,113],[107,113],
        [86,126],[100,126],[114,126],
      ].map(([bx,by],i) => (
        <circle key={i} cx={bx} cy={by} r="8.5" fill={ballCols[i % ballCols.length]}
          stroke="rgba(0,0,0,0.4)" strokeWidth="0.8" />
      ))}
      {/* 8-ball in centre of row 2 */}
      <circle cx="100" cy="126" r="8.5" fill="#1a1a1a" stroke="rgba(0,0,0,0.4)" strokeWidth="0.8" />
      <circle cx="100" cy="126" r="4" fill="white" />
      <text x="100" y="129" textAnchor="middle" fontFamily="Arial" fontSize="5" fontWeight="800" fill="#111">8</text>
      {/* Cue ball */}
      <circle cx="100" cy="42" r="8.5" fill="white" stroke="rgba(180,190,200,0.5)" strokeWidth="0.8" />
    </svg>
  )
}

const SVG_ILLUSTRATIONS: Record<TwoPlayerGameId, React.ComponentType> = {
  tictactoe: TicTacToeSvg, pingpong: PingPongSvg,
  airhockey: AirHockeySvg, flappyjump: FlappyJumpSvg,
  archery: ArcherySvg, tennis: TennisSvg, penalty: PenaltyKicksSvg,
  chess: ChessSvg, pool: PoolSvg,
}

// ─── Solo SVG Illustrations ───────────────────────────────────────────────────
function Game2048Svg() {
  const tiles = [[2,4,8,16],[32,0,128,256],[0,512,0,1024],[0,0,0,2048]]
  const color = (v: number) => v===2048?'#edcf72':v>=512?'#edcc61':v>=128?'#e9c46a':v>=32?'#f4a261':v>=8?'#e76f51':v>0?'#9c6b4e':'rgba(255,255,255,0.05)'
  const textColor = (v: number) => v >= 8 ? '#fff' : v > 0 ? '#776e65' : 'transparent'
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#g2048bg)" />
      <defs>
        <linearGradient id="g2048bg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a1a2e" /><stop offset="1" stopColor="#0d0d1f" />
        </linearGradient>
      </defs>
      {tiles.map((row, ri) => row.map((v, ci) => (
        <g key={`${ri}-${ci}`}>
          <rect x={14 + ci*44} y={12 + ri*34} width={40} height={30} rx={5} fill={color(v)} />
          {v > 0 && <text x={14 + ci*44 + 20} y={12 + ri*34 + 19} textAnchor="middle" dominantBaseline="middle"
            fontFamily="Inter,sans-serif" fontSize={v >= 1024 ? 8 : v >= 128 ? 10 : 12} fontWeight="800" fill={textColor(v)}>
            {v}
          </text>}
        </g>
      )))}
    </svg>
  )
}

function SnakeSvg() {
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#snakeBg)" />
      <defs>
        <linearGradient id="snakeBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0a1f0a" /><stop offset="1" stopColor="#050f05" />
        </linearGradient>
      </defs>
      {/* Grid dots */}
      {Array.from({length:6},(_,r)=>Array.from({length:8},(_,c)=>(
        <circle key={`${r}-${c}`} cx={18+c*24} cy={18+r*24} r={1.5} fill="rgba(255,255,255,0.06)" />
      )))}
      {/* Snake body - S shape */}
      {[[22,30],[46,30],[70,30],[94,30],[118,30],[118,54],[118,78],[94,78],[70,78],[46,78],[46,102],[70,102],[94,102],[118,102],[142,102]].map(([x,y],i)=>(
        <rect key={i} x={x-10} y={y-10} width={20} height={20} rx={5}
          fill={i===0?'#22c55e':'#16a34a'} opacity={i===0?1:0.85} />
      ))}
      {/* Apple */}
      <circle cx="162" cy="102" r="12" fill="#ef4444" />
      <rect x="161" y="88" width="3" height="8" rx="1.5" fill="#15803d" />
      {/* Eyes on head */}
      <circle cx="17" cy="26" r="3" fill="white" /><circle cx="18" cy="26" r="1.5" fill="#111" />
      <circle cx="27" cy="26" r="3" fill="white" /><circle cx="28" cy="26" r="1.5" fill="#111" />
    </svg>
  )
}

function MemoryMatchSvg() {
  const cards = [
    {x:14,y:14,flip:true,sym:'⭐'},{x:60,y:14,flip:false,sym:''},{x:106,y:14,flip:true,sym:'🔥'},{x:152,y:14,flip:false,sym:''},
    {x:14,y:66,flip:false,sym:''},{x:60,y:66,flip:true,sym:'⭐'},{x:106,y:66,flip:false,sym:''},{x:152,y:66,flip:true,sym:'🔥'},
    {x:14,y:118,flip:false,sym:''},{x:60,y:118,flip:false,sym:''},{x:106,y:118,flip:false,sym:''},{x:152,y:118,flip:false,sym:''},
  ]
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#memBg)" />
      <defs>
        <linearGradient id="memBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e1b4b" /><stop offset="1" stopColor="#0f0e26" />
        </linearGradient>
      </defs>
      {cards.map((c,i)=>(
        <g key={i}>
          <rect x={c.x} y={c.y} width={36} height={34} rx={6}
            fill={c.flip?'rgba(59,130,246,0.25)':'rgba(255,255,255,0.07)'}
            stroke={c.flip?'rgba(59,130,246,0.6)':'rgba(255,255,255,0.12)'} strokeWidth="1.5" />
          {c.flip&&<text x={c.x+18} y={c.y+21} textAnchor="middle" dominantBaseline="middle" fontSize="18">{c.sym}</text>}
          {!c.flip&&<>
            <line x1={c.x+8} y1={c.y+10} x2={c.x+28} y2={c.y+10} stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
            <line x1={c.x+8} y1={c.y+17} x2={c.x+28} y2={c.y+17} stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
            <line x1={c.x+8} y1={c.y+24} x2={c.x+22} y2={c.y+24} stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
          </>}
        </g>
      ))}
    </svg>
  )
}

function WordleSvg() {
  const rows = [
    [{l:'S',s:'correct'},{l:'T',s:'absent'},{l:'A',s:'present'},{l:'R',s:'correct'},{l:'E',s:'absent'}],
    [{l:'S',s:'correct'},{l:'H',s:'absent'},{l:'A',s:'present'},{l:'R',s:'correct'},{l:'P',s:'correct'}],
    [{l:'',s:'empty'},{l:'',s:'empty'},{l:'',s:'empty'},{l:'',s:'empty'},{l:'',s:'empty'}],
  ]
  const bg = (s:string)=>s==='correct'?'#538d4e':s==='present'?'#b59f3b':s==='absent'?'#3a3a3c':'rgba(255,255,255,0.06)'
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="#1a1a1e" />
      {rows.map((row,ri)=>row.map((cell,ci)=>(
        <g key={`${ri}-${ci}`}>
          <rect x={16+ci*36} y={16+ri*44} width={32} height={38} rx={5} fill={bg(cell.s)} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          {cell.l&&<text x={16+ci*36+16} y={16+ri*44+22} textAnchor="middle" dominantBaseline="middle"
            fontFamily="Inter,sans-serif" fontSize="16" fontWeight="800" fill="white">{cell.l}</text>}
        </g>
      )))}
      {/* Keyboard hint */}
      {['Q','W','E','R','T','Y','U','I','O','P'].map((k,i)=>(
        <rect key={k} x={16+i*18} y={152} width={14} height={10} rx={2} fill="rgba(255,255,255,0.08)" />
      ))}
    </svg>
  )
}

function WhackAMoleSvg() {
  const holes = [{x:38,y:60},{x:100,y:48},{x:162,y:60},{x:38,y:110},{x:100,y:98},{x:162,y:110}]
  const moles = [0,2,4]
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#moleBg)" />
      <defs>
        <linearGradient id="moleBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14532d" /><stop offset="1" stopColor="#052e16" />
        </linearGradient>
      </defs>
      {/* Ground patches */}
      {holes.map((h,i)=>(
        <ellipse key={i} cx={h.x} cy={h.y+16} rx={24} ry={10} fill="rgba(0,0,0,0.4)" />
      ))}
      {/* Holes */}
      {holes.map((h,i)=>(
        <ellipse key={i} cx={h.x} cy={h.y+12} rx={20} ry={8} fill="#0a1f0a" />
      ))}
      {/* Moles */}
      {moles.map(idx=>{
        const h=holes[idx]
        return (
          <g key={idx}>
            <ellipse cx={h.x} cy={h.y+4} rx={18} ry={16} fill="#92400e" />
            <ellipse cx={h.x} cy={h.y-4} rx={14} ry={14} fill="#b45309" />
            {/* Eyes */}
            <circle cx={h.x-5} cy={h.y-7} r={3} fill="white" /><circle cx={h.x-4} cy={h.y-7} r={1.5} fill="#111" />
            <circle cx={h.x+5} cy={h.y-7} r={3} fill="white" /><circle cx={h.x+6} cy={h.y-7} r={1.5} fill="#111" />
            {/* Nose */}
            <ellipse cx={h.x} cy={h.y-2} rx={4} ry={3} fill="#7c2d12" />
          </g>
        )
      })}
      {/* Mallet */}
      <line x1="155" y1="20" x2="130" y2="55" stroke="#92400e" strokeWidth="5" strokeLinecap="round" />
      <rect x="140" y="12" width="28" height="20" rx="5" fill="#d97706" transform="rotate(-35 154 22)" />
    </svg>
  )
}

function SudokuSvg() {
  const nums = [
    [5,3,0,0,7],
    [6,0,0,1,9],
    [0,9,8,0,0],
    [8,0,0,0,6],
    [4,0,0,8,3],
  ]
  const highlighted: [number,number][] = [[1,1],[2,3],[3,2]]
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#sdkBg)" />
      <defs>
        <linearGradient id="sdkBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0f172a" /><stop offset="1" stopColor="#0a0e1f" />
        </linearGradient>
      </defs>
      {nums.map((row, ri) => row.map((n, ci) => {
        const x = 16 + ci * 34, y = 12 + ri * 28
        const isHighlighted = highlighted.some(([r,c]) => r===ri && c===ci)
        const isEmpty = n === 0
        return (
          <g key={`${ri}-${ci}`}>
            <rect x={x} y={y} width={30} height={24} rx={4}
              fill={isHighlighted ? 'rgba(59,130,246,0.3)' : isEmpty ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}
              stroke={isHighlighted ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.12)'} strokeWidth="1" />
            {n > 0 && <text x={x+15} y={y+16} textAnchor="middle" dominantBaseline="middle"
              fontFamily="Inter,sans-serif" fontSize="13" fontWeight={isEmpty?'400':'700'}
              fill={isHighlighted ? '#60a5fa' : 'rgba(255,255,255,0.85)'}>
              {n}
            </text>}
          </g>
        )
      }))}
      <rect x="16" y="12" width="102" height="83" rx="4" stroke="rgba(255,255,255,0.25)" strokeWidth="2" fill="none"/>
      <text x="53" y="34" fontFamily="Inter,sans-serif" fontSize="5" fill="rgba(156,163,175,0.8)">1 2</text>
      <text x="53" y="40" fontFamily="Inter,sans-serif" fontSize="5" fill="rgba(156,163,175,0.8)">4 7</text>
      {[1,2,3,4].map(i => (
        <g key={i}>
          <rect x={16 + 5*34 + (i-1)*20} y="12" width="16" height="24" rx="3" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5"/>
          <rect x={16} y={12 + 5*28 + (i-1)*22} width="30" height="18" rx="3" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5"/>
        </g>
      ))}
    </svg>
  )
}

function SolitaireSvg() {
  return (
    <svg viewBox="0 0 200 156" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="200" height="156" rx="16" fill="url(#solBg)" />
      <defs>
        <linearGradient id="solBg" x1="0" y1="0" x2="200" y2="156" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0d4a2a" /><stop offset="1" stopColor="#062a18" />
        </linearGradient>
      </defs>
      {/* Face-down stock pile (top-left) */}
      {[4,2,0].map(offset => (
        <rect key={offset} x={12+offset} y={8+offset} width={28} height={40} rx={4}
          fill="#1e3a5f" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
      ))}
      {/* Diamond pattern on top stock card */}
      <line x1="14" y1="10" x2="38" y2="48" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
      <line x1="38" y1="10" x2="14" y2="48" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
      {/* Foundation piles (top-right) */}
      {/* ♠ foundation with Ace */}
      <rect x="144" y="8" width="24" height="34" rx="4" fill="white" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5"/>
      <text x="146" y="18" fontFamily="Inter,sans-serif" fontSize="8" fontWeight="800" fill="#111">A</text>
      <text x="146" y="26" fontFamily="Inter,sans-serif" fontSize="8" fill="#111">♠</text>
      {/* ♥ foundation with Ace */}
      <rect x="172" y="8" width="24" height="34" rx="4" fill="white" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5"/>
      <text x="174" y="18" fontFamily="Inter,sans-serif" fontSize="8" fontWeight="800" fill="#dc2626">A</text>
      <text x="174" y="26" fontFamily="Inter,sans-serif" fontSize="8" fill="#dc2626">♥</text>
      {/* Tableau cascade - overlapping face-up cards */}
      {/* Q♠ */}
      <rect x="20" y="56" width="30" height="42" rx="4" fill="white" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5"/>
      <text x="22" y="66" fontFamily="Inter,sans-serif" fontSize="9" fontWeight="800" fill="#111">Q♠</text>
      <text x="38" y="93" fontFamily="Inter,sans-serif" fontSize="9" fontWeight="800" fill="#111" textAnchor="end">Q♠</text>
      {/* J♥ on Q♠ */}
      <rect x="50" y="70" width="30" height="42" rx="4" fill="white" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5"/>
      <text x="52" y="80" fontFamily="Inter,sans-serif" fontSize="9" fontWeight="800" fill="#dc2626">J♥</text>
      {/* 10♠ on J♥ */}
      <rect x="80" y="84" width="30" height="42" rx="4" fill="white" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5"/>
      <text x="82" y="94" fontFamily="Inter,sans-serif" fontSize="9" fontWeight="800" fill="#111">10♠</text>
      {/* 9♦ on 10♠ */}
      <rect x="110" y="98" width="30" height="42" rx="4" fill="white" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5"/>
      <text x="112" y="108" fontFamily="Inter,sans-serif" fontSize="9" fontWeight="800" fill="#dc2626">9♦</text>
      {/* 8♠ on 9♦ */}
      <rect x="140" y="112" width="30" height="42" rx="4" fill="white" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5"/>
      <text x="142" y="122" fontFamily="Inter,sans-serif" fontSize="9" fontWeight="800" fill="#111">8♠</text>
    </svg>
  )
}

const SOLO_SVG_ILLUSTRATIONS: Record<SoloGameId, React.ComponentType> = {
  '2048': Game2048Svg, snake: SnakeSvg, memory: MemoryMatchSvg,
  wordle: WordleSvg, mole: WhackAMoleSvg, sudoku: SudokuSvg, solitaire: SolitaireSvg,
}

// ─── Solo Game Card ───────────────────────────────────────────────────────────
function SoloCard({ def, score, onTap, index }: {
  def: typeof SOLO_DEFS[0]; score?: number; onTap: () => void; index: number
}) {
  const Illustration = SOLO_SVG_ILLUSTRATIONS[def.id]
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      whileTap={{ scale: 0.96 }}
      onClick={onTap}
      className="w-full rounded-2xl overflow-hidden text-left flex flex-col"
      style={{ border: '3px solid rgba(255,255,255,0.09)', background: 'var(--loft-card)', boxShadow: '0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)' }}
    >
      <div className="flex-1" style={{ aspectRatio: '1 / 0.76' }}>
        <Illustration />
      </div>
      <div className="px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.35)' }}>
        <div className="flex items-center gap-2">
          <span className="text-base">{def.emoji}</span>
          <span className="font-bold text-sm truncate" style={{ color: 'var(--loft-text)' }}>{def.name}</span>
        </div>
        {(score ?? 0) > 0 && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{ background: 'rgba(59,158,255,0.12)' }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--loft-accent)' }}>
              Best: {score!.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </motion.button>
  )
}

// ─── Game Card ────────────────────────────────────────────────────────────────
function TwoPlayerCard({ def, onTap, index }: {
  def: typeof TWO_PLAYER_DEFS[0]; onTap: () => void; index: number
}) {
  const Illustration = SVG_ILLUSTRATIONS[def.id]
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      whileTap={{ scale: 0.96 }}
      onClick={onTap}
      className="w-full rounded-2xl overflow-hidden text-left flex flex-col"
      style={{ border: '3px solid rgba(255,255,255,0.09)', background: 'var(--loft-card)', boxShadow: '0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)' }}
    >
      <div className="flex-1" style={{ aspectRatio: '1 / 0.76' }}>
        <Illustration />
      </div>
      <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: 'rgba(0,0,0,0.35)' }}>
        <span className="text-base">{def.emoji}</span>
        <span className="font-bold text-sm" style={{ color: 'var(--loft-text)' }}>{def.name}</span>
      </div>
    </motion.button>
  )
}

// ─── Colour Picker sub-screen ─────────────────────────────────────────────────
function ColourPicker({ defaultColor, onConfirm, onSkip, onBack, chessMode }: {
  defaultColor: 'red' | 'blue'
  onConfirm: (c: 'red' | 'blue') => void
  onSkip: () => void
  onBack: () => void
  chessMode?: boolean
}) {
  const [selected, setSelected] = useState<'red' | 'blue'>(defaultColor)
  return (
    <motion.div key="colorpicker" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="absolute inset-0 flex flex-col" style={{ background: 'var(--loft-bg)', zIndex: 30 }}>
      <div className="flex items-center gap-3 px-4 pb-3"
        style={{ paddingTop: 'env(safe-area-inset-top)', background: 'var(--loft-bg2)' }}>
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'var(--loft-card)' }}>
          <ChevronLeft size={20} style={{ color: 'var(--loft-text)' }} />
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--loft-text)' }}>Choose Your Colour</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <p className="text-sm text-center mb-6" style={{ color: 'var(--loft-muted)' }}>
          {chessMode
            ? <>Your colour decides <span className="font-bold text-white">which chess pieces you play</span></>
            : <>Your colour plays at the <span className="font-bold text-white">bottom</span> of the screen</>}
        </p>
        <div className="flex gap-4 w-full max-w-xs mb-8">
          {(['red', 'blue'] as const).map(c => {
            const hex = c === 'red' ? '#ef4444' : '#3b82f6'
            const isSelected = selected === c
            return (
              <button
                key={c}
                onClick={() => setSelected(c)}
                className="flex-1 rounded-3xl flex flex-col items-center justify-center gap-3 transition-all"
                style={{
                  aspectRatio: '1',
                  background: `${hex}1a`,
                  border: `3px solid ${isSelected ? hex : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: isSelected ? `0 0 24px ${hex}66` : 'none',
                }}
              >
                <div className="w-14 h-14 rounded-full" style={{ background: hex }} />
                <span className="font-bold text-sm capitalize" style={{ color: hex }}>{c}</span>
                {chessMode && <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>{c === 'red' ? '= White ♔' : '= Black ♚'}</span>}
                {isSelected && <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>✓ You</span>}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => onConfirm(selected)}
          className="w-full max-w-xs py-4 rounded-2xl font-black text-base mb-3"
          style={{
            background: selected === 'red' ? '#ef4444' : '#3b82f6',
            color: '#fff',
            boxShadow: `0 0 20px ${selected === 'red' ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)'}`,
          }}>
          Play as {selected === 'red' ? 'Red' : 'Blue'}
        </button>
        <button onClick={onSkip} className="text-sm py-2"
          style={{ color: 'var(--loft-muted)' }}>
          Skip (keep {defaultColor})
        </button>
      </div>
    </motion.div>
  )
}

// ─── Pre-game screen ──────────────────────────────────────────────────────────
function PreGameScreen({ gameId, defaultColor, onBack, onStart }: {
  gameId: TwoPlayerGameId
  defaultColor: 'red' | 'blue'
  onBack: () => void
  onStart: (mode: TwoPlayerMode, difficulty: AIDifficulty, p1Color: 'red' | 'blue') => void
}) {
  const [aiSelected, setAiSelected] = useState(false)
  const [diff, setDiff] = useState<AIDifficulty>('medium')
  const [pendingStart, setPendingStart] = useState<{ mode: TwoPlayerMode; diff: AIDifficulty } | null>(null)
  const def = TWO_PLAYER_DEFS.find(d => d.id === gameId)!
  const Illustration = SVG_ILLUSTRATIONS[gameId]

  return (
    <>
      <motion.div key="pregame" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="absolute inset-0 flex flex-col" style={{ background: 'var(--loft-bg)', zIndex: 20 }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pb-3" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'var(--loft-card)' }}>
            <ChevronLeft size={20} style={{ color: 'var(--loft-text)' }} />
          </button>
          <h1 className="text-xl font-bold" style={{ color: 'var(--loft-text)' }}>{def.name}</h1>
        </div>

        <div className="flex-1 overflow-y-auto scroll-area px-5 pb-8">
          {/* Illustration */}
          <div className="rounded-3xl overflow-hidden mb-6 mx-2" style={{ aspectRatio: '16/9', border: '3px solid rgba(255,255,255,0.08)' }}>
            <Illustration />
          </div>

          <p className="text-center text-sm mb-8" style={{ color: 'var(--loft-muted)' }}>{def.tagline}</p>

          {/* Vs Friend */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setPendingStart({ mode: '2p', diff })}
            className="w-full rounded-2xl p-4 mb-3 flex items-center gap-4"
            style={{ background: 'rgba(59,158,255,0.12)', border: '2px solid rgba(59,158,255,0.3)', boxShadow: '0 0 20px rgba(59,158,255,0.1)' }}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: 'rgba(59,158,255,0.15)' }}>👥</div>
            <div className="text-left">
              <p className="font-black text-base" style={{ color: 'var(--loft-accent)' }}>Vs Friend</p>
              <p className="text-xs" style={{ color: 'var(--loft-muted)' }}>Pass & Play on one device</p>
            </div>
          </motion.button>

          {/* Vs AI */}
          <div className="rounded-2xl overflow-hidden" style={{ border: `2px solid ${aiSelected ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.09)'}`, background: aiSelected ? 'rgba(168,85,247,0.08)' : 'var(--loft-card)' }}>
            <button
              className="w-full p-4 flex items-center gap-4"
              onClick={() => setAiSelected(!aiSelected)}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: 'rgba(168,85,247,0.15)' }}>🤖</div>
              <div className="text-left flex-1">
                <p className="font-black text-base" style={{ color: aiSelected ? '#a855f7' : 'var(--loft-text)' }}>Vs AI</p>
                <p className="text-xs" style={{ color: 'var(--loft-muted)' }}>Play against the computer</p>
              </div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: aiSelected ? '#a855f7' : 'rgba(255,255,255,0.1)' }}>
                <span className="text-xs text-white font-bold">{aiSelected ? '✓' : '+'}</span>
              </div>
            </button>

            <AnimatePresence>
              {aiSelected && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="px-4 pb-4">
                    <p className="text-xs font-semibold mb-3" style={{ color: 'var(--loft-muted)' }}>DIFFICULTY</p>
                    <div className="flex gap-2 mb-4">
                      {(['easy', 'medium', 'hard'] as AIDifficulty[]).map(d => (
                        <button key={d} onClick={() => setDiff(d)}
                          className="flex-1 py-2.5 rounded-xl text-sm font-bold capitalize transition-all"
                          style={{
                            background: diff === d ? (d === 'easy' ? '#16a34a' : d === 'medium' ? '#d97706' : '#dc2626') : 'rgba(255,255,255,0.06)',
                            color: diff === d ? '#fff' : 'var(--loft-muted)',
                            border: diff === d ? 'none' : '1px solid rgba(255,255,255,0.08)',
                          }}>
                          {d}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setPendingStart({ mode: 'ai', diff })}
                      className="w-full py-3 rounded-2xl font-bold text-sm"
                      style={{ background: '#a855f7', color: '#fff', boxShadow: '0 0 16px rgba(168,85,247,0.4)' }}>
                      Start vs AI
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {pendingStart && (
          <ColourPicker
            defaultColor={defaultColor}
            chessMode={gameId === 'chess'}
            onConfirm={c => onStart(pendingStart.mode, pendingStart.diff, c)}
            onSkip={() => onStart(pendingStart.mode, pendingStart.diff, defaultColor)}
            onBack={() => setPendingStart(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Tournament Setup ─────────────────────────────────────────────────────────
function TournamentSetup({ defaultColor, onBack, onStart }: {
  defaultColor: 'red' | 'blue'
  onBack: () => void
  onStart: (mode: TwoPlayerMode, difficulty: AIDifficulty, gameIds: TwoPlayerGameId[], p1Color: 'red' | 'blue') => void
}) {
  const [mode, setMode] = useState<TwoPlayerMode>('2p')
  const [diff, setDiff] = useState<AIDifficulty>('medium')
  const [chosen, setChosen] = useState<TwoPlayerGameId[]>(['tictactoe', 'pingpong', 'airhockey', 'flappyjump', 'penalty'])
  const [pendingStart, setPendingStart] = useState(false)

  const toggle = (id: TwoPlayerGameId) =>
    setChosen(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <>
    <motion.div key="tsetup" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="absolute inset-0 flex flex-col" style={{ background: 'var(--loft-bg)', zIndex: 20 }}>
      <div className="flex items-center gap-3 px-4 pb-3" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onBack} className="p-2 rounded-xl" style={{ background: 'var(--loft-card)' }}>
          <ChevronLeft size={20} style={{ color: 'var(--loft-text)' }} />
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--loft-text)' }}>Tournament Setup</h1>
      </div>

      <div className="flex-1 overflow-y-auto scroll-area px-5 pb-8">
        {/* Trophy header */}
        <div className="flex flex-col items-center py-6">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-3"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 0 30px rgba(245,158,11,0.4)' }}>
            <Trophy size={40} className="text-white" />
          </div>
          <p className="text-sm" style={{ color: 'var(--loft-muted)' }}>Play all selected games, most wins takes the trophy</p>
        </div>

        {/* Mode */}
        <p className="text-xs font-bold tracking-widest mb-3" style={{ color: 'var(--loft-muted)' }}>MODE</p>
        <div className="flex gap-2 mb-6">
          {([['2p', '👥', 'Pass & Play'], ['ai', '🤖', 'Vs AI']] as [TwoPlayerMode, string, string][]).map(([m, icon, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className="flex-1 py-3 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all"
              style={{
                background: mode === m ? 'rgba(59,158,255,0.18)' : 'var(--loft-card)',
                border: `2px solid ${mode === m ? 'rgba(59,158,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: mode === m ? 'var(--loft-accent)' : 'var(--loft-muted)',
              }}>
              <span>{icon}</span><span className="text-sm">{label}</span>
            </button>
          ))}
        </div>

        {/* Difficulty (AI only) */}
        <AnimatePresence>
          {mode === 'ai' && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-6">
              <p className="text-xs font-bold tracking-widest mb-3" style={{ color: 'var(--loft-muted)' }}>AI DIFFICULTY</p>
              <div className="flex gap-2">
                {(['easy', 'medium', 'hard'] as AIDifficulty[]).map(d => (
                  <button key={d} onClick={() => setDiff(d)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold capitalize"
                    style={{
                      background: diff === d ? (d === 'easy' ? '#16a34a' : d === 'medium' ? '#d97706' : '#dc2626') : 'var(--loft-card)',
                      color: diff === d ? '#fff' : 'var(--loft-muted)',
                      border: diff === d ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    }}>
                    {d}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Games */}
        <p className="text-xs font-bold tracking-widest mb-3" style={{ color: 'var(--loft-muted)' }}>GAMES TO PLAY</p>
        <div className="space-y-2 mb-8">
          {TWO_PLAYER_DEFS.map(def => (
            <div key={def.id}>
              <button onClick={() => toggle(def.id)}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl transition-all"
                style={{
                  background: chosen.includes(def.id) ? 'rgba(59,158,255,0.1)' : 'var(--loft-card)',
                  border: `1.5px solid ${chosen.includes(def.id) ? 'rgba(59,158,255,0.35)' : 'rgba(255,255,255,0.07)'}`,
                }}>
                {chosen.includes(def.id)
                  ? <CheckSquare size={20} style={{ color: 'var(--loft-accent)', flexShrink: 0 }} />
                  : <Square size={20} style={{ color: 'var(--loft-faint)', flexShrink: 0 }} />}
                <span className="text-lg flex-shrink-0">{def.emoji}</span>
                <span className="font-bold text-sm flex-1 text-left" style={{ color: 'var(--loft-text)' }}>{def.name}</span>
              </button>
              {def.id === 'chess' && chosen.includes('chess') && (
                <p className="text-xs px-3 pt-1 pb-0.5" style={{ color: '#f59e0b' }}>
                  ⚠️ Chess games may take longer than other games in this tournament.
                </p>
              )}
            </div>
          ))}
        </div>

        <button
          disabled={chosen.length === 0}
          onClick={() => chosen.length && setPendingStart(true)}
          className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-opacity"
          style={{
            background: chosen.length ? 'linear-gradient(135deg, #16a34a, #15803d)' : 'var(--loft-card)',
            color: chosen.length ? '#fff' : 'var(--loft-muted)',
            boxShadow: chosen.length ? '0 0 24px rgba(22,163,74,0.4)' : 'none',
            opacity: chosen.length ? 1 : 0.5,
          }}>
          <Trophy size={18} />
          Start Tournament
        </button>
      </div>
    </motion.div>

    <AnimatePresence>
      {pendingStart && (
        <ColourPicker
          defaultColor={defaultColor}
          onConfirm={c => onStart(mode, diff, chosen, c)}
          onSkip={() => onStart(mode, diff, chosen, defaultColor)}
          onBack={() => setPendingStart(false)}
        />
      )}
    </AnimatePresence>
    </>
  )
}

// ─── Tournament Interstitial ──────────────────────────────────────────────────
function TournamentInterstitial({ tState, onNext }: { tState: TournamentState; onNext: () => void }) {
  const p1Total = Object.values(tState.scores).reduce((s, v) => s + v.p1, 0)
  const p2Total = Object.values(tState.scores).reduce((s, v) => s + v.p2, 0)
  const gamesLeft = tState.gameIds.length - tState.currentIdx
  const justPlayed = tState.gameIds[tState.currentIdx - 1]
  const justDef = TWO_PLAYER_DEFS.find(d => d.id === justPlayed)

  return (
    <motion.div key="interstitial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--loft-bg)', zIndex: 20 }}>
      <div className="w-full max-w-sm">
        <p className="text-center text-xs font-bold tracking-widest mb-2" style={{ color: 'var(--loft-muted)' }}>
          GAME {tState.currentIdx} OF {tState.gameIds.length}
        </p>
        {justDef && (
          <p className="text-center font-black text-xl mb-6" style={{ color: 'var(--loft-text)' }}>
            {justDef.emoji} {justDef.name} — Done!
          </p>
        )}

        {/* Standings */}
        <div className="rounded-3xl p-5 mb-6"
          style={{ background: 'var(--loft-card)', border: '1.5px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs font-bold tracking-widest mb-4 text-center" style={{ color: 'var(--loft-muted)' }}>STANDINGS</p>
          <div className="flex items-center gap-4">
            <div className="flex-1 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black mx-auto mb-2"
                style={{ background: '#ef4444', color: '#fff' }}>{p1Total}</div>
              <p className="text-xs font-bold" style={{ color: '#ef4444' }}>
                {tState.mode === 'ai' ? 'You' : 'Player 1'}
              </p>
            </div>
            <div className="font-black text-xl" style={{ color: 'var(--loft-faint)' }}>VS</div>
            <div className="flex-1 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black mx-auto mb-2"
                style={{ background: '#3b82f6', color: '#fff' }}>{p2Total}</div>
              <p className="text-xs font-bold" style={{ color: '#3b82f6' }}>
                {tState.mode === 'ai' ? 'AI' : 'Player 2'}
              </p>
            </div>
          </div>
          {/* Per-game breakdown */}
          <div className="mt-4 space-y-1.5">
            {tState.gameIds.slice(0, tState.currentIdx).map(gid => {
              const sc = tState.scores[gid] ?? { p1: 0, p2: 0 }
              const def = TWO_PLAYER_DEFS.find(d => d.id === gid)!
              return (
                <div key={gid} className="flex items-center text-xs">
                  <span className="mr-1.5">{def.emoji}</span>
                  <span className="flex-1" style={{ color: 'var(--loft-muted)' }}>{def.name}</span>
                  <span className="font-bold" style={{ color: sc.p1 > sc.p2 ? '#ef4444' : 'var(--loft-faint)' }}>{sc.p1}</span>
                  <span className="mx-1.5" style={{ color: 'var(--loft-faint)' }}>–</span>
                  <span className="font-bold" style={{ color: sc.p2 > sc.p1 ? '#3b82f6' : 'var(--loft-faint)' }}>{sc.p2}</span>
                </div>
              )
            })}
          </div>
        </div>

        <button onClick={onNext}
          className="w-full py-4 rounded-2xl font-black text-base loft-btn-accent">
          {gamesLeft > 0 ? `Next: ${TWO_PLAYER_DEFS.find(d => d.id === tState.gameIds[tState.currentIdx])?.name ?? 'Game'}` : 'See Results'}
        </button>
      </div>
    </motion.div>
  )
}

// ─── Tournament Result ────────────────────────────────────────────────────────
function TournamentResult({ tState, onAgain, onBack }: {
  tState: TournamentState; onAgain: () => void; onBack: () => void
}) {
  const p1Total = Object.values(tState.scores).reduce((s, v) => s + v.p1, 0)
  const p2Total = Object.values(tState.scores).reduce((s, v) => s + v.p2, 0)
  const winner = p1Total > p2Total ? 'p1' : p2Total > p1Total ? 'p2' : 'draw'
  const p1Label = tState.mode === 'ai' ? 'You' : 'Player 1'
  const p2Label = tState.mode === 'ai' ? 'AI' : 'Player 2'

  return (
    <motion.div key="tresult" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-tab-bar"
      style={{ background: 'var(--loft-bg)', zIndex: 20 }}>
      <div className="w-full max-w-sm text-center">
        <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.15 }}
          className="text-7xl mb-4">🏆</motion.div>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="text-4xl font-black mb-1"
          style={{ color: winner === 'p1' ? '#ef4444' : winner === 'p2' ? '#3b82f6' : 'var(--loft-text)' }}>
          {winner === 'draw' ? 'Tied!' : winner === 'p1' ? `${p1Label} Wins!` : `${p2Label} Wins!`}
        </motion.h1>
        <p className="text-sm mb-8" style={{ color: 'var(--loft-muted)' }}>
          {winner === 'draw' ? 'Incredible — perfectly matched!' : 'Tournament Champion!'}
        </p>

        {/* Final scores */}
        <div className="flex gap-4 mb-6 justify-center">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black mb-2"
              style={{ background: 'rgba(239,68,68,0.15)', border: '3px solid #ef4444', color: '#ef4444' }}>{p1Total}</div>
            <p className="text-xs font-bold" style={{ color: '#ef4444' }}>{p1Label}</p>
          </div>
          <div className="self-center font-black text-xl" style={{ color: 'var(--loft-faint)' }}>–</div>
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black mb-2"
              style={{ background: 'rgba(59,130,246,0.15)', border: '3px solid #3b82f6', color: '#3b82f6' }}>{p2Total}</div>
            <p className="text-xs font-bold" style={{ color: '#3b82f6' }}>{p2Label}</p>
          </div>
        </div>

        {/* Per-game */}
        <div className="rounded-2xl p-4 mb-6 space-y-2"
          style={{ background: 'var(--loft-card)', border: '1.5px solid rgba(255,255,255,0.07)' }}>
          {tState.gameIds.map(gid => {
            const sc = tState.scores[gid] ?? { p1: 0, p2: 0 }
            const def = TWO_PLAYER_DEFS.find(d => d.id === gid)!
            return (
              <div key={gid} className="flex items-center text-xs">
                <span className="mr-1.5">{def.emoji}</span>
                <span className="flex-1 text-left" style={{ color: 'var(--loft-muted)' }}>{def.name}</span>
                <span className="font-bold" style={{ color: sc.p1 > sc.p2 ? '#ef4444' : 'var(--loft-faint)' }}>{sc.p1}</span>
                <span className="mx-1.5" style={{ color: 'var(--loft-faint)' }}>–</span>
                <span className="font-bold" style={{ color: sc.p2 > sc.p1 ? '#3b82f6' : 'var(--loft-faint)' }}>{sc.p2}</span>
              </div>
            )
          })}
        </div>

        <div className="flex gap-3">
          <button onClick={onBack} className="flex-1 py-3 rounded-2xl font-bold text-sm"
            style={{ background: 'var(--loft-card)', color: 'var(--loft-muted)' }}>Back</button>
          <button onClick={onAgain} className="flex-1 py-3 rounded-2xl font-bold text-sm loft-btn-accent">
            Play Again
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Stats Sheet ──────────────────────────────────────────────────────────────
function StatsSheet({ tournaments, onClose }: { tournaments: TournamentRecord[]; onClose: () => void }) {
  const gameStats: Record<string, { p1: number; p2: number }> = {}
  for (const t of tournaments) {
    for (const [gid, sc] of Object.entries(t.scores)) {
      if (!gameStats[gid]) gameStats[gid] = { p1: 0, p2: 0 }
      gameStats[gid].p1 += sc.p1
      gameStats[gid].p2 += sc.p2
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col justify-end" style={{ zIndex: 60, background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="rounded-t-3xl p-6"
        style={{ background: 'var(--loft-bg2)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'var(--loft-border2)' }} />
        <h3 className="font-black text-lg mb-4" style={{ color: 'var(--loft-text)' }}>Tournament Stats</h3>
        <div className="space-y-3">
          {TWO_PLAYER_DEFS.map(def => {
            const sc = gameStats[def.id] ?? { p1: 0, p2: 0 }
            return (
              <div key={def.id} className="flex items-center gap-3">
                <span className="text-xl">{def.emoji}</span>
                <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--loft-text)' }}>{def.name}</span>
                <span className="text-sm font-bold" style={{ color: '#ef4444' }}>{sc.p1}</span>
                <span className="text-xs mx-1" style={{ color: 'var(--loft-faint)' }}>–</span>
                <span className="text-sm font-bold" style={{ color: '#3b82f6' }}>{sc.p2}</span>
              </div>
            )
          })}
          {Object.keys(gameStats).length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: 'var(--loft-muted)' }}>No tournament data yet</p>
          )}
        </div>
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: 'var(--loft-muted)' }}>Tournaments played</span>
            <span className="font-bold" style={{ color: 'var(--loft-text)' }}>{tournaments.length}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Hub ─────────────────────────────────────────────────────────────────────
export default function Games() {
  const [view, setView] = useState<GamesView>({ type: 'hub' })
  const [section, setSection] = useState<'2p' | '1p'>('2p')
  const [soloScores, setSoloScores] = useState<Record<string, GameScore>>({})
  const [tournaments, setTournaments] = useState<TournamentRecord[]>([])
  const [showStats, setShowStats] = useState(false)
  const [defaultColor, setDefaultColor] = useState<'red' | 'blue'>('red')
  const scrollRef = useRef<HTMLDivElement>(null)
  const twoPRef = useRef<HTMLDivElement>(null)
  const onePRef = useRef<HTMLDivElement>(null)

  const loadData = () => {
    getAllGameScores().then(all => {
      const map: Record<string, GameScore> = {}
      all.forEach(s => { map[s.gameId] = s })
      setSoloScores(map)
    })
    getAllTournaments().then(setTournaments)
  }

  useEffect(() => {
    getUserProfile().then(p => { if (p?.preferredColor) setDefaultColor(p.preferredColor) })
  }, [])

  useEffect(() => {
    if (view.type === 'hub') loadData()
  }, [view.type])

  const applyColor = (c: 'red' | 'blue') => {
    setDefaultColor(c)
    getUserProfile().then(p => {
      if (p) saveUserProfile({ ...p, preferredColor: c })
    })
  }

  const p1Wins = tournaments.filter(t => t.winner === 'p1').length
  const p2Wins = tournaments.filter(t => t.winner === 'p2').length

  const handleToggle = (s: '2p' | '1p') => {
    setSection(s)
    const target = s === '2p' ? twoPRef.current : onePRef.current
    if (target && scrollRef.current) {
      const containerTop = scrollRef.current.getBoundingClientRect().top
      const targetTop = target.getBoundingClientRect().top
      const newTop = scrollRef.current.scrollTop + targetTop - containerTop - 8
      scrollRef.current.scrollTo({ top: Math.max(0, newTop), behavior: 'smooth' })
    }
  }

  const handleTournamentStart = (mode: TwoPlayerMode, difficulty: AIDifficulty, gameIds: TwoPlayerGameId[], p1Color: 'red' | 'blue') => {
    applyColor(p1Color)
    const scores: Record<string, { p1: number; p2: number }> = {}
    gameIds.forEach(id => { scores[id] = { p1: 0, p2: 0 } })
    setView({
      type: 'tournament',
      tState: { mode, difficulty, p1Color, gameIds, currentIdx: 0, scores, phase: 'game' },
    })
  }

  const handleGameEnd = (winner: 'p1' | 'p2' | 'draw') => {
    if (view.type !== 'tournament') return
    const ts = view.tState
    const gameId = ts.gameIds[ts.currentIdx]
    const newScores = { ...ts.scores }
    if (winner === 'p1') newScores[gameId] = { p1: (newScores[gameId]?.p1 ?? 0) + 1, p2: newScores[gameId]?.p2 ?? 0 }
    else if (winner === 'p2') newScores[gameId] = { p1: newScores[gameId]?.p1 ?? 0, p2: (newScores[gameId]?.p2 ?? 0) + 1 }
    const nextIdx = ts.currentIdx + 1
    const isLast = nextIdx >= ts.gameIds.length
    setView({
      type: 'tournament',
      tState: { ...ts, scores: newScores, currentIdx: nextIdx, phase: isLast ? 'interstitial' : 'interstitial' },
    })
  }

  const handleInterstitialNext = () => {
    if (view.type !== 'tournament') return
    const ts = view.tState
    if (ts.currentIdx >= ts.gameIds.length) {
      // Save and show result
      const p1Total = Object.values(ts.scores).reduce((s, v) => s + v.p1, 0)
      const p2Total = Object.values(ts.scores).reduce((s, v) => s + v.p2, 0)
      const winner: 'p1' | 'p2' | 'draw' = p1Total > p2Total ? 'p1' : p2Total > p1Total ? 'p2' : 'draw'
      const record: TournamentRecord = {
        id: `tournament_${Date.now()}`,
        date: new Date().toISOString(),
        mode: ts.mode, difficulty: ts.difficulty,
        games: ts.gameIds, scores: ts.scores, winner,
      }
      saveTournament(record).then(() => loadData())
      setView({ type: 'tournament', tState: { ...ts, phase: 'result' } })
    } else {
      setView({ type: 'tournament', tState: { ...ts, phase: 'game' } })
    }
  }

  // Render current view
  if (view.type === 'solo') {
    const GameComponent = SOLO_COMPONENTS[view.gameId]
    return <GameComponent onBack={() => setView({ type: 'hub' })} />
  }

  if (view.type === 'playing2p') {
    const GameComponent = TWO_PLAYER_COMPONENTS[view.gameId]
    return (
      <GameComponent
        mode={view.mode} difficulty={view.difficulty} p1Color={view.p1Color}
        onBack={() => setView({ type: 'hub' })}
        onGameEnd={() => setView({ type: 'hub' })}
      />
    )
  }

  if (view.type === 'tournament') {
    const ts = view.tState
    if (ts.phase === 'game') {
      const GameComponent = TWO_PLAYER_COMPONENTS[ts.gameIds[ts.currentIdx]]
      return (
        <GameComponent
          mode={ts.mode} difficulty={ts.difficulty} p1Color={ts.p1Color}
          tournamentMode
          onBack={() => setView({ type: 'hub' })}
          onGameEnd={handleGameEnd}
        />
      )
    }
  }

  // Hub + overlay views
  return (
    <div className="h-full flex flex-col relative" style={{ background: 'var(--loft-bg)' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-3 safe-top"
        style={{ background: 'var(--loft-bg2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(59,158,255,0.1)', border: '1px solid rgba(59,158,255,0.18)' }}>
            <span className="text-xl">🎮</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--loft-text)' }}>Games</h1>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setShowStats(true)} className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm"
                style={{ background: 'rgba(239,68,68,0.15)', border: '2px solid #ef4444', color: '#ef4444' }}>
                {p1Wins}
              </div>
              <span className="text-xs" style={{ color: 'rgba(239,68,68,0.55)' }}>P1</span>
            </button>
            <div className="w-px h-8 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <button onClick={() => setShowStats(true)} className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm"
                style={{ background: 'rgba(59,130,246,0.15)', border: '2px solid #3b82f6', color: '#3b82f6' }}>
                {p2Wins}
              </div>
              <span className="text-xs" style={{ color: 'rgba(59,130,246,0.55)' }}>P2</span>
            </button>
          </div>
        </div>

        {/* Segmented toggle */}
        <div className="flex rounded-2xl p-1 gap-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {([['2p', '👥', '2 Players'], ['1p', '👤', '1 Player']] as ['2p' | '1p', string, string][]).map(([s, icon, label]) => (
            <button key={s} onClick={() => handleToggle(s)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all"
              style={{
                background: section === s ? 'rgba(59,158,255,0.18)' : 'transparent',
                color: section === s ? 'var(--loft-accent)' : 'var(--loft-muted)',
                border: section === s ? '1.5px solid rgba(59,158,255,0.35)' : '1.5px solid transparent',
                boxShadow: section === s ? 'var(--loft-glow-sm)' : 'none',
              }}>
              <span className="text-base">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scroll content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-area px-4 pt-4 pb-tab-bar">
        {/* 2P section */}
        <div ref={twoPRef}>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: 'rgba(59,158,255,0.1)' }}>
              <Users size={13} style={{ color: 'var(--loft-accent)' }} />
              <span className="text-xs font-black tracking-widest" style={{ color: 'var(--loft-accent)' }}>2 PLAYER GAMES</span>
            </div>
          </div>

          {/* Tournament banner */}
          <button onClick={() => setView({ type: 'tournament-setup' })}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm mb-4"
            style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', boxShadow: '0 0 20px rgba(22,163,74,0.35)' }}>
            <Trophy size={15} />
            PLAY TOURNAMENT
            <Trophy size={15} />
          </button>

          <div className="grid grid-cols-2 gap-3 mb-8">
            {TWO_PLAYER_DEFS.map((def, i) => (
              <TwoPlayerCard key={def.id} def={def} index={i}
                onTap={() => setView({ type: 'pregame', gameId: def.id })} />
            ))}
          </div>
        </div>

        {/* 1P section */}
        <div ref={onePRef}>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <User size={13} style={{ color: 'var(--loft-muted)' }} />
              <span className="text-xs font-black tracking-widest" style={{ color: 'var(--loft-muted)' }}>1 PLAYER GAMES</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SOLO_DEFS.map((game, i) => (
              <SoloCard key={game.id} def={game} index={i}
                score={soloScores[game.id]?.bestScore}
                onTap={() => setView({ type: 'solo', gameId: game.id })} />
            ))}
          </div>
        </div>
      </div>

      {/* Overlay views */}
      <AnimatePresence>
        {view.type === 'pregame' && (
          <PreGameScreen
            key="pregame"
            gameId={view.gameId}
            defaultColor={defaultColor}
            onBack={() => setView({ type: 'hub' })}
            onStart={(mode, difficulty, p1Color) => {
              applyColor(p1Color)
              setView({ type: 'playing2p', gameId: view.gameId, mode, difficulty, p1Color })
            }}
          />
        )}
        {view.type === 'tournament-setup' && (
          <TournamentSetup
            key="tsetup"
            defaultColor={defaultColor}
            onBack={() => setView({ type: 'hub' })}
            onStart={handleTournamentStart}
          />
        )}
        {view.type === 'tournament' && view.tState.phase === 'interstitial' && (
          <TournamentInterstitial
            key="interstitial"
            tState={view.tState}
            onNext={handleInterstitialNext}
          />
        )}
        {view.type === 'tournament' && view.tState.phase === 'result' && (
          <TournamentResult
            key="tresult"
            tState={view.tState}
            onAgain={() => setView({ type: 'tournament-setup' })}
            onBack={() => setView({ type: 'hub' })}
          />
        )}
        {showStats && (
          <StatsSheet key="stats" tournaments={tournaments} onClose={() => setShowStats(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
