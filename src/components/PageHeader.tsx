interface Props {
  title: string
  right?: React.ReactNode
}

export default function PageHeader({ title, right }: Props) {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-5 pt-14 pb-4 safe-top"
      style={{ background: 'var(--loft-bg2)', borderBottom: '1px solid var(--loft-border)' }}
    >
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--loft-text)' }}>{title}</h1>
      {right && <div>{right}</div>}
    </div>
  )
}
