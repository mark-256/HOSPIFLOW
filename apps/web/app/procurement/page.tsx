'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Trash2, Truck, Users } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import MetricCard from '@/components/dashboard/MetricCard'
import Button from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Card, CardBody, CardHeader, CardTitle, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { SkeletonStatGrid, SkeletonTable } from '@/components/ui/Skeleton'
import { Dialog } from '@/components/ui/Modal'
import { Field, FormGrid, Input, Select, Textarea } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { PURCHASE_ORDER_STATUS } from '@/lib/status'
import { formatCurrency, formatDate } from '@/lib/format'

type Supplier = { id: string; name: string; code: string; contactPerson?: string; email?: string; phone?: string; isActive?: boolean }
type InventoryItem = { id: string; name: string; sku: string; unit: string; unitCost: number | string }
type PurchaseOrder = {
  id: string
  orderNumber: string
  status: string
  total: number | string
  expectedDate?: string
  supplier?: { name: string } | null
}

const SUPPLIER_FIELDS: Array<[keyof typeof EMPTY_SUPPLIER, string, boolean]> = [
  ['name', 'Supplier name', true],
  ['code', 'Code', true],
  ['contactPerson', 'Contact person', false],
  ['email', 'Email', false],
  ['phone', 'Phone', false],
  ['paymentTerms', 'Payment terms', false],
]

const EMPTY_SUPPLIER = { name: '', code: '', contactPerson: '', email: '', phone: '', paymentTerms: '', notes: '' }
const EMPTY_ORDER = { supplierId: '', expectedDate: '', notes: '', items: [{ inventoryItemId: '', quantity: 1, unitCost: '' }] }

