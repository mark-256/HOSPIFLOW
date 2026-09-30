'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CreditCard, FileText, Percent, Plus, Receipt, Wallet } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import MetricCard from '@/components/dashboard/MetricCard'
import Button from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Card, CardHeader, CardTitle, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Skeleton, SkeletonStatGrid, SkeletonTable } from '@/components/ui/Skeleton'
import { Pagination } from '@/components/ui/Pagination'
import { Dialog } from '@/components/ui/Modal'
import { Field, FormGrid, Input, Select } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { FOLIO_STATUS, PAYMENT_METHOD_LABEL, PAYMENT_STATUS } from '@/lib/status'
import { formatCurrency, formatDateTime, formatPercent, fullName } from '@/lib/format'

type Folio = {
  id: string
  folioNumber: string
  status: string
  balance: number | string
  guest?: { firstName?: string; lastName?: string } | null
  reservation?: { confirmationCode?: string } | null
}

type Payment = {
  id: string
  reference?: string
  paymentMethod?: string
  status?: string
  amount: number | string
  createdAt?: string
  order?: { orderNumber?: string } | null
}

type SalesReport = { totalSales?: number; totalOrders?: number; avgOrderValue?: number; byPayment?: Record<string, number> }
type Occupancy = { total?: number; occupied?: number; occupancyRate?: number }

const EMPTY_TRANSACTION = { folioId: '', type: 'CHARGE', category: 'SERVICE', description: '', amount: '' }

