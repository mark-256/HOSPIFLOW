/**
 * Display formatting helpers. These only change presentation - they never
 * alter stored values or business calculations.
 */

const DEFAULT_CURRENCY = 'KES'

export function formatCurrency(
  value: number | string | null | undefined,
  currency: string = DEFAULT_CURRENCY,
): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return `${currency} 0.00`
  return `${currency} ${amount.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Compact currency for dense tables and metric tiles (e.g. KES 245.8K). */
export function formatCurrencyCompact(
  value: number | string | null | undefined,
  currency: string = DEFAULT_CURRENCY,
): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return `${currency} 0`
  const absolute = Math.abs(amount)
  if (absolute >= 1_000_000) return `${currency} ${(amount / 1_000_000).toFixed(1)}M`
  if (absolute >= 1_000) return `${currency} ${(amount / 1_000).toFixed(1)}K`
  return formatCurrency(amount, currency)
}

export function formatNumber(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '0'
  return amount.toLocaleString('en-KE')
}

export function formatPercent(value: number | string | null | undefined, fractionDigits = 0): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '0%'
  return `${amount.toFixed(fractionDigits)}%`
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** Start of the current day in local time. */
export function startOfToday(): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

export function isSameDay(value: string | Date | null | undefined, reference: Date): boolean {
  if (!value) return false
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  )
}

export function initials(first?: string | null, last?: string | null): string {
  const firstInitial = first?.trim()?.charAt(0) || ''
  const lastInitial = last?.trim()?.charAt(0) || ''
  const value = `${firstInitial}${lastInitial}`.toUpperCase()
  return value || 'U'
}

export function fullName(person: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!person) return '-'
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim()
  return name || '-'
}
