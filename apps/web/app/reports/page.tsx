'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, Percent, Receipt, Wallet } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import MetricCard from '@/components/dashboard/MetricCard'
import { ChartCard } from '@/components/dashboard/ChartCard'
import Button from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { SkeletonStatGrid } from '@/components/ui/Skeleton'
import { Field, Input, Select } from '@/components/ui/Input'
import { apiRequest, getErrorMessage } from '@/lib/api'
import { ORDER_STATUS, PAYMENT_METHOD_LABEL } from '@/lib/status'
import { formatCurrency, formatCurrencyCompact, formatDate, formatPercent, formatTime } from '@/lib/format'

type SalesOrder = {
  id: string
  orderNumber?: string
  status?: string
  total: number | string
  createdAt: string
  paymentMethod?: string
}
type SalesReport = {
  totalSales?: number
  totalOrders?: number
  avgOrderValue?: number
  byPayment?: Record<string, number>
  orders?: SalesOrder[]
}
type Occupancy = { total?: number; occupied?: number; occupancyRate?: number }

const CHART_COLORS = ['#1f6b72', '#2c858a', '#49a1a5', '#7fc0c2', '#c3801f', '#3167bb']

export default function ReportsPage() {
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([])
  const [propertyId, setPropertyId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sales, setSales] = useState<SalesReport | null>(null)
  const [occupancy, setOccupancy] = useState<Occupancy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryAfter, setRetryAfter] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setRetryAfter(0)
    try {
      const range = new URLSearchParams()
      if (from) range.set('from', from)
      if (to) range.set('to', to)
      const salesQuery = range.toString()

      const [propertyResponse, salesResponse, occupancyResponse] = await Promise.all([
        apiRequest<Array<{ id: string; name: string }>>('/api/properties'),
        apiRequest<SalesReport>(`/api/reports/sales?limit=100${salesQuery ? `&${salesQuery}` : ''}`),
        propertyId
          ? apiRequest<Occupancy>(`/api/reports/occupancy?propertyId=${encodeURIComponent(propertyId)}`)
          : Promise.resolve({ success: true, data: null, meta: {} }),
      ])
      const nextProperties = propertyResponse.data || []
      setProperties(nextProperties)
      setPropertyId((current) => current || nextProperties[0]?.id || '')
      setSales(salesResponse.data)
      setOccupancy(occupancyResponse.data)
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load reports'))
      if (reason instanceof Error && 'status' in reason && (reason as { status?: number }).status === 429) {
        const seconds = (reason as { retryAfter?: number }).retryAfter
        if (seconds) setRetryAfter(seconds)
      }
    } finally {
      setLoading(false)
    }
  }, [from, to, propertyId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (retryAfter <= 0) return
    const timer = window.setInterval(() => setRetryAfter((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [retryAfter])

  const trend = useMemo(() => {
    const orders = sales?.orders || []
    if (orders.length === 0) return []
    const buckets = new Map<string, { label: string; revenue: number; orders: number }>()
    for (const order of orders) {
      const date = new Date(order.createdAt)
      if (Number.isNaN(date.getTime())) continue
      const key = date.toISOString().slice(0, 10)
      const existing = buckets.get(key)
      if (existing) {
        existing.revenue += Number(order.total || 0)
        existing.orders += 1
      } else {
        buckets.set(key, {
          label: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          revenue: Number(order.total || 0),
          orders: 1,
        })
      }
    }
    return Array.from(buckets.entries())
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([, value]) => value)
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

  const recentOrders = useMemo(() => (sales?.orders || []).slice(0, 10), [sales])

  return (
    <ModuleShell
      title="Reports"
      description="Sales, order volume, payment mix, and occupancy performance"
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? (
          <ErrorState
            title="Unable to load reports"
            message={retryAfter > 0 ? `${error} Retry available in ${retryAfter}s.` : error}
            onRetry={() => void load()}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle description="Narrow the report window">Filters</CardTitle>
          </CardHeader>
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-3 sm:px-5">
            <Field label="Property" htmlFor="reportProperty" hint="Used for the occupancy report.">
              <Select id="reportProperty" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="From" htmlFor="reportFrom">
              <Input id="reportFrom" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="To" htmlFor="reportTo">
              <Input id="reportTo" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
          </div>
        </Card>

        {loading ? (
          <SkeletonStatGrid count={4} />
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total sales" value={formatCurrency(sales?.totalSales || 0)} icon={Wallet} tone="success" hint="Latest 100 orders in range" />
            <MetricCard label="Total orders" value={sales?.totalOrders || 0} icon={Receipt} tone="brand" hint="Orders in range" />
            <MetricCard label="Average order value" value={formatCurrency(sales?.avgOrderValue || 0)} icon={Percent} tone="info" />
            <MetricCard
              label="Occupancy rate"
              value={occupancy ? formatPercent(occupancy.occupancyRate, 1) : '--'}
              icon={BarChart3}
              tone="accent"
              unavailable={!occupancy}
              hint={occupancy ? `${occupancy.occupied || 0} of ${occupancy.total || 0} rooms` : 'Select a property'}
            />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Sales trend"
            description="Order value by day in the selected range"
            loading={loading}
            empty={!loading && trend.length === 0}
            emptyMessage="No orders fall inside the selected date range."
            bodyClassName="h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="reportSalesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2c858a" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#2c858a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e1e6ea" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6c7a87' }} tickLine={false} axisLine={{ stroke: '#e1e6ea' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#6c7a87' }} tickLine={false} axisLine={false} width={56} tickFormatter={(value: number) => formatCurrencyCompact(value)} />
                <Tooltip
                  formatter={(value: number, name: string) => [name === 'revenue' ? formatCurrency(value) : value, name === 'revenue' ? 'Revenue' : 'Orders']}
                  labelStyle={{ color: '#52606d', fontSize: 12 }}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e1e6ea', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#1f6b72" strokeWidth={2} fill="url(#reportSalesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Payment mix"
            description="Captured value by payment method"
            loading={loading}
            empty={!loading && paymentMix.length === 0}
            emptyMessage="No payments were captured in the selected range."
            bodyClassName="h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentMix} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e1e6ea" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6c7a87' }} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatCurrencyCompact(value)} />
                <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11, fill: '#52606d' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} cursor={{ fill: '#f1f4f6' }} contentStyle={{ borderRadius: 8, border: '1px solid #e1e6ea', fontSize: 12 }} />
                <Bar dataKey="value" name="Captured" radius={[0, 4, 4, 0]} barSize={18}>
                  {paymentMix.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
                <Legend verticalAlign="top" height={0} iconType="circle" iconSize={8} wrapperStyle={{ display: 'none' }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {occupancy && !loading ? (
          <Card>
            <CardHeader>
              <CardTitle description="Share of rooms occupied on the report date">Occupancy</CardTitle>
            </CardHeader>
            <div className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-ink-600">
                  {occupancy.occupied || 0} of {occupancy.total || 0} rooms occupied
                </p>
                <p className="text-sm font-semibold tabular-nums text-ink-900">{formatPercent(occupancy.occupancyRate, 1)}</p>
              </div>
              <div
                className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ink-100"
                role="progressbar"
                aria-valuenow={Math.round(Number(occupancy.occupancyRate || 0))}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Occupancy rate"
              >
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Number(occupancy.occupancyRate || 0))}%` }} />
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle description="Newest orders inside the selected range">Recent orders</CardTitle>
          </CardHeader>
          {loading ? (
            <div className="px-4 py-6 sm:px-5">
              <p className="hf-caption">Loading orders...</p>
            </div>
          ) : recentOrders.length === 0 ? (
            <EmptyState
              size="icon"
              icon={<Receipt className="h-5 w-5" />}
              title="No orders to report"
              description="Orders recorded in the selected date range will be listed here."
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <tr>
                    <TH>Order</TH>
                    <TH>Date</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Total</TH>
                  </tr>
                </THead>
                <TBody>
                  {recentOrders.map((order) => (
                    <TR key={order.id}>
                      <TD className="font-medium text-ink-900">{order.orderNumber || order.id}</TD>
                      <TD className="text-ink-500">
                        {formatDate(order.createdAt)} <span className="text-ink-400">{formatTime(order.createdAt)}</span>
                      </TD>
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
    </ModuleShell>
  )
}
