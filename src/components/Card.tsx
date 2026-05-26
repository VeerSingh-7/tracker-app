import { motion } from 'framer-motion'

interface Props {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  padding?: string
  glow?: boolean
}

export default function Card({ children, className = '', onClick, padding = 'p-4', glow = false }: Props) {
  const base = `loft-card rounded-3xl border border-[rgba(255,255,255,0.06)] ${padding} ${className}${glow ? ' loft-glow-ring' : ''}`

  if (onClick) {
    return (
      <motion.button
        whileTap={{ scale: 0.982 }}
        onClick={onClick}
        className={`${base} w-full text-left transition-all duration-150 hover:border-[rgba(59,158,255,0.2)] active:opacity-80`}
      >
        {children}
      </motion.button>
    )
  }

  return <div className={base}>{children}</div>
}
