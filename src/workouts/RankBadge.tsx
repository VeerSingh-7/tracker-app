import { useId } from 'react'
import { TIER_COLORS, TIER_NAMES } from '../data/strengthStandards'
import type { Tier } from '../data/strengthStandards'

interface Props {
  tier: Tier
  subTier: 1 | 2 | 3
  size?: number
  showLabel?: boolean
  lp?: number
}

const ROMAN = ['I', 'II', 'III']

// Shield-like hexagon path in a 100×110 viewBox
const SHIELD = 'M50,4 L90,22 L93,64 L50,106 L7,64 L10,22 Z'
const INNER  = 'M50,10 L84,25 L87,63 L50,98 L13,63 L16,25 Z'

function TierEmblem({ tier, colors }: { tier: Tier; colors: typeof TIER_COLORS[Tier] }) {
  switch (tier) {
    case 'wood':
      return (
        <g>
          <line x1="32" y1="35" x2="68" y2="35" stroke={colors.shadow} strokeWidth="1.5" opacity="0.6" />
          <line x1="30" y1="47" x2="70" y2="47" stroke={colors.shadow} strokeWidth="1.5" opacity="0.6" />
          <line x1="32" y1="59" x2="68" y2="59" stroke={colors.shadow} strokeWidth="1.5" opacity="0.5" />
          <circle cx="50" cy="47" r="10" fill={colors.shadow} opacity="0.5" />
          <circle cx="50" cy="47" r="6" fill={colors.highlight} opacity="0.7" />
        </g>
      )
    case 'bronze':
      return (
        <g>
          <circle cx="50" cy="50" r="14" fill={colors.shadow} opacity="0.6" />
          <circle cx="50" cy="50" r="10" fill={colors.highlight} opacity="0.7" />
          <circle cx="50" cy="50" r="5" fill={colors.text} opacity="0.9" />
          <circle cx="47" cy="47" r="2" fill="white" opacity="0.4" />
        </g>
      )
    case 'silver':
      return (
        <g>
          <polygon points="50,30 56,44 72,44 59,53 64,67 50,58 36,67 41,53 28,44 44,44" fill="white" opacity="0.35" />
          <polygon points="50,34 55,44 68,44 57,51 61,63 50,56 39,63 43,51 32,44 45,44" fill="white" opacity="0.7" />
        </g>
      )
    case 'gold':
      return (
        <g>
          <polygon points="35,38 38,28 42,38" fill={colors.highlight} opacity="0.95" />
          <polygon points="47,38 50,26 53,38" fill={colors.highlight} opacity="0.95" />
          <polygon points="58,38 62,28 65,38" fill={colors.highlight} opacity="0.95" />
          <rect x="35" y="38" width="30" height="14" rx="3" fill={colors.shadow} opacity="0.5" />
          <rect x="36" y="39" width="28" height="12" rx="2" fill={colors.highlight} opacity="0.5" />
          <circle cx="50" cy="58" r="6" fill={colors.text} opacity="0.95" />
          <circle cx="48" cy="56" r="2" fill="white" opacity="0.5" />
        </g>
      )
    case 'platinum':
      return (
        <g>
          <polygon points="50,28 64,40 64,58 50,68 36,58 36,40" fill={colors.text} opacity="0.2" stroke={colors.highlight} strokeWidth="1.5" />
          <polygon points="50,32 60,40 50,50" fill="white" opacity="0.4" />
          <circle cx="50" cy="50" r="7" fill={colors.highlight} opacity="0.75" />
          <circle cx="50" cy="50" r="4" fill="white" opacity="0.7" />
        </g>
      )
    case 'diamond':
      return (
        <g>
          <polygon points="50,26 66,40 66,58 50,70 34,58 34,40" fill={colors.text} opacity="0.15" stroke={colors.highlight} strokeWidth="1" />
          <polygon points="50,30 62,40 62,56 50,66 38,56 38,40" fill={colors.highlight} opacity="0.25" stroke="white" strokeWidth="0.5" />
          <polygon points="50,30 62,40 50,40" fill="white" opacity="0.6" />
          <circle cx="50" cy="50" r="6" fill="white" opacity="0.65" />
          <circle cx="48" cy="48" r="2" fill="white" opacity="0.9" />
        </g>
      )
    case 'champion':
      return (
        <g>
          <path d="M36,50 Q24,38 30,26 Q32,40 42,44" fill={colors.highlight} opacity="0.75" />
          <path d="M64,50 Q76,38 70,26 Q68,40 58,44" fill={colors.highlight} opacity="0.75" />
          <circle cx="50" cy="50" r="11" fill={colors.shadow} opacity="0.55" />
          <circle cx="50" cy="50" r="7" fill={colors.highlight} opacity="0.8" />
          <circle cx="50" cy="50" r="3.5" fill={colors.text} opacity="1" />
          <circle cx="48" cy="48" r="1.5" fill="white" opacity="0.55" />
        </g>
      )
    case 'titan':
      return (
        <g>
          <path d="M36,44 L28,22 L44,38" fill={colors.highlight} opacity="0.85" />
          <path d="M64,44 L72,22 L56,38" fill={colors.highlight} opacity="0.85" />
          <path d="M44,30 L50,14 L56,30" fill={colors.highlight} opacity="0.85" />
          <circle cx="50" cy="54" r="12" fill={colors.shadow} opacity="0.5" />
          <circle cx="50" cy="54" r="7" fill={colors.highlight} opacity="0.75" />
          <circle cx="50" cy="54" r="3.5" fill={colors.text} opacity="1" />
        </g>
      )
    case 'olympian':
      return (
        <g>
          <ellipse cx="50" cy="32" rx="17" ry="5.5" fill="none" stroke={colors.highlight} strokeWidth="2.5" opacity="0.95" />
          <ellipse cx="50" cy="32" rx="17" ry="5.5" fill="none" stroke="white" strokeWidth="0.8" opacity="0.5" />
          <line x1="30" y1="20" x2="26" y2="13" stroke={colors.highlight} strokeWidth="1.5" opacity="0.75" />
          <line x1="70" y1="20" x2="74" y2="13" stroke={colors.highlight} strokeWidth="1.5" opacity="0.75" />
          <line x1="50" y1="17" x2="50" y2="9" stroke={colors.highlight} strokeWidth="1.5" opacity="0.75" />
          <line x1="40" y1="16" x2="38" y2="10" stroke={colors.highlight} strokeWidth="1" opacity="0.5" />
          <line x1="60" y1="16" x2="62" y2="10" stroke={colors.highlight} strokeWidth="1" opacity="0.5" />
          <circle cx="50" cy="54" r="11" fill={colors.shadow} opacity="0.4" />
          <circle cx="50" cy="54" r="7" fill={colors.highlight} opacity="0.75" />
          <circle cx="50" cy="54" r="4" fill="white" opacity="0.85" />
          <circle cx="48" cy="52" r="1.5" fill="white" opacity="1" />
        </g>
      )
  }
}

