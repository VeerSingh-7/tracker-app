import type { RevCardType, RevCard } from '../types'

// ─── Card types (DB v11) ──────────────────────────────────────────────────────
export const CARD_TYPES: { value: RevCardType; label: string; hint: string }[] = [
  { value: 'basic',           label: 'Basic',            hint: 'Plain front / back' },
  { value: 'term_definition', label: 'Term & Definition', hint: 'Key term and its meaning' },
  { value: 'quote_analysis',  label: 'Quote & Analysis',  hint: 'Quote on front, analysis on back' },
  { value: 'theme_quotes',    label: 'Theme Quotes',      hint: 'Quote that evidences a theme' },
  { value: 'character_arc',   label: 'Character Arc',     hint: 'A character moment / development' },
]
export const CARD_TYPE_LABEL: Record<RevCardType, string> =
  Object.fromEntries(CARD_TYPES.map(t => [t.value, t.label])) as Record<RevCardType, string>

// Quote-style cards render the front as a prominent quotation in study mode.
export function isQuoteCard(t: RevCardType): boolean {
  return t === 'quote_analysis' || t === 'theme_quotes'
}

// Parse comma-separated theme input into a clean, de-duplicated list.
export function parseThemes(input: string): string[] {
  const out: string[] = []
  for (const raw of input.split(',')) {
    const t = raw.trim()
    if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out
}

// Distinct themes / locations present across a set of cards (for filter bars).
export function distinctThemes(cards: RevCard[]): string[] {
  const map = new Map<string, string>()
  for (const c of cards) for (const t of c.themes ?? []) { const k = t.toLowerCase(); if (!map.has(k)) map.set(k, t) }
  return [...map.values()].sort((a, b) => a.localeCompare(b))
}
export function distinctLocations(cards: RevCard[]): string[] {
  const map = new Map<string, string>()
  for (const c of cards) { const l = (c.location ?? '').trim(); if (l) { const k = l.toLowerCase(); if (!map.has(k)) map.set(k, l) } }
  return [...map.values()].sort((a, b) => a.localeCompare(b))
}

// ─── Constants ──────────────────────────────────────────────────────────────
export const SUBJECT_COLOURS = [
  '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#f59e0b', '#ec4899',
  '#14b8a6', '#eab308', '#06b6d4', '#f97316', '#8b5cf6', '#10b981',
]
export const EXAM_BOARDS = ['AQA', 'Edexcel', 'OCR', 'WJEC', 'Eduqas', 'Other']
export const TIERS: { value: string; label: string }[] = [
  { value: 'Higher', label: 'Higher' },
  { value: 'Foundation', label: 'Foundation' },
  { value: '', label: 'None' },
]

// Tier/board badge text helper
export function boardTierLabel(examBoard: string, tier: string): string {
  return tier ? `${examBoard} · ${tier}` : examBoard
}

// ─── Paste-to-split parsing ───────────────────────────────────────────────────
// IMPORTANT: this only RESTRUCTURES the exact text the user pasted, based on the
// chosen delimiter. It never invents, summarises, generates or adds any content.
export type ParseFormat = 'qa' | 'dash' | 'colon' | 'blocks'
export interface DraftCard { front: string; back: string }

export const PARSE_FORMATS: { value: ParseFormat; label: string; hint: string }[] = [
  { value: 'qa',     label: 'Q: … A: …',         hint: 'Lines starting with Q: and A:' },
  { value: 'dash',   label: 'Term – Definition', hint: 'One per line, split on first dash or colon' },
  { value: 'colon',  label: 'Term: Definition',  hint: 'One per line, split on first colon' },
  { value: 'blocks', label: 'Blank-line blocks', hint: 'First line = front, the rest = back' },
]

export function parseNotes(text: string, fmt: ParseFormat): DraftCard[] {
  const cards: DraftCard[] = []

  if (fmt === 'blocks') {
    for (const block of text.split(/\n\s*\n/)) {
      const lines = block.split('\n')
      const firstIdx = lines.findIndex(l => l.trim() !== '')
      if (firstIdx === -1) continue
      const front = lines[firstIdx].trim()
      const back = lines.slice(firstIdx + 1).join('\n').trim()
      if (front) cards.push({ front, back })
    }
    return cards
  }

  if (fmt === 'qa') {
    let cur: DraftCard | null = null
    let section: 'front' | 'back' | null = null
    const flush = () => { if (cur && cur.front.trim()) cards.push({ front: cur.front.trim(), back: cur.back.trim() }) }
    for (const line of text.split('\n')) {
      const q = line.match(/^\s*Q\s*[:.)-]\s*(.*)$/i)
      const a = line.match(/^\s*A\s*[:.)-]\s*(.*)$/i)
      if (q) { flush(); cur = { front: q[1], back: '' }; section = 'front' }
      else if (a && cur) { cur.back = a[1]; section = 'back' }
      else if (cur && section === 'front') cur.front += (cur.front ? '\n' : '') + line
      else if (cur && section === 'back') cur.back += (cur.back ? '\n' : '') + line
    }
    flush()
    return cards
  }

  // 'dash' (first dash or colon) or 'colon' (first colon) — one card per line.
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let splitIdx: number
    if (fmt === 'colon') {
      splitIdx = line.indexOf(':')
    } else {
      const d = line.indexOf('-'), c = line.indexOf(':')
      const cands = [d, c].filter(i => i >= 0)
      splitIdx = cands.length ? Math.min(...cands) : -1
    }
    if (splitIdx === -1) { cards.push({ front: line, back: '' }); continue }
    const front = line.slice(0, splitIdx).trim()
    const back = line.slice(splitIdx + 1).trim()
    if (front) cards.push({ front, back })
  }
  return cards
}