export default function FinancePage() {
  const toast = useToast()
  const [sales, setSales] = useState<SalesReport | null>(null)
  const [occupancy, setOccupancy] = useState<Occupancy | null>(null)
  const [folios, setFolios] = useState<Folio[]>([])
  const [folioMeta, setFolioMeta] = useState<{ total?: number; totalPages?: number }>({})
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentMeta, setPaymentMeta] = useState<{ total?: number; pages?: number }>({})
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([])
  const [propertyId, setPropertyId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [folioPage, setFolioPage] = useState(1)
  const [paymentPage, setPaymentPage] = useState(1)
  const [limit] = useState(25)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'folios' | 'payments'>('folios')
  const [showTransaction, setShowTransaction] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [transaction, setTransaction] = useState(EMPTY_TRANSACTION)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const range = new URLSearchParams()
      if (from) range.set('from', from)
      if (to) range.set('to', to)
      const salesQuery = range.toString()
      const occupancyQuery = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ''

      const [salesResponse, occupancyResponse, folioResponse, paymentResponse, propertyResponse] = await Promise.all([
        apiRequest<SalesReport>(`/api/reports/sales?limit=100${salesQuery ? `&${salesQuery}` : ''}`),
        propertyId
          ? apiRequest<Occupancy>(`/api/reports/occupancy${occupancyQuery}`)
          : Promise.resolve({ success: true, data: null, meta: {} }),
        apiRequest<Folio[]>(`/api/folios?limit=${limit}&page=${folioPage}`),
        apiRequest<Payment[]>(`/api/payments?limit=${limit}&page=${paymentPage}`),
        apiRequest<Array<{ id: string; name: string }>>('/api/properties'),
      ])

      setSales(salesResponse.data)
      setOccupancy(occupancyResponse.data)
      setFolios(responseData(folioResponse))
      setFolioMeta({ total: folioResponse.meta?.total as number | undefined, totalPages: folioResponse.meta?.totalPages as number | undefined })
      setPayments(responseData(paymentResponse))
      setPaymentMeta({ total: paymentResponse.meta?.total as number | undefined, pages: paymentResponse.meta?.pages as number | undefined })
      const nextProperties = responseData(propertyResponse)
      setProperties(nextProperties)
      setPropertyId((current) => current || nextProperties[0]?.id || '')
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load finance data'))
    } finally {
      setLoading(false)
    }
  }, [from, to, propertyId, folioPage, paymentPage, limit])

  useEffect(() => {
    void load()
  }, [load])

  const submitTransaction = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await apiRequest(`/api/folios/${transaction.folioId}/transactions`, {
        method: 'POST',
        body: JSON.stringify(transaction),
      })
      setTransaction(EMPTY_TRANSACTION)
      setShowTransaction(false)
      toast.success('Folio transaction saved', 'The guest folio balance has been updated.')
      await load()
    } catch (reason) {
      setFormError(getErrorMessage(reason, 'Unable to save folio transaction'))
    } finally {
      setSaving(false)
    }
  }

  const totals = useMemo(() => {
    const openFolios = folios.filter((folio) => folio.status !== 'CLOSED')
    const outstanding = openFolios.reduce((sum, folio) => sum + Number(folio.balance || 0), 0)
    const collected = payments
      .filter((payment) => payment.status === 'COMPLETED')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    const pending = payments.filter((payment) => payment.status === 'PENDING')
    return { openFolios: openFolios.length, outstanding, collected, pendingCount: pending.length }
  }, [folios, payments])

  return (
    <ModuleShell
      title="Finance"
      description="Folios, payments, revenue, and outstanding balances"
      actions={
        <Button size="sm" onClick={() => setShowTransaction(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
          <span className="hidden sm:inline">Folio transaction</span>
          <span className="sm:hidden">Charge</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorState title="Unable to load finance data" message={error} onRetry={() => void load()} /> : null}

        <Card>
          <CardHeader>
            <CardTitle description="Report filters applied to sales and occupancy">Filters</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </CardHeader>
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-3 sm:px-5">
            <Field label="Property" htmlFor="financeProperty" hint="Used for the occupancy report.">
              <Select id="financeProperty" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="From" htmlFor="financeFrom">
              <Input id="financeFrom" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="To" htmlFor="financeTo">
              <Input id="financeTo" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
          </div>
        </Card>

        {loading ? (
          <SkeletonStatGrid count={8} />
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Total sales" value={formatCurrency(sales?.totalSales || 0)} icon={Wallet} tone="success" hint="Latest 100 orders in range" />
            <MetricCard label="Orders" value={sales?.totalOrders || 0} icon={Receipt} tone="brand" hint="Orders in range" />
            <MetricCard label="Average order value" value={formatCurrency(sales?.avgOrderValue || 0)} icon={Percent} tone="info" />
            <MetricCard
              label="Occupancy"
              value={occupancy ? formatPercent(occupancy.occupancyRate) : '--'}
              icon={Percent}
              tone="accent"
              unavailable={!occupancy}
              hint={occupancy ? `${occupancy.occupied || 0} of ${occupancy.total || 0} rooms` : 'Select a property'}
            />
            <MetricCard label="Open folios" value={totals.openFolios} icon={FileText} tone="brand" />
            <MetricCard
              label="Outstanding balance"
              value={formatCurrency(totals.outstanding)}
              icon={Wallet}
              tone={totals.outstanding > 0 ? 'warning' : 'neutral'}
              hint="On this page of folios"
            />
            <MetricCard label="Payments collected" value={formatCurrency(totals.collected)} icon={CreditCard} tone="success" hint="Completed on this page" />
            <MetricCard
              label="Pending payments"
              value={totals.pendingCount}
              icon={CreditCard}
              tone={totals.pendingCount > 0 ? 'danger' : 'neutral'}
              hint="Awaiting confirmation"
            />
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="px-2 sm:px-3">
            <Tabs
              ariaLabel="Finance records"
              items={[
                { id: 'folios', label: 'Folios', count: folioMeta.total },
                { id: 'payments', label: 'Payments', count: paymentMeta.total },
              ]}
              value={tab}
              onChange={(value) => setTab(value as 'folios' | 'payments')}
            />
          </div>

          {loading ? (
            <div className="px-4 py-4 sm:px-5">
              <SkeletonTable rows={5} columns={5} className="border-0 shadow-none" />
            </div>
          ) : tab === 'folios' ? (
            folios.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="No folios yet"
                description="Folios are created for confirmed reservations and track charges against a guest stay."
              />
            ) : (
              <>
                <TableWrapper>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Folio</TH>
                        <TH>Guest</TH>
                        <TH>Reservation</TH>
                        <TH className="text-right">Balance</TH>
                        <TH>Status</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {folios.map((folio) => (
                        <TR key={folio.id}>
                          <TD className="font-mono text-xs font-medium text-ink-900">{folio.folioNumber}</TD>
                          <TD>{fullName(folio.guest)}</TD>
                          <TD className="text-ink-500">{folio.reservation?.confirmationCode || 'Not linked'}</TD>
                          <TD className="text-right font-medium tabular-nums">{formatCurrency(folio.balance || 0)}</TD>
                          <TD>
                            <StatusBadge status={folio.status} registry={FOLIO_STATUS} />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrapper>
                <Pagination
                  page={folioPage}
                  limit={limit}
                  total={folioMeta.total}
                  totalPages={folioMeta.totalPages}
                  onPageChange={setFolioPage}
                  itemLabel="folios"
                />
              </>
            )
          ) : payments.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="h-5 w-5" />}
              title="No payments recorded"
              description="Payments captured at the point of sale and folio settlements appear here."
            />
          ) : (
            <>
              <TableWrapper>
                <Table>
                  <THead>
                    <tr>
                      <TH>Reference</TH>
                      <TH>Order</TH>
                      <TH>Method</TH>
                      <TH>Recorded</TH>
                      <TH className="text-right">Amount</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {payments.map((payment) => (
                      <TR key={payment.id}>
                        <TD className="font-mono text-xs text-ink-700">{payment.reference || payment.id}</TD>
                        <TD className="text-ink-500">{payment.order?.orderNumber || 'Not linked'}</TD>
                        <TD className="text-ink-500">
                          {PAYMENT_METHOD_LABEL[String(payment.paymentMethod || '').toUpperCase()] || payment.paymentMethod || 'Unknown'}
                        </TD>
                        <TD className="text-ink-500">{formatDateTime(payment.createdAt)}</TD>
                        <TD className="text-right font-medium tabular-nums">{formatCurrency(payment.amount)}</TD>
                        <TD>
                          <StatusBadge status={payment.status} registry={PAYMENT_STATUS} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
              <Pagination
                page={paymentPage}
                limit={limit}
                total={paymentMeta.total}
                totalPages={paymentMeta.pages}
                onPageChange={setPaymentPage}
                itemLabel="payments"
              />
            </>
          )}
        </Card>
      </div>

      <Dialog
        open={showTransaction}
        onClose={() => setShowTransaction(false)}
        title="Add folio transaction"
        description="Record a charge, payment, discount, or refund against a guest folio."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowTransaction(false)}>
              Cancel
            </Button>
            <Button type="submit" form="folio-transaction-form" loading={saving} loadingLabel="Saving">
              Save transaction
            </Button>
          </>
        }
      >
        <form id="folio-transaction-form" onSubmit={submitTransaction} className="space-y-4" noValidate>
          {formError ? <ErrorState compact title="Unable to save transaction" message={formError} /> : null}
          <FormGrid>
            <Field label="Folio" htmlFor="folioId" required className="sm:col-span-2">
              <Select
                id="folioId"
                required
                value={transaction.folioId}
                onChange={(event) => setTransaction({ ...transaction, folioId: event.target.value })}
              >
                <option value="">Select open folio</option>
                {folios
                  .filter((folio) => folio.status !== 'CLOSED')
                  .map((folio) => (
                    <option key={folio.id} value={folio.id}>
                      {folio.folioNumber} - {fullName(folio.guest)}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Type" htmlFor="transactionType" required>
              <Select
                id="transactionType"
                required
                value={transaction.type}
                onChange={(event) => setTransaction({ ...transaction, type: event.target.value })}
              >
                <option value="CHARGE">Charge</option>
                <option value="PAYMENT">Payment</option>
                <option value="DISCOUNT">Discount</option>
                <option value="REFUND">Refund</option>
              </Select>
            </Field>
            <Field label="Category" htmlFor="transactionCategory" required>
              <Select
                id="transactionCategory"
                required
                value={transaction.category}
                onChange={(event) => setTransaction({ ...transaction, category: event.target.value })}
              >
                <option value="SERVICE">Service</option>
                <option value="ROOM">Room</option>
                <option value="FOOD_AND_BEVERAGE">Food and beverage</option>
                <option value="LAUNDRY">Laundry</option>
                <option value="OTHER">Other</option>
              </Select>
            </Field>
            <Field label="Amount" htmlFor="transactionAmount" required>
              <Input
                id="transactionAmount"
                type="number"
                min={0}
                step="0.01"
                required
                value={transaction.amount}
                onChange={(event) => setTransaction({ ...transaction, amount: event.target.value })}
              />
            </Field>
            <Field label="Description" htmlFor="transactionDescription" required className="sm:col-span-2 lg:col-span-3">
              <Input
                id="transactionDescription"
                required
                value={transaction.description}
                onChange={(event) => setTransaction({ ...transaction, description: event.target.value })}
              />
            </Field>
          </FormGrid>
          {loading ? <Skeleton className="h-3 w-40" /> : null}
        </form>
      </Dialog>
    </ModuleShell>
  )
}
