import { ArrowLeft } from 'lucide-react'

interface Props {
  title: string
  right?: React.ReactNode
  onBack?: () => void
}

export default function PageHeader({ title, right, onBack }: Props) {
  return (
    <div
      className="flex-shrink-0 flex items-center gap-3 px-5 pt-14 pb-4 safe-top"
      style={{ background: 'var(--loft-bg2)', borderBottom: '1px solid var(--loft-border)' }}
    >
      {onBack && (
        <button
          onClick={onBack}
          className="-ml-1 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--loft-card)', border: '1px solid var(--loft-border)' }}
        >
          <ArrowLeft size={18} style={{ color: 'var(--loft-text)' }} />
        </button>
      )}
      <h1 className="text-2xl font-extrabold tracking-tight truncate flex-1" style={{ color: 'var(--loft-text)' }}>{title}</h1>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  )
}
