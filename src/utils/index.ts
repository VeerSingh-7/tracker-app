import { format } from 'date-fns'

export const today = () => format(new Date(), 'yyyy-MM-dd')

export function formatCurrency(n: number): string {
  return `£${n.toFixed(2)}`
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
