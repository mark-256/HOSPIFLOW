'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BedDouble,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  DoorOpen,
  LogOut,
  ReceiptText,
  Sparkles,
  TrendingUp,
  UtensilsCrossed,
} from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import MetricCard from '@/components/dashboard/MetricCard'
import { ChartCard, StatusBreakdown, buildBreakdown } from '@/components/dashboard/ChartCard'
import Button from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { SkeletonStatGrid } from '@/components/ui/Skeleton'
import { Alert } from '@/components/ui/Alert'
import { apiRequest, getErrorMessage } from '@/lib/api'
import {
  ORDER_STATUS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS,
  RESERVATION_STATUS,
  ROOM_STATUS,
  TONE_DOT_CLASSES,
  type StatusTone,
} from '@/lib/status'
import { countByStatus } from '@/lib/status'
import { formatCurrency, formatCurrencyCompact, formatDate, formatPercent, formatTime, isSameDay, startOfToday } from '@/lib/format'

type Room = { id: string; roomNumber: string; status: string; floor?: string | null; building?: string | null; roomType?: { name?: string } | null }
type Reservation = {
  id: string
  confirmationCode: string
  status: string
  checkInDate: string
  checkOutDate: string
  roomId?: string | null
  guests?: number
  room?: { roomNumber?: string } | null
  guest?: { firstName?: string; lastName?: string } | null
}
type Order = { id: string; orderNumber: string; status: string; total?: number | string; createdAt: string; orderType?: string; table?: { name?: string } | null }
type Payment = { id: string; status?: string; amount: number | string; paymentMethod?: string }
type Folio = { id: string; status: string; balance: number | string }
type SalesReport = {
  totalSales?: number
  totalOrders?: number
  avgOrderValue?: number
  byPayment?: Record<string, number>
  orders?: Array<{ id: string; total: number | string; createdAt: string }>
}