export default function ProcurementPage() {
  const toast = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'orders' | 'suppliers'>('orders')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [rowBusy, setRowBusy] = useState('')
  const [supplierForm, setSupplierForm] = useState(EMPTY_SUPPLIER)
  const [orderForm, setOrderForm] = useState(EMPTY_ORDER)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [supplierResponse, itemResponse, orderResponse] = await Promise.all([
        apiRequest<Supplier[]>('/api/suppliers'),
        apiRequest<InventoryItem[]>('/api/inventory?limit=100'),
        apiRequest<PurchaseOrder[]>('/api/purchase-orders?limit=100'),
      ])
      setSuppliers(responseData(supplierResponse))
      setItems(responseData(itemResponse))
      setOrders(responseData(orderResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load procurement data'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submitSupplier = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await apiRequest('/api/suppliers', { method: 'POST', body: JSON.stringify(supplierForm) })
      setSupplierForm(EMPTY_SUPPLIER)
      setSupplierOpen(false)
      toast.success('Supplier saved', `${supplierForm.name} is now available for purchase orders.`)
      await load()
    } catch (reason) {
      setFormError(getErrorMessage(reason, 'Unable to save supplier'))
    } finally {
      setSaving(false)
    }
  }

  const updateOrderItem = (index: number, field: string, value: string | number) => {
    setOrderForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    }))
  }

  const submitOrder = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await apiRequest('/api/purchase-orders', { method: 'POST', body: JSON.stringify(orderForm) })
      setOrderForm(EMPTY_ORDER)
      setOrderOpen(false)
      toast.success('Purchase order created', 'The order was saved as a draft.')
      await load()
    } catch (reason) {
      setFormError(getErrorMessage(reason, 'Unable to create purchase order'))
    } finally {
      setSaving(false)
    }
  }

  const updateOrderStatus = async (order: PurchaseOrder, status: string) => {
    setRowBusy(order.id)
    setError('')
    try {
      await apiRequest(`/api/purchase-orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      toast.success('Purchase order updated', `${order.orderNumber} is now ${PURCHASE_ORDER_STATUS[status as keyof typeof PURCHASE_ORDER_STATUS]?.label.toLowerCase() || status}.`)
      await load()
    } catch (reason) {
      const message = getErrorMessage(reason, 'Unable to update purchase order')
      setError(message)
      toast.error('Update failed', message)
    } finally {
      setRowBusy('')
    }
  }

  const nextActions: Record<string, { label: string; status: string }> = {
    DRAFT: { label: 'Submit', status: 'SUBMITTED' },
    SUBMITTED: { label: 'Approve', status: 'APPROVED' },
    APPROVED: { label: 'Order', status: 'ORDERED' },
    ORDERED: { label: 'Receive', status: 'RECEIVED' },
    RECEIVED: { label: 'Close', status: 'CLOSED' },
  }

  const totals = useMemo(() => {
    const committed = orders
      .filter((order) => !['DRAFT', 'CANCELLED', 'CLOSED'].includes(order.status))
      .reduce((sum, order) => sum + Number(order.total || 0), 0)
    const awaiting = orders.filter((order) => ['SUBMITTED', 'APPROVED'].includes(order.status)).length
    return { committed, awaiting }
  }, [orders])

  return (
    <ModuleShell
      title="Procurement"
      description="Suppliers, purchase orders, and receiving workflow"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            leadingIcon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}
          >
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setOrderOpen(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
            <span className="hidden sm:inline">Purchase order</span>
            <span className="sm:hidden">New PO</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorState title="Procurement data" message={error} onRetry={() => void load()} compact /> : null}

        {loading ? (
          <SkeletonStatGrid count={4} />
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Suppliers" value={suppliers.length} icon={Users} tone="brand" />
            <MetricCard label="Purchase orders" value={orders.length} icon={Truck} tone="info" />
            <MetricCard label="Awaiting approval" value={totals.awaiting} icon={Truck} tone={totals.awaiting > 0 ? 'warning' : 'neutral'} />
            <MetricCard label="Committed value" value={formatCurrency(totals.committed)} icon={Truck} tone="accent" hint="Open purchase orders" />
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="px-2 sm:px-3">
            <Tabs
              ariaLabel="Procurement records"
              items={[
                { id: 'orders', label: 'Purchase orders', count: orders.length },
                { id: 'suppliers', label: 'Suppliers', count: suppliers.length },
              ]}
              value={tab}
              onChange={(value) => setTab(value as 'orders' | 'suppliers')}
            />
          </div>

          {loading ? (
            <div className="px-4 py-4 sm:px-5">
              <SkeletonTable rows={5} columns={5} className="border-0 shadow-none" />
            </div>
          ) : tab === 'orders' ? (
            orders.length === 0 ? (
              <EmptyState
                icon={<Truck className="h-5 w-5" />}
                title="No purchase orders"
                description="Create a purchase order to request stock from a supplier."
                action={
                  <Button size="sm" onClick={() => setOrderOpen(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                    Create purchase order
                  </Button>
                }
              />
            ) : (
              <TableWrapper>
                <Table>
                  <THead>
                    <tr>
                      <TH>Order</TH>
                      <TH>Supplier</TH>
                      <TH>Expected</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Total</TH>
                      <TH className="text-right">Action</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {orders.map((order) => {
                      const action = nextActions[order.status]
                      return (
                        <TR key={order.id}>
                          <TD className="font-medium text-ink-900">{order.orderNumber}</TD>
                          <TD className="text-ink-500">{order.supplier?.name || 'Not assigned'}</TD>
                          <TD className="text-ink-500">{order.expectedDate ? formatDate(order.expectedDate) : 'Not set'}</TD>
                          <TD>
                            <StatusBadge status={order.status} registry={PURCHASE_ORDER_STATUS} />
                          </TD>
                          <TD className="text-right font-medium tabular-nums">{formatCurrency(order.total || 0)}</TD>
                          <TD className="text-right">
                            {action ? (
                              <Button size="sm" variant="outline" loading={rowBusy === order.id} onClick={() => void updateOrderStatus(order, action.status)}>
                                {action.label}
                              </Button>
                            ) : (
                              <span className="text-xs text-ink-400">No action</span>
                            )}
                          </TD>
                        </TR>
                      )
                    })}
                  </TBody>
                </Table>
              </TableWrapper>
            )
          ) : (
            <CardHeader>
              <CardTitle description="Approved vendors for this organization">Supplier directory</CardTitle>
              <Button size="sm" onClick={() => setSupplierOpen(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                Add supplier
              </Button>
            </CardHeader>
          )}

          {tab === 'suppliers' && !loading ? (
            suppliers.length === 0 ? (
              <EmptyState
                icon={<Users className="h-5 w-5" />}
                title="No suppliers yet"
                description="Add the vendors you purchase stock and supplies from."
                action={
                  <Button size="sm" onClick={() => setSupplierOpen(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                    Add supplier
                  </Button>
                }
              />
            ) : (
              <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suppliers.map((supplier) => (
                  <div key={supplier.id} className="rounded-lg border border-line p-4">
                    <p className="truncate text-sm font-semibold text-ink-900">{supplier.name}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-ink-500">{supplier.code}</p>
                    <p className="mt-2 truncate text-xs text-ink-500">{supplier.contactPerson || 'No contact person'}</p>
                    <p className="truncate text-xs text-ink-500">{supplier.phone || supplier.email || 'No contact details'}</p>
                  </div>
                ))}
              </CardBody>
            )
          ) : null}
        </Card>
      </div>

      <Dialog
        open={supplierOpen}
        onClose={() => setSupplierOpen(false)}
        title="Add supplier"
        description="Record the vendor details used on purchase orders."
        footer={
          <>
            <Button variant="outline" onClick={() => setSupplierOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="supplier-form" loading={saving} loadingLabel="Saving">
              Save supplier
            </Button>
          </>
        }
      >
        <form id="supplier-form" onSubmit={submitSupplier} className="space-y-4" noValidate>
          {formError ? <ErrorState compact title="Unable to save supplier" message={formError} /> : null}
          <FormGrid>
            {SUPPLIER_FIELDS.map(([field, label, required]) => (
              <Field key={field} label={label} htmlFor={`supplier-${field}`} required={required}>
                <Input
                  id={`supplier-${field}`}
                  required={required}
                  value={supplierForm[field]}
                  onChange={(event) => setSupplierForm({ ...supplierForm, [field]: event.target.value })}
                />
              </Field>
            ))}
          </FormGrid>
          <Field label="Notes" htmlFor="supplierNotes">
            <Textarea
              id="supplierNotes"
              value={supplierForm.notes}
              onChange={(event) => setSupplierForm({ ...supplierForm, notes: event.target.value })}
            />
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        title="New purchase order"
        description="Select the supplier and the items to request."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOrderOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="purchase-order-form" loading={saving} loadingLabel="Creating">
              Create order
            </Button>
          </>
        }
      >
        <form id="purchase-order-form" onSubmit={submitOrder} className="space-y-4" noValidate>
          {formError ? <ErrorState compact title="Unable to create purchase order" message={formError} /> : null}
          <FormGrid>
            <Field label="Supplier" htmlFor="orderSupplier" required>
              <Select
                id="orderSupplier"
                required
                value={orderForm.supplierId}
                onChange={(event) => setOrderForm({ ...orderForm, supplierId: event.target.value })}
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expected date" htmlFor="orderExpectedDate">
              <Input
                id="orderExpectedDate"
                type="date"
                value={orderForm.expectedDate}
                onChange={(event) => setOrderForm({ ...orderForm, expectedDate: event.target.value })}
              />
            </Field>
            <Field label="Notes" htmlFor="orderNotes" className="sm:col-span-2 lg:col-span-3">
              <Input id="orderNotes" value={orderForm.notes} onChange={(event) => setOrderForm({ ...orderForm, notes: event.target.value })} />
            </Field>
          </FormGrid>

          <div className="overflow-hidden rounded-lg border border-line">
            <div className="grid grid-cols-12 gap-2 bg-surface-sunken px-3 py-2">
              <span className="col-span-5 hf-overline">Item</span>
              <span className="col-span-2 hf-overline">Quantity</span>
              <span className="col-span-3 hf-overline">Unit cost</span>
              <span className="col-span-2 hf-overline text-right">Remove</span>
            </div>
            <div className="divide-y divide-line">
              {orderForm.items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 items-center gap-2 px-3 py-2.5">
                  <Select
                    className="col-span-5"
                    aria-label={`Item ${index + 1}`}
                    value={item.inventoryItemId}
                    onChange={(event) => updateOrderItem(index, 'inventoryItemId', event.target.value)}
                  >
                    <option value="">Select item</option>
                    {items.map((inventoryItem) => (
                      <option key={inventoryItem.id} value={inventoryItem.id}>
                        {inventoryItem.name} · {inventoryItem.sku}
                      </option>
                    ))}
                  </Select>
                  <Input
                    className="col-span-2"
                    type="number"
                    min={1}
                    aria-label={`Quantity for item ${index + 1}`}
                    value={item.quantity}
                    onChange={(event) => updateOrderItem(index, 'quantity', Number(event.target.value))}
                  />
                  <Input
                    className="col-span-3"
                    type="number"
                    min={0}
                    step="0.01"
                    aria-label={`Unit cost for item ${index + 1}`}
                    value={item.unitCost}
                    onChange={(event) => updateOrderItem(index, 'unitCost', event.target.value)}
                  />
                  <Button
                    className="col-span-2"
                    variant="ghost"
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() =>
                      setOrderForm((current) => ({
                        ...current,
                        items: current.items.filter((_, itemIndex) => itemIndex !== index),
                      }))
                    }
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4 text-danger-600" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="border-t border-line px-3 py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setOrderForm((current) => ({
                    ...current,
                    items: [...current.items, { inventoryItemId: '', quantity: 1, unitCost: '' }],
                  }))
                }
                leadingIcon={<Plus aria-hidden="true" className="h-3.5 w-3.5" />}
              >
                Add line
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </ModuleShell>
  )
}
