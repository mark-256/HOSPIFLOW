/**
 * Semantic status styling.
 *
 * Every status badge in HOSPIFLOW resolves its colours through this module so
 * the same status always looks the same, in every module.
 */

export type StatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

export const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-success-50 text-success-700 ring-success-200',
  warning: 'bg-warning-50 text-warning-700 ring-warning-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-200',
  info: 'bg-info-50 text-info-700 ring-info-200',
  accent: 'bg-accent-50 text-accent-800 ring-accent-200',
}

export const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
  accent: 'bg-accent-500',
}

export const TONE_BAR_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
  accent: 'bg-accent-500',
}

type StatusDefinition = { label: string; tone: StatusTone }

const definitions = <T extends string>(map: Record<T, StatusDefinition>) => map

/* ------------------------------------------------------------------ Rooms */
export const ROOM_STATUS = definitions({
  AVAILABLE: { label: 'Available', tone: 'success' },
  OCCUPIED: { label: 'Occupied', tone: 'info' },
  DIRTY: { label: 'Dirty', tone: 'warning' },
  CLEANING: { label: 'Cleaning', tone: 'brand' },
  INSPECTED: { label: 'Inspected', tone: 'brand' },
  RESERVED: { label: 'Reserved', tone: 'accent' },
  OUT_OF_ORDER: { label: 'Out of order', tone: 'danger' },
  OUT_OF_SERVICE: { label: 'Out of service', tone: 'danger' },
})

