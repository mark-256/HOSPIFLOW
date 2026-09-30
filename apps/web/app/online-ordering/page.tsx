'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Search, ShoppingBag, Trash2, Truck } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import MetricCard from '@/components/dashboard/MetricCard'
import { StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState, NoResultsState } from '@/components/ui/States'
import { SkeletonStatGrid, SkeletonTable } from '@/components/ui/Skeleton'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { ONLINE_ORDER_STATUS } from '@/lib/status'
import { formatCurrency, formatDateTime } from '@/lib/format'

type Product = { id: string; name: string; price: number | string; code: string }
type Menu = { id: string; outletId: string; name?: string; categories?: { id: string; name: string; products?: Product[] }[] }
type OnlineOrder = {
  id: string
  orderNumber: string
  status: string
  total: number | string
  customerName?: string
  customerPhone?: string
  deliveryAddress?: string
  roomNumber?: string
  createdAt?: string
}
type CartLine = { product: Product; quantity: number }

export default function OnlineOrderingPage() {
  const toast = useToast()
  const [orders, setOrders] = useState<OnlineOrder[]>([])
  const [outlets, setOutlets] = useState<Array<{ id: string; name: string; type?: string }>>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [outletId, setOutletId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [cart, setCart] = useState<CartLine[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [orderResponse, outletResponse, menuResponse] = await Promise.all([
        apiRequest<OnlineOrder[]>('/api/online-orders?limit=100'),
        apiRequest<Array<{ id: string; name: string; type?: string }>>('/api/outlets'),
        apiRequest<Menu[]>('/api/menus'),
      ])
      const loadedOutlets = responseData(outletResponse)
      setOrders(responseData(orderResponse))
      setOutlets(loadedOutlets)
      setMenus(responseData(menuResponse))
      setOutletId((current) => current || loadedOutlets[0]?.id || '')
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load online orders'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const products = useMemo(() => {
    const term = query.trim().toLowerCase()
    return menus
      .filter((menu) => menu.outletId === outletId)
      .flatMap((menu) => menu.categories || [])
      .flatMap((category) => category.products || [])
      .filter((product) => !term || product.name.toLowerCase().includes(term))
  }, [menus, outletId, query])

  const addProduct = (product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id)
      return existing
        ? current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line))
        : [...current, { product, quantity: 1 }]
    })
  }

  const changeQuantity = (productId: string, quantity: number) => {
    setCart((current) =>
      quantity <= 0
        ? current.filter((line) => line.product.id !== productId)
        : current.map((line) => (line.product.id === productId ? { ...line, quantity } : line)),
    )
  }

  const total = cart.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0)
  const covers = cart.reduce((sum, line) => sum + line.quantity, 0)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await apiRequest('/api/online-orders', {
        method: 'POST',
        body: JSON.stringify({
          outletId,
          customerName,
          customerPhone,
          deliveryAddress,
          items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        }),
      })
      setCustomerName('')
      setCustomerPhone('')
      setDeliveryAddress('')
      setCart([])
      setShowForm(false)
      toast.success('Online order placed', 'The order was submitted to the outlet queue.')
      await load()
    } catch (reason) {
      setFormError(getErrorMessage(reason, 'Unable to place online order'))
    } finally {
      setSaving(false)
    }
  }

  const visibleOrders = useMemo(
    () => (statusFilter === 'ALL' ? orders : orders.filter((order) => order.status === statusFilter)),
    [orders, statusFilter],
  )

  const stats = useMemo(() => {
    const value = orders.reduce((sum, order) => sum + Number(order.total || 0), 0)
    const inProgress = orders.filter((order) => !['COMPLETED', 'DELIVERED', 'CANCELLED', 'REJECTED'].includes(order.status)).length
    return { value, inProgress }
  }, [orders])

  return (
    <ModuleShell
      title="Online Orders"
      description="Delivery and pickup orders from external channels"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            leadingIcon={<Search aria-hidden="true" className="h-4 w-4" />}
          >
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setShowForm((value) => !value)}
            leadingIcon={<ShoppingBag aria-hidden="true" className="h-4 w-4" />}
          >
            {showForm ? 'Close builder' : 'New order'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorState title="Unable to load online orders" message={error} onRetry={() => void load()} /> : null}

        {loading ? (
          <SkeletonStatGrid count={4} />
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Orders" value={orders.length} icon={ShoppingBag} tone="brand" />
            <MetricCard label="In progress" value={stats.inProgress} icon={Truck} tone="warning" />
            <MetricCard label="Order value" value={formatCurrency(stats.value)} icon={ShoppingBag} tone="success" hint="All recorded orders" />
            <MetricCard label="Outlets" value={outlets.length} icon={Truck} tone="info" hint="With menus available" />
          </div>
        )}

        {showForm ? (
          <form onSubmit={submit} noValidate>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle description="Who the order is for">Customer</CardTitle>
                </CardHeader>
                <CardBody className="space-y-3">
                  {formError ? <ErrorState compact title="Unable to place order" message={formError} /> : null}
                  <Field label="Outlet" htmlFor="onlineOutlet" required>
                    <Select
                      id="onlineOutlet"
                      required
                      value={outletId}
                      onChange={(event) => {
                        setOutletId(event.target.value)
                        setCart([])
                      }}
                    >
                      <option value="">Select outlet</option>
                      {outlets.map((outlet) => (
                        <option key={outlet.id} value={outlet.id}>
                          {outlet.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Customer name" htmlFor="onlineCustomer" required>
                    <Input id="onlineCustomer" required value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                  </Field>
                  <Field label="Phone" htmlFor="onlinePhone" required>
                    <Input id="onlinePhone" required value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
                  </Field>
                  <Field label="Delivery address" htmlFor="onlineAddress" hint="Leave empty for pickup orders.">
                    <Textarea
                      id="onlineAddress"
                      rows={2}
                      value={deliveryAddress}
                      onChange={(event) => setDeliveryAddress(event.target.value)}
                    />
                  </Field>
                </CardBody>
              </Card>

              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle description={`${products.length} items available`}>Menu</CardTitle>
                  <Input
                    type="search"
                    className="w-full sm:w-48"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search menu"
                    aria-label="Search menu"
                  />
                </CardHeader>
                <CardBody>
                  {products.length === 0 ? (
                    query ? (
                      <NoResultsState query={query} onClear={() => setQuery('')} />
                    ) : (
                      <EmptyState
                        size="icon"
                        title="No menu items"
                        description="Select an outlet with published products to start an order."
                      />
                    )
                  ) : (
                    <ul className="space-y-1.5">
                      {products.map((product) => (
                        <li key={product.id}>
                          <button
                            type="button"
                            onClick={() => addProduct(product)}
                            className="flex w-full items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-left transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50"
                          >
                            <span className="min-w-0 truncate text-sm font-medium text-ink-900">{product.name}</span>
                            <span className="shrink-0 text-sm tabular-nums text-ink-600">{formatCurrency(product.price)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle description={cart.length ? `${covers} items` : 'No items selected'}>Current order</CardTitle>
                  {cart.length > 0 ? (
                    <Button variant="ghost" size="sm" onClick={() => setCart([])} leadingIcon={<Trash2 aria-hidden="true" className="h-4 w-4" />}>
                      Clear
                    </Button>
                  ) : null}
                </CardHeader>
                <CardBody className="space-y-3">
                  {cart.length === 0 ? (
                    <p className="py-6 text-center text-sm text-ink-500">Select menu items to build the order.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {cart.map((line) => (
                        <li key={line.product.id} className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink-900">{line.product.name}</p>
                            <p className="text-xs tabular-nums text-ink-500">{formatCurrency(line.product.price)}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Remove one ${line.product.name}`}
                              onClick={() => changeQuantity(line.product.id, line.quantity - 1)}
                            >
                              <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                            </Button>
                            <span className="w-6 text-center text-sm font-medium tabular-nums">{line.quantity}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Add one ${line.product.name}`}
                              onClick={() => changeQuantity(line.product.id, line.quantity + 1)}
                            >
                              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
                <div className="space-y-3 border-t border-line px-4 py-3.5 sm:px-5">
                  <div className="flex items-center justify-between text-base font-semibold text-ink-900">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(total)}</span>
                  </div>
                  <Button type="submit" className="w-full" loading={saving} loadingLabel="Placing" disabled={cart.length === 0 || !outletId}>
                    Place order
                  </Button>
                </div>
              </Card>
            </div>
          </form>
        ) : null}

        <Card className="overflow-hidden">
          <div className="px-2 sm:px-3">
            <Tabs
              ariaLabel="Filter online orders"
              items={[
                { id: 'ALL', label: 'All', count: orders.length },
                { id: 'PENDING', label: 'Pending' },
                { id: 'PREPARING', label: 'Preparing' },
                { id: 'DELIVERED', label: 'Delivered' },
                { id: 'CANCELLED', label: 'Cancelled' },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
          {loading ? (
            <div className="px-4 py-4 sm:px-5">
              <SkeletonTable rows={5} columns={5} className="border-0 shadow-none" />
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="h-5 w-5" />}
              title="No online orders"
              description="Delivery and pickup orders received through online channels appear here."
            />
          ) : visibleOrders.length === 0 ? (
            <EmptyState
              size="icon"
              title="No orders in this state"
              description="Switch to another status to see the rest of the orders."
              action={
                <Button variant="outline" size="sm" onClick={() => setStatusFilter('ALL')}>
                  Show all orders
                </Button>
              }
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <tr>
                    <TH>Order</TH>
                    <TH>Customer</TH>
                    <TH>Destination</TH>
                    <TH>Placed</TH>
                    <TH className="text-right">Total</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {visibleOrders.map((order) => (
                    <TR key={order.id}>
                      <TD className="font-medium text-ink-900">{order.orderNumber}</TD>
                      <TD>
                        <div className="min-w-0">
                          <p className="truncate text-ink-800">{order.customerName || 'Not recorded'}</p>
                          <p className="truncate text-xs text-ink-500">{order.customerPhone || 'No phone'}</p>
                        </div>
                      </TD>
                      <TD className="text-ink-500">{order.deliveryAddress || order.roomNumber || 'Pickup'}</TD>
                      <TD className="text-ink-500">{formatDateTime(order.createdAt)}</TD>
                      <TD className="text-right font-medium tabular-nums">{formatCurrency(order.total || 0)}</TD>
                      <TD>
                        <StatusBadge status={order.status} registry={ONLINE_ORDER_STATUS} />
                      </TD>
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
