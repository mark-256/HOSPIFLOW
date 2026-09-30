'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Minus, Plus, RefreshCw, Search, ShoppingCart, Store, Trash2 } from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState, NoResultsState } from '@/components/ui/States'
import { Skeleton } from '@/components/ui/Skeleton'
import { Field, Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { ORDER_STATUS, TABLE_STATUS } from '@/lib/status'
import { formatCurrency, formatTime } from '@/lib/format'

type Outlet = { id: string; name: string; code: string; type: string; status: string }
type Table = { id: string; name: string; code: string; outletId: string; status: string; capacity?: number }
type Product = { id: string; name: string; code: string; price: number | string; isAvailable?: boolean; isActive?: boolean }
type Menu = {
  id: string
  outletId: string
  name: string
  categories?: { id: string; name: string; products?: Product[] }[]
}
type Order = {
  id: string
  outletId: string
  orderNumber: string
  status: string
  orderType: string
  total?: number | string
  createdAt?: string
  table?: { name?: string } | null
  items?: Array<{ productName?: string; quantity?: number }>
}
type CartItem = Product & { quantity: number }

type OutletOrdersProps = {
  title: string
  orderType: string
  outletType?: string
  sendToKitchen?: boolean
}

export default function OutletOrders({ title, orderType, outletType, sendToKitchen = true }: OutletOrdersProps) {
  const toast = useToast()
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOutletId, setSelectedOutletId] = useState('')
  const [selectedTableId, setSelectedTableId] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [outletResponse, tableResponse, menuResponse, orderResponse] = await Promise.all([
        apiRequest<Outlet[]>('/api/outlets'),
        apiRequest<Table[]>('/api/tables'),
        apiRequest<Menu[]>('/api/menus'),
        apiRequest<Order[]>('/api/orders?limit=100'),
      ])
      const allOutlets = responseData(outletResponse)
      const filteredOutlets = outletType ? allOutlets.filter((outlet) => outlet.type === outletType) : allOutlets
      setOutlets(filteredOutlets)
      setTables(responseData(tableResponse))
      setMenus(responseData(menuResponse))
      setOrders(responseData(orderResponse))
      setSelectedOutletId((current) => (filteredOutlets.some((outlet) => outlet.id === current) ? current : filteredOutlets[0]?.id || ''))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load the ordering workspace'))
    } finally {
      setLoading(false)
    }
  }, [outletType])

  useEffect(() => {
    void load()
  }, [load])

  const selectedOutlet = useMemo(
    () => outlets.find((outlet) => outlet.id === selectedOutletId) || outlets[0] || null,
    [outlets, selectedOutletId],
  )
  const visibleTables = useMemo(
    () => (selectedOutlet ? tables.filter((table) => table.outletId === selectedOutlet.id) : []),
    [tables, selectedOutlet],
  )
  const selectedTable = useMemo(
    () => visibleTables.find((table) => table.id === selectedTableId) || visibleTables[0] || null,
    [visibleTables, selectedTableId],
  )

  useEffect(() => {
    setSelectedTableId((current) => (visibleTables.some((table) => table.id === current) ? current : visibleTables[0]?.id || ''))
  }, [visibleTables])

  const visibleMenus = useMemo(
    () => (selectedOutlet ? menus.filter((menu) => menu.outletId === selectedOutlet.id) : []),
    [menus, selectedOutlet],
  )

  const groupedProducts = useMemo(() => {
    const term = query.trim().toLowerCase()
    const groups: Array<{ id: string; name: string; products: Product[] }> = []
    for (const menu of visibleMenus) {
      for (const category of menu.categories || []) {
        const products = (category.products || []).filter(
          (product) => product.isAvailable !== false && product.isActive !== false,
        )
        if (products.length === 0) continue
        groups.push({ id: category.id, name: category.name, products })
      }
    }
    if (!term) return groups
    return groups
      .map((group) => ({
        ...group,
        products: group.products.filter((product) => product.name.toLowerCase().includes(term) || product.code.toLowerCase().includes(term)),
      }))
      .filter((group) => group.products.length > 0)
  }, [visibleMenus, query])

  const productCount = groupedProducts.reduce((sum, group) => sum + group.products.length, 0)
  const visibleOrders = useMemo(
    () =>
      orders
        .filter((order) => !selectedOutlet || order.outletId === selectedOutlet.id)
        .filter((order) => !['COMPLETED', 'CANCELLED', 'SERVED'].includes(order.status)),
    [orders, selectedOutlet],
  )

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id)
      if (existing) return current.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      return [...current, { ...product, quantity: 1 }]
    })
  }

  const updateQuantity = (productId: string, quantity: number) => {
    setCart((current) =>
      quantity <= 0 ? current.filter((item) => item.id !== productId) : current.map((item) => (item.id === productId ? { ...item, quantity } : item)),
    )
  }

  const total = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
  const covers = cart.reduce((sum, item) => sum + item.quantity, 0)

  const submitOrder = async () => {
    if (!selectedOutlet || !selectedTable || cart.length === 0) return
    setSaving(true)
    setError('')
    try {
      const orderResponse = await apiRequest<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          outletId: selectedOutlet.id,
          tableId: selectedTable.id,
          orderType,
          covers: cart.reduce((sum, item) => sum + item.quantity, 0),
        }),
      })
      const order = orderResponse.data
      for (const item of cart) {
        await apiRequest(`/api/orders/${order.id}/items`, {
          method: 'POST',
          body: JSON.stringify({
            productId: item.id,
            quantity: item.quantity,
            unitPrice: Number(item.price),
            notes: item.code,
          }),
        })
      }
      if (sendToKitchen) {
        await apiRequest(`/api/orders/${order.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'SENT_TO_KITCHEN' }),
        })
      }
      setCart([])
      toast.success('Order created', `Order ${order.orderNumber} was added to the queue.`)
      await load()
    } catch (reason) {
      const message = getErrorMessage(reason, 'Unable to create the order')
      setError(message)
      toast.error('Order not created', message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading ordering workspace">
        <Skeleton className="h-20 rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-lg lg:col-span-2" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </div>
    )
  }

  if (outlets.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Store className="h-5 w-5" />}
          title={`No ${outletType ? outletType.toLowerCase().replace(/_/g, ' ') : 'outlet'} configured`}
          description="Add an outlet in Settings before taking orders for this workspace."
          action={
            <Link
              href="/settings"
              className="inline-flex h-9 items-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-700"
            >
              Open settings
            </Link>
          }
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorState title="Ordering workspace" message={error} onRetry={() => void load()} compact /> : null}

      <Card>
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4 sm:px-5">
          <Field label="Outlet" htmlFor="outlet-select">
            <Select id="outlet-select" value={selectedOutlet?.id || ''} onChange={(event) => setSelectedOutletId(event.target.value)}>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name} · {outlet.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Table" htmlFor="table-select" hint={selectedTable ? `Status: ${selectedTable.status.replace(/_/g, ' ').toLowerCase()}` : undefined}>
            <Select id="table-select" value={selectedTable?.id || ''} onChange={(event) => setSelectedTableId(event.target.value)}>
              {visibleTables.length === 0 ? <option value="">No tables configured</option> : null}
              {visibleTables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name} · {table.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Order type" htmlFor="order-type">
            <Input id="order-type" value={orderType.replace(/_/g, ' ').toLowerCase()} readOnly />
          </Field>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={() => void load()} leadingIcon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle description={`${title} · ${productCount} items`}>Menu</CardTitle>
            <div className="relative w-full sm:w-64">
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search menu"
                aria-label="Search menu items"
                leadingSlot={<Search aria-hidden="true" className="h-4 w-4" />}
              />
            </div>
          </CardHeader>
          <CardBody>
            {groupedProducts.length === 0 ? (
              query ? (
                <NoResultsState query={query} onClear={() => setQuery('')} />
              ) : (
                <EmptyState
                  size="icon"
                  icon={<ShoppingCart className="h-5 w-5" />}
                  title="No menu items available"
                  description="Add products and categories to this outlet menu to start taking orders."
                />
              )
            ) : (
              <div className="space-y-5">
                {groupedProducts.map((group) => (
                  <section key={group.id} aria-labelledby={`menu-${group.id}`}>
                    <h3 id={`menu-${group.id}`} className="hf-overline mb-2">
                      {group.name}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {group.products.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addToCart(product)}
                          className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2.5 text-left transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink-900">{product.name}</span>
                            <span className="block text-xs text-ink-500">{product.code}</span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-700">
                            {formatCurrency(product.price)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="flex h-fit flex-col lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle description={cart.length ? `${covers} covers` : 'No items selected'}>Current order</CardTitle>
            {cart.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setCart([])} leadingIcon={<Trash2 aria-hidden="true" className="h-4 w-4" />}>
                Clear
              </Button>
            ) : null}
          </CardHeader>
          <CardBody className="flex-1">
            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">Select items from the menu to start an order.</p>
            ) : (
              <ul className="space-y-2.5">
                {cart.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{item.name}</p>
                      <p className="text-xs tabular-nums text-ink-500">{formatCurrency(item.price)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        aria-label={`Remove one ${item.name}`}
                      >
                        <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium tabular-nums" aria-label={`Quantity ${item.quantity}`}>
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        aria-label={`Add one ${item.name}`}
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
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-600">Items</span>
              <span className="tabular-nums text-ink-700">{covers}</span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold text-ink-900">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
            <Button
              className="w-full"
              loading={saving}
              disabled={cart.length === 0 || !selectedTable}
              onClick={() => void submitOrder()}
            >
              {sendToKitchen ? 'Create and send to kitchen' : 'Create order'}
            </Button>
            {!selectedTable ? (
              <p className="text-center text-xs text-ink-500">Select a table to place this order.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle description={`${visibleOrders.length} orders in progress`}>Active orders</CardTitle>
        </CardHeader>
        {visibleOrders.length === 0 ? (
          <EmptyState size="icon" title="No active orders" description="New orders for this outlet will appear here." />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <TH>Order</TH>
                  <TH>Table</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH>Placed</TH>
                  <TH className="text-right">Total</TH>
                </tr>
              </THead>
              <TBody>
                {visibleOrders.map((order) => (
                  <TR key={order.id}>
                    <TD className="font-medium text-ink-900">{order.orderNumber}</TD>
                    <TD className="text-ink-500">
                      {order.table?.name ? (
                        <span className="inline-flex items-center gap-2">
                          {order.table.name}
                          <StatusBadge
                            status={tables.find((table) => table.name === order.table?.name)?.status}
                            registry={TABLE_STATUS}
                            showDot={false}
                          />
                        </span>
                      ) : (
                        'Walk-in'
                      )}
                    </TD>
                    <TD className="text-ink-500">{order.orderType.replace(/_/g, ' ').toLowerCase()}</TD>
                    <TD>
                      <StatusBadge status={order.status} registry={ORDER_STATUS} />
                    </TD>
                    <TD className="text-ink-500">{formatTime(order.createdAt)}</TD>
                    <TD className="text-right font-medium tabular-nums">{formatCurrency(order.total || 0)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </Card>
    </div>
  )
}
