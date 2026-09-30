'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChefHat, Clock, RefreshCw, Utensils } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import Button from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { ORDER_STATUS } from '@/lib/status'
import { formatCurrency, formatTime } from '@/lib/format'

type KitchenOrder = {
  id: string
  orderNumber: string
  status: string
  orderType?: string
  total?: number | string
  createdAt?: string
  updatedAt?: string
  table?: { name?: string } | null
  items?: Array<{ id: string; productName?: string; quantity?: number; notes?: string | null }>
}

const COLUMNS: Array<{ status: string; title: string; description: string; actionLabel?: string; nextStatus?: string }> = [
  { status: 'SENT_TO_KITCHEN', title: 'New', description: 'Awaiting preparation', actionLabel: 'Start preparation', nextStatus: 'PREPARING' },
  { status: 'PREPARING', title: 'Preparing', description: 'In progress', actionLabel: 'Mark ready', nextStatus: 'READY' },
  { status: 'READY', title: 'Ready', description: 'Ready for service', actionLabel: 'Mark served', nextStatus: 'SERVED' },
  { status: 'SERVED', title: 'Served', description: 'Completed service' },
]

function minutesSince(value?: string): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, Math.round((Date.now() - timestamp) / 60000))
}

export default function KitchenPage() {
  const toast = useToast()
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await apiRequest<KitchenOrder[]>('/api/orders?limit=100')
      setOrders(
        responseData(response).filter((order) => COLUMNS.some((column) => column.status === order.status)),
      )
      setLastUpdated(new Date().toISOString())
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load kitchen orders'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(interval)
  }, [load])

  const updateStatus = async (order: KitchenOrder, status: string) => {
    setBusyId(order.id)
    setError('')
    try {
      await apiRequest(`/api/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      toast.success('Order updated', `${order.orderNumber} moved to ${ORDER_STATUS[status as keyof typeof ORDER_STATUS]?.label.toLowerCase() || status}.`)
      await load()
    } catch (reason) {
      const message = getErrorMessage(reason, 'Unable to update kitchen order')
      setError(message)
      toast.error('Update failed', message)
    } finally {
      setBusyId('')
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, KitchenOrder[]>()
    for (const column of COLUMNS) map.set(column.status, [])
    for (const order of orders) {
      const bucket = map.get(order.status)
      if (bucket) bucket.push(order)
    }
    return map
  }, [orders])

  return (
    <ModuleShell
      title="Kitchen"
      description="Preparation queue and service status"
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()} leadingIcon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}>
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorState title="Kitchen display unavailable" message={error} onRetry={() => void load()} /> : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="hf-caption">
            {loading
              ? 'Loading kitchen orders...'
              : lastUpdated
                ? `Updated ${formatTime(lastUpdated)} - auto-refreshing every 15 seconds`
                : 'Kitchen queue'}
          </p>
          <Link href="/pos" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            Back to point of sale
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading kitchen orders">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-64 rounded-lg" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ChefHat className="h-5 w-5" />}
              title="No active kitchen orders"
              description="Orders sent from the point of sale, restaurant, or bar will appear here automatically."
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((column) => {
              const items = grouped.get(column.status) || []
              return (
                <section key={column.status} aria-labelledby={`kitchen-${column.status}`} className="flex flex-col">
                  <Card className="flex h-full flex-col">
                    <CardHeader className="items-center">
                      <CardTitle description={column.description}>
                        <span id={`kitchen-${column.status}`}>{column.title}</span>
                      </CardTitle>
                      <span className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-700">
                        {items.length}
                      </span>
                    </CardHeader>
                    {items.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-ink-400 sm:px-5">Nothing here</p>
                    ) : (
                      <CardBody className="flex-1 space-y-3">
                        {items.map((order) => {
                          const elapsed = minutesSince(order.createdAt)
                          return (
                            <div key={order.id} className="rounded-lg border border-line bg-surface-muted p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-ink-900">{order.orderNumber}</p>
                                  <p className="truncate text-xs text-ink-500">
                                    {order.table?.name || 'Walk-in'} · {order.orderType?.replace(/_/g, ' ').toLowerCase() || 'order'}
                                  </p>
                                </div>
                                <StatusBadge status={order.status} registry={ORDER_STATUS} showDot={false} />
                              </div>
                              <ul className="mt-3 space-y-1.5">
                                {(order.items || []).map((item) => (
                                  <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                                    <span className="min-w-0 flex-1 text-ink-800">{item.productName || 'Item'}</span>
                                    <span className="shrink-0 font-medium tabular-nums text-ink-600">x{item.quantity || 0}</span>
                                  </li>
                                ))}
                              </ul>
                              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-xs text-ink-500">
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                                  {formatTime(order.createdAt)}
                                  {elapsed !== null ? ` · ${elapsed}m` : ''}
                                </span>
                                <span className="font-medium tabular-nums text-ink-700">{formatCurrency(order.total || 0)}</span>
                              </div>
                              {column.nextStatus ? (
                                <Button
                                  className="mt-3 w-full"
                                  size="sm"
                                  loading={busyId === order.id}
                                  onClick={() => void updateStatus(order, column.nextStatus as string)}
                                >
                                  {column.actionLabel}
                                </Button>
                              ) : null}
                            </div>
                          )
                        })}
                      </CardBody>
                    )}
                  </Card>
                </section>
              )
            })}
          </div>
        )}

        {!loading && orders.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle description="Items in the current queue">Queue summary</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-wrap items-center gap-3 text-sm text-ink-600">
              <span className="inline-flex items-center gap-1.5">
                <Utensils aria-hidden="true" className="h-4 w-4 text-ink-400" />
                {orders.reduce((sum, order) => sum + (order.items?.length || 0), 0)} items
              </span>
              <span aria-hidden="true" className="text-ink-300">
                |
              </span>
              <span className="tabular-nums">
                {formatCurrency(orders.reduce((sum, order) => sum + Number(order.total || 0), 0))} in the queue
              </span>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </ModuleShell>
  )
}