export default function RankBadge({ tier, subTier, size = 60, showLabel = false, lp }: Props) {
  const uid = useId()
  const colors = TIER_COLORS[tier]
  const roman = ROMAN[subTier - 1]
  const w = size
  const h = Math.round(size * 1.2)

  return (
    <div className="flex flex-col items-center gap-0.5" style={{ width: w }}>
      <svg width={w} height={h} viewBox="0 0 100 120">
        <defs>
          <linearGradient id={`${uid}-bg`} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor={colors.highlight} />
            <stop offset="55%" stopColor={colors.bg} />
            <stop offset="100%" stopColor={colors.shadow} />
          </linearGradient>
          <linearGradient id={`${uid}-shine`} x1="0%" y1="0%" x2="60%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="0.28" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Drop shadow */}
        <path d={SHIELD} fill={colors.shadow} opacity="0.35" transform="translate(2.5,3.5)" />

        {/* Main shield fill */}
        <path d={SHIELD} fill={`url(#${uid}-bg)`} />

        {/* Specular shine */}
        <path d={SHIELD} fill={`url(#${uid}-shine)`} />

        {/* Inner border ring */}
        <path d={INNER} fill="none" stroke={colors.highlight} strokeWidth="1.2" strokeOpacity="0.65" />

        {/* Tier-specific central emblem */}
        <TierEmblem tier={tier} colors={colors} />

        {/* Roman numeral sub-tier */}
        <text
          x="50" y="116"
          textAnchor="middle"
          fill={colors.text}
          fontSize="10"
          fontWeight="bold"
          fontFamily="Georgia, serif"
          letterSpacing="1"
        >
          {roman}
        </text>
      </svg>

      {showLabel && (
        <span className="text-[10px] font-bold mt-0.5" style={{ color: colors.bg }}>
          {TIER_NAMES[tier]}
        </span>
      )}

      {lp !== undefined && (
        <div className="w-full rounded-full h-1.5 mt-0.5" style={{ backgroundColor: `${colors.shadow}50` }}>
          <div
            className="h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${lp}%`, backgroundColor: colors.highlight }}
          />
        </div>
      )}
    </div>
  )
}
