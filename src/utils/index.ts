import { format } from 'date-fns'

export const today = () => format(new Date(), 'yyyy-MM-dd')

export function formatCurrency(n: number): string {
  return `£${Math.abs(n).toFixed(2)}`
}

// Signed amount, e.g. +£12.00 / -£5.50 / £0.00
export function formatSigned(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}£${Math.abs(n).toFixed(2)}`
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
