import { useState } from 'react'
import { RECOVERY_QUESTIONS, CUSTOM_QUESTION } from './secure'

interface Props {
  // Emits the effective question text: a preset, or the typed custom question.
  onChange: (question: string) => void
}

const inputStyle = { background: 'var(--loft-card2)', color: 'var(--loft-text)', border: '1px solid var(--loft-border2)' }

export default function QuestionPicker({ onChange }: Props) {
  const [sel, setSel] = useState<string>(RECOVERY_QUESTIONS[0])
  const [custom, setCustom] = useState('')
  const isCustom = sel === CUSTOM_QUESTION

  function update(nextSel: string, nextCustom: string) {
    setSel(nextSel)
    setCustom(nextCustom)
    onChange(nextSel === CUSTOM_QUESTION ? nextCustom.trim() : nextSel)
  }

  return (
    <div className="space-y-2">
      <select
        value={sel}
        onChange={(e) => update(e.target.value, custom)}
        className="w-full rounded-xl px-4 py-3 text-base outline-none appearance-none"
        style={inputStyle}
      >
        {RECOVERY_QUESTIONS.map((q) => (
          <option key={q} value={q}>{q}</option>
        ))}
        <option value={CUSTOM_QUESTION}>Write my own…</option>
      </select>
      {isCustom && (
        <input
          type="text"
          value={custom}
          onChange={(e) => update(CUSTOM_QUESTION, e.target.value)}
          placeholder="Your question"
          autoFocus
          className="w-full rounded-xl px-4 py-3 text-base outline-none"
          style={inputStyle}
        />
      )}
    </div>
  )
}