/* ----------------------------------------------------------- Reservations */
export const RESERVATION_STATUS = definitions({
  PENDING: { label: 'Pending', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  CHECKED_IN: { label: 'Checked in', tone: 'success' },
  CHECKED_OUT: { label: 'Checked out', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  NO_SHOW: { label: 'No show', tone: 'danger' },
})

/* ----------------------------------------------------------------- Orders */
export const ORDER_STATUS = definitions({
  DRAFT: { label: 'Draft', tone: 'neutral' },
  OPEN: { label: 'Open', tone: 'brand' },
  SENT_TO_KITCHEN: { label: 'New', tone: 'warning' },
  PREPARING: { label: 'Preparing', tone: 'info' },
  READY: { label: 'Ready', tone: 'success' },
  SERVED: { label: 'Served', tone: 'accent' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
})

/* --------------------------------------------------------------- Payments */
export const PAYMENT_STATUS = definitions({
  PENDING: { label: 'Pending', tone: 'warning' },
  COMPLETED: { label: 'Paid', tone: 'success' },
  PAID: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'Partially refunded', tone: 'warning' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
})

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MPESA: 'M-Pesa',
  BANK_TRANSFER: 'Bank transfer',
  ROOM_CHARGE: 'Room charge',
  STRIPE: 'Stripe',
  OTHER: 'Other',
}

/* ----------------------------------------------------------------- Folios */
export const FOLIO_STATUS = definitions({
  OPEN: { label: 'Open', tone: 'info' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  SETTLED: { label: 'Settled', tone: 'success' },
})

/* ----------------------------------------------------------------- Tables */
export const TABLE_STATUS = definitions({
  AVAILABLE: { label: 'Available', tone: 'success' },
  OCCUPIED: { label: 'Occupied', tone: 'info' },
  ORDERING: { label: 'Ordering', tone: 'brand' },
  FOOD_PREPARING: { label: 'Preparing', tone: 'warning' },
  READY: { label: 'Ready', tone: 'success' },
  BILL_REQUESTED: { label: 'Bill requested', tone: 'accent' },
  PAYMENT_PENDING: { label: 'Payment pending', tone: 'warning' },
  CLEANING: { label: 'Cleaning', tone: 'neutral' },
})

/* ----------------------------------------------------------- Housekeeping */
export const HOUSEKEEPING_STATUS = definitions({
  PENDING: { label: 'Pending', tone: 'neutral' },
  ASSIGNED: { label: 'Assigned', tone: 'brand' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  INSPECTION: { label: 'Inspection', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  VERIFIED: { label: 'Verified', tone: 'success' },
})

/* ------------------------------------------------------------ Maintenance */
export const MAINTENANCE_STATUS = definitions({
  OPEN: { label: 'Open', tone: 'warning' },
  ASSIGNED: { label: 'Assigned', tone: 'brand' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  WAITING: { label: 'Waiting', tone: 'accent' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
})

export const PRIORITY_STATUS = definitions({
  LOW: { label: 'Low', tone: 'neutral' },
  MEDIUM: { label: 'Medium', tone: 'info' },
  NORMAL: { label: 'Normal', tone: 'info' },
  HIGH: { label: 'High', tone: 'warning' },
  URGENT: { label: 'Urgent', tone: 'danger' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
})

/* ------------------------------------------------------- Purchase orders */
export const PURCHASE_ORDER_STATUS = definitions({
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'brand' },
  ORDERED: { label: 'Ordered', tone: 'warning' },
  PARTIALLY_RECEIVED: { label: 'Partially received', tone: 'warning' },
  RECEIVED: { label: 'Received', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
})

/* ------------------------------------------------------- Online ordering */
export const ONLINE_ORDER_STATUS = definitions({
  PENDING: { label: 'Pending', tone: 'warning' },
  RECEIVED: { label: 'Received', tone: 'info' },
  ACCEPTED: { label: 'Accepted', tone: 'brand' },
  PREPARING: { label: 'Preparing', tone: 'info' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', tone: 'accent' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
})

/* ------------------------------------------------------------- Stock risk */
export const STOCK_LEVEL = {
  out: { label: 'Out of stock', tone: 'danger' as StatusTone },
  low: { label: 'Low stock', tone: 'warning' as StatusTone },
  healthy: { label: 'In stock', tone: 'success' as StatusTone },
  untracked: { label: 'Not tracked', tone: 'neutral' as StatusTone },
}

/* ------------------------------------------------------------------ Roles */
export const LOYALTY_TIER = definitions({
  BRONZE: { label: 'Bronze', tone: 'accent' },
  SILVER: { label: 'Silver', tone: 'neutral' },
  GOLD: { label: 'Gold', tone: 'warning' },
  PLATINUM: { label: 'Platinum', tone: 'info' },
  DIAMOND: { label: 'Diamond', tone: 'brand' },
})

/* --------------------------------------------------------- Entity status */
export const ENTITY_STATUS = definitions({
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
  SUSPENDED: { label: 'Suspended', tone: 'warning' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
  PENDING: { label: 'Pending', tone: 'warning' },
  ONLINE: { label: 'Online', tone: 'success' },
  OFFLINE: { label: 'Offline', tone: 'neutral' },
  MAINTENANCE: { label: 'Maintenance', tone: 'warning' },
})

export type StatusRegistry = Record<string, StatusDefinition>

/**
 * Resolve a raw status string to a label + tone. Unknown values fall back to a
 * neutral badge with the original value, so no data ever disappears silently.
 */
export function resolveStatus(
  status: string | null | undefined,
  registry: StatusRegistry,
): { label: string; tone: StatusTone; value: string } {
  const value = (status || '').toString().trim()
  if (!value) return { label: 'Unknown', tone: 'neutral', value: '' }
  const match = registry[value.toUpperCase()]
  if (match) return { ...match, value }
  return { label: value.replace(/_/g, ' ').toLowerCase().replace(/^./, (char) => char.toUpperCase()), tone: 'neutral', value }
}

/** Group an array of records by a status field, preserving order. */
export function countByStatus<T>(items: T[], key: keyof T): Array<{ status: string; count: number }> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const raw = String((item as Record<string, unknown>)[key as string] ?? 'UNKNOWN')
    counts.set(raw, (counts.get(raw) || 0) + 1)
  }
  return Array.from(counts.entries()).map(([status, count]) => ({ status, count }))
}