const CHART_COLORS = ['#1f6b72', '#2c858a', '#49a1a5', '#7fc0c2', '#c3801f', '#52606d', '#3167bb', '#228f5e']

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="mt-0.5 text-sm font-medium text-ink-900">
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [folios, setFolios] = useState<Folio[]>([])
  const [sales, setSales] = useState<SalesReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setWarnings([])

    const [roomResult, reservationResult, orderResult, paymentResult, folioResult, salesResult] = await Promise.allSettled([
      apiRequest<Room[]>('/api/rooms?limit=100'),
      apiRequest<Reservation[]>('/api/reservations?limit=100'),
      apiRequest<Order[]>('/api/orders?limit=100'),
      apiRequest<Payment[]>('/api/payments'),
      apiRequest<Folio[]>('/api/folios?limit=100'),
      apiRequest<SalesReport>('/api/reports/sales?limit=100'),
    ])

    const failed: string[] = []
    const dataOf = <T,>(result: PromiseSettledResult<{ data: T }>, label: string, apply: (data: T) => void) => {
      if (result.status === 'fulfilled') apply(result.value.data)
      else failed.push(label)
    }

    dataOf(roomResult, 'room inventory', (data) => setRooms(Array.isArray(data) ? data : []))
    dataOf(reservationResult, 'reservations', (data) => setReservations(Array.isArray(data) ? data : []))
    dataOf(orderResult, 'orders', (data) => setOrders(Array.isArray(data) ? data : []))
    dataOf(paymentResult, 'payments', (data) => setPayments(Array.isArray(data) ? data : []))
    dataOf(folioResult, 'folios', (data) => setFolios(Array.isArray(data) ? data : []))
    dataOf(salesResult, 'sales reporting', (data) => setSales(data))

    const allFailed = [roomResult, reservationResult, orderResult, paymentResult, folioResult, salesResult].every(
      (result) => result.status === 'rejected',
    )
    if (allFailed) {
      setError(getErrorMessage((roomResult as PromiseRejectedResult).reason, 'Unable to load dashboard data'))
    } else {
      setWarnings(failed.map((label) => `${label[0].toUpperCase()}${label.slice(1)} could not be loaded.`))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const metrics = useMemo(() => {
    const today = startOfToday()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const salesOrders = sales?.orders || []
    const revenueToday = salesOrders
      .filter((order) => isSameDay(order.createdAt, today))
      .reduce((sum, order) => sum + Number(order.total || 0), 0)
    const revenueYesterday = salesOrders
      .filter((order) => isSameDay(order.createdAt, yesterday))
      .reduce((sum, order) => sum + Number(order.total || 0), 0)
    const revenueDelta =
      revenueYesterday > 0 ? ((revenueToday - revenueYesterday) / revenueYesterday) * 100 : null

    const occupiedRoomIds = new Set(
      reservations.filter((reservation) => reservation.status === 'CHECKED_IN' && reservation.roomId).map((r) => r.roomId as string),
    )
    const occupiedRooms = rooms.filter((room) => room.status === 'OCCUPIED' || occupiedRoomIds.has(room.id)).length
    const occupancyRate = rooms.length > 0 ? (occupiedRooms / rooms.length) * 100 : 0
    const availableRooms = rooms.filter((room) => room.status === 'AVAILABLE').length

    const arrivals = reservations.filter(
      (reservation) => isSameDay(reservation.checkInDate, today) && ['PENDING', 'CONFIRMED'].includes(reservation.status),
    )
    const departures = reservations.filter((reservation) => isSameDay(reservation.checkOutDate, today) && reservation.status === 'CHECKED_IN')
    const activeReservations = reservations.filter(
      (reservation) => !['CANCELLED', 'CHECKED_OUT', 'NO_SHOW'].includes(reservation.status),
    )
    const openOrders = orders.filter((order) => !['COMPLETED', 'CANCELLED', 'SERVED'].includes(order.status))
    const pendingPayments = payments.filter((payment) => payment.status === 'PENDING')
    const openFolios = folios.filter((folio) => folio.status !== 'CLOSED')
    const outstandingBalance = openFolios.reduce((sum, folio) => sum + Number(folio.balance || 0), 0)

    return {
      revenueToday,
      revenueDelta,
      occupancyRate,
      occupiedRooms,
      totalRooms: rooms.length,
      availableRooms,
      arrivals,
      departures,
      activeReservations,
      openOrders,
      pendingPayments,
      openFolios: openFolios.length,
      outstandingBalance,
    }
  }, [rooms, reservations, orders, payments, folios, sales])

  const revenueTrend = useMemo(() => {
    const salesOrders = sales?.orders || []
    if (salesOrders.length === 0) return []
    const days: Array<{ key: string; label: string; revenue: number }> = []
    for (let index = 13; index >= 0; index -= 1) {
      const date = new Date()
      date.setHours(0, 0, 0, 0)
      date.setDate(date.getDate() - index)
      const key = date.toISOString().slice(0, 10)
      days.push({
        key,
        label: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        revenue: 0,
      })
    }
    const index = new Map(days.map((day) => [day.key, day]))
    for (const order of salesOrders) {
      const key = new Date(order.createdAt).toISOString().slice(0, 10)
      const bucket = index.get(key)
      if (bucket) bucket.revenue += Number(order.total || 0)
    }
    return days
  }, [sales])

  const paymentMix = useMemo(() => {
    const byPayment = sales?.byPayment || {}
    return Object.entries(byPayment)
      .map(([method, amount]) => ({
        name: PAYMENT_METHOD_LABEL[method] || method.replace(/_/g, ' ').toLowerCase(),
        value: Number(amount || 0),
      }))
      .filter((entry) => entry.value > 0)
      .sort((left, right) => right.value - left.value)
  }, [sales])

  const roomBreakdown = useMemo(
    () =>
      buildBreakdown(countByStatus(rooms, 'status'), ROOM_STATUS, [
        'AVAILABLE',
        'OCCUPIED',
        'CLEANING',
        'DIRTY',
        'INSPECTED',
        'RESERVED',
        'OUT_OF_ORDER',
        'OUT_OF_SERVICE',
      ]),
    [rooms],
  )

  const reservationBreakdown = useMemo(
    () =>
      buildBreakdown(countByStatus(reservations, 'status'), RESERVATION_STATUS, [
        'PENDING',
        'CONFIRMED',
        'CHECKED_IN',
        'CHECKED_OUT',
        'CANCELLED',
        'NO_SHOW',
      ]),
    [reservations],
  )

  const arrivalTone: StatusTone = 'warning'

  return (
    <ModuleShell title="Dashboard" description="Live operational picture across rooms, revenue, and service">
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load the dashboard" message={error} onRetry={() => void load()} /> : null}
        {warnings.length > 0 ? (
          <Alert tone="warning" title="Some data is unavailable">
            <ul className="list-inside list-disc">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        {loading ? (
          <SkeletonStatGrid count={8} />
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Revenue today"
              value={formatCurrency(metrics.revenueToday)}
              icon={TrendingUp}
              tone="success"
              delta={metrics.revenueDelta}
              hint="Latest 100 orders"
              href="/finance"
            />
            <MetricCard
              label="Occupancy"
              value={formatPercent(metrics.occupancyRate)}
              icon={BedDouble}
              tone="info"
              hint={`${metrics.occupiedRooms} of ${metrics.totalRooms} rooms`}
              href="/rooms"
            />
            <MetricCard
              label="Available rooms"
              value={metrics.availableRooms}
              icon={DoorOpen}
              tone="brand"
              hint={`${metrics.totalRooms} rooms in inventory`}
              href="/rooms"
            />
            <MetricCard
              label="Arrivals today"
              value={metrics.arrivals.length}
              icon={CalendarCheck}
              tone="accent"
              hint="Pending and confirmed"
              href="/reservations"
            />
            <MetricCard
              label="Departures today"
              value={metrics.departures.length}
              icon={LogOut}
              tone="neutral"
              hint="Currently checked in"
              href="/reservations"
            />
            <MetricCard
              label="Active reservations"
              value={metrics.activeReservations.length}
              icon={CalendarDays}
              tone="brand"
              hint="Excludes cancelled and checked out"
              href="/reservations"
            />
            <MetricCard
              label="Open orders"
              value={metrics.openOrders.length}
              icon={UtensilsCrossed}
              tone="warning"
              hint="Awaiting service"
              href="/kitchen"
            />
            <MetricCard
              label="Outstanding balance"
              value={formatCurrencyCompact(metrics.outstandingBalance)}
              icon={CreditCard}
              tone={metrics.pendingPayments.length > 0 ? 'danger' : 'neutral'}
              hint={`${metrics.pendingPayments.length} pending payment${metrics.pendingPayments.length === 1 ? '' : 's'}`}
              href="/finance"
            />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard
            title="Revenue trend"
            description="Daily order value, last 14 days"
            className="lg:col-span-2"
            loading={loading}
            empty={!loading && revenueTrend.every((day) => day.revenue === 0)}
            emptyMessage="No orders were recorded in the last 14 days."
            bodyClassName="h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2c858a" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#2c858a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e1e6ea" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6c7a87' }} tickLine={false} axisLine={{ stroke: '#e1e6ea' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#6c7a87' }} tickLine={false} axisLine={false} width={56} tickFormatter={(value: number) => formatCurrencyCompact(value)} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#cdd5dc', strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#1f6b72" strokeWidth={2} fill="url(#revenueFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Sales by payment method"
            description="Share of recorded payments"
            loading={loading}
            empty={!loading && paymentMix.length === 0}
            emptyMessage="No payments have been recorded yet."
            bodyClassName="h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={paymentMix} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={2} stroke="none">
                  {paymentMix.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#52606d' }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <StatusBreakdown
            title="Room status"
            description={`${metrics.totalRooms} rooms in inventory`}
            items={roomBreakdown}
            footer={
              <Link href="/rooms" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                Manage rooms
              </Link>
            }
          />
          <StatusBreakdown
            title="Reservation pipeline"
            description={`${metrics.activeReservations.length} active reservations`}
            items={reservationBreakdown}
            footer={
              <Link href="/reservations" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                Manage reservations
              </Link>
            }
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle description="Guests checking in and out today">Today&apos;s movements</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                Refresh
              </Button>
            </CardHeader>
            {loading ? (
              <CardBody className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="hf-skeleton h-10" />
                ))}
              </CardBody>
            ) : metrics.arrivals.length === 0 && metrics.departures.length === 0 ? (
              <EmptyState
                size="icon"
                title="No arrivals or departures today"
                description="Guest movement for today will appear here as reservations are scheduled."
              />
            ) : (
              <TableWrapper>
                <Table>
                  <THead>
                    <tr>
                      <TH>Guest</TH>
                      <TH>Movement</TH>
                      <TH>Date</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {metrics.arrivals.map((reservation) => (
                      <TR key={`arrival-${reservation.id}`}>
                        <TD className="font-medium text-ink-900">
                          {[reservation.guest?.firstName, reservation.guest?.lastName].filter(Boolean).join(' ') || reservation.confirmationCode}
                        </TD>
                        <TD>
                          <span className="inline-flex items-center gap-1.5 text-ink-600">
                            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_DOT_CLASSES[arrivalTone]}`} />
                            Arrival
                          </span>
                        </TD>
                        <TD className="text-ink-500">{formatDate(reservation.checkInDate)}</TD>
                        <TD>
                          <StatusBadge status={reservation.status} registry={RESERVATION_STATUS} />
                        </TD>
                      </TR>
                    ))}
                    {metrics.departures.map((reservation) => (
                      <TR key={`departure-${reservation.id}`}>
                        <TD className="font-medium text-ink-900">
                          {[reservation.guest?.firstName, reservation.guest?.lastName].filter(Boolean).join(' ') || reservation.confirmationCode}
                        </TD>
                        <TD>
                          <span className="inline-flex items-center gap-1.5 text-ink-600">
                            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_DOT_CLASSES.info}`} />
                            Departure
                          </span>
                        </TD>
                        <TD className="text-ink-500">{formatDate(reservation.checkOutDate)}</TD>
                        <TD>
                          <StatusBadge status={reservation.status} registry={RESERVATION_STATUS} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle description="Newest orders awaiting service">Open orders</CardTitle>
              <Link href="/kitchen" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                Open kitchen
              </Link>
            </CardHeader>
            {loading ? (
              <CardBody className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="hf-skeleton h-10" />
                ))}
              </CardBody>
            ) : metrics.openOrders.length === 0 ? (
              <EmptyState
                size="icon"
                icon={<ReceiptText className="h-5 w-5" />}
                title="No open orders"
                description="Orders placed at the point of sale, restaurant, or bar will appear here."
              />
            ) : (
              <TableWrapper>
                <Table>
                  <THead>
                    <tr>
                      <TH>Order</TH>
                      <TH>Table</TH>
                      <TH>Placed</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Total</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {metrics.openOrders.slice(0, 8).map((order) => (
                      <TR key={order.id}>
                        <TD className="font-medium text-ink-900">{order.orderNumber}</TD>
                        <TD className="text-ink-500">{order.table?.name || 'Walk-in'}</TD>
                        <TD className="text-ink-500">{formatTime(order.createdAt)}</TD>
                        <TD>
                          <StatusBadge status={order.status} registry={ORDER_STATUS} />
                        </TD>
                        <TD className="text-right font-medium tabular-nums">{formatCurrency(order.total || 0)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            )}
          </Card>
        </div>

        {!loading && payments.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle description={`${metrics.pendingPayments.length} awaiting settlement`}>Payment activity</CardTitle>
              <Link href="/finance" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                Open finance
              </Link>
            </CardHeader>
            <TableWrapper>
              <Table>
                <THead>
                  <tr>
                    <TH>Method</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Amount</TH>
                  </tr>
                </THead>
                <TBody>
                  {payments.slice(0, 6).map((payment) => (
                    <TR key={payment.id}>
                      <TD className="font-medium text-ink-900">
                        {PAYMENT_METHOD_LABEL[String(payment.paymentMethod || '').toUpperCase()] || payment.paymentMethod || 'Unknown'}
                      </TD>
                      <TD>
                        <StatusBadge status={payment.status} registry={PAYMENT_STATUS} />
                      </TD>
                      <TD className="text-right font-medium tabular-nums">{formatCurrency(payment.amount)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </Card>
        ) : null}
      </div>
    </ModuleShell>
  )
}
