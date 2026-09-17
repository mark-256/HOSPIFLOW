'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

type Outlet = {
  id: string
  name: string
  code: string
  type: string
  status: string
}

type Table = {
  id: string
  name: string
  code: string
  outletId: string
  status: string
  capacity?: number
}

type Product = {
  id: string
  name: string
  code: string
  price: number | string
  isAvailable?: boolean
  isActive?: boolean
}

type Menu = {
  id: string
  outletId: string
  name: string
  categories?: {
    id: string
    name: string
    products?: Product[]
  }[]
}

type Order = {
  id: string
  outletId: string
  orderNumber: string
  status: string
  orderType: string
  total?: number | string
  table?: { name?: string } | null
  items?: { productName?: string; quantity?: number }[]
}

type CartItem = Product & {
  quantity: number
}

type OutletOrdersProps = {
  title: string
  orderType: string
  outletType?: string
  sendToKitchen?: boolean
}

export default function OutletOrders({ title, orderType, outletType, sendToKitchen = true }: OutletOrdersProps) {
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOutletId, setSelectedOutletId] = useState('')
  const [selectedTableId, setSelectedTableId] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [outletResponse, tableResponse, menuResponse, orderResponse] = await Promise.all([
        apiRequest<Outlet[]>('/api/outlets'),
        apiRequest<Table[]>('/api/tables'),
        apiRequest<Menu[]>('/api/menus'),
        apiRequest<Order[]>('/api/orders'),
      ])
      const allOutlets = responseData(outletResponse)
      const filteredOutlets = outletType ? allOutlets.filter((outlet) => outlet.type === outletType) : allOutlets
      setOutlets(filteredOutlets)
      setTables(responseData(tableResponse))
      setMenus(responseData(menuResponse))
      setOrders(responseData(orderResponse))
      setSelectedOutletId((current) => filteredOutlets.some((outlet) => outlet.id === current) ? current : (filteredOutlets[0]?.id || ''))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load the ordering workspace'))
    } finally {
      setLoading(false)
    }
  }, [outletType])

  useEffect(() => {
    void load()
  }, [load])

  const selectedOutlet = outlets.find((outlet) => outlet.id === selectedOutletId) || outlets[0] || null
  const visibleTables = tables.filter((table) => !selectedOutlet || table.outletId === selectedOutlet.id)
  const selectedTable = visibleTables.find((table) => table.id === selectedTableId) || visibleTables[0] || null
  const visibleMenus = menus.filter((menu) => !selectedOutlet || menu.outletId === selectedOutlet.id)
  const products = visibleMenus
    .flatMap((menu) => menu.categories || [])
    .flatMap((category) => category.products || [])
    .filter((product) => product.isAvailable !== false && product.isActive !== false)
  const visibleOrders = orders.filter((order) => !selectedOutlet || order.outletId === selectedOutlet.id)
    .filter((order) => !['COMPLETED', 'CANCELLED', 'SERVED'].includes(order.status))

  useEffect(() => {
    setSelectedTableId((current) => visibleTables.some((table) => table.id === current) ? current : (visibleTables[0]?.id || ''))
  }, [visibleTables])

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id)
      if (existing) {
        return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      }
      return [...current, { ...product, quantity: 1 }]
    })
    setNotice('')
  }

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((current) => current.filter((item) => item.id !== productId))
      return
    }
    setCart((current) => current.map((item) => item.id === productId ? { ...item, quantity } : item))
  }

  const total = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)

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
      setNotice(`Order ${order.orderNumber} was created successfully.`)
      await load()
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to create the order'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading ordering workspace...</div>
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}

      {outlets.length === 0 ? (
        <div className="rounded-lg border border-hospiflow-200 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold text-hospiflow-900">No {outletType?.toLowerCase() || 'outlet'} configured</h2>
          <p className="mt-2 text-hospiflow-600">Add an outlet before taking orders.</p>
          <Link href="/settings" className="mt-4 inline-flex rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">Open settings</Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-hospiflow-700">Outlet</span>
              <select value={selectedOutlet?.id || ''} onChange={(event) => setSelectedOutletId(event.target.value)} className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white">
                {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name} · {outlet.code}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-hospiflow-700">Table</span>
              <select value={selectedTable?.id || ''} onChange={(event) => setSelectedTableId(event.target.value)} className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white">
                {visibleTables.map((table) => <option key={table.id} value={table.id}>{table.name} · {table.status}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              <button onClick={() => void load()} className="w-full rounded-md border border-hospiflow-300 bg-white px-4 py-2 font-medium text-hospiflow-700 hover:bg-hospiflow-50">Refresh</button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="lg:col-span-2 rounded-lg border border-hospiflow-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-hospiflow-900">Menu</h2>
                <span className="text-sm text-hospiflow-600">{products.length} items</span>
              </div>
              {products.length === 0 ? (
                <p className="py-10 text-center text-hospiflow-600">No menu items are available for this outlet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {products.map((product) => (
                    <button key={product.id} onClick={() => addToCart(product)} className="rounded-lg border border-hospiflow-200 p-3 text-left hover:border-primary-500 hover:shadow-sm">
                      <p className="font-medium text-hospiflow-900">{product.name}</p>
                      <p className="mt-1 text-sm text-hospiflow-600">KES {Number(product.price).toFixed(2)}</p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <aside className="rounded-lg border border-hospiflow-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-hospiflow-900">Current order</h2>
              <div className="mt-4 space-y-3">
                {cart.length === 0 ? <p className="text-sm text-hospiflow-600">Select items from the menu to start an order.</p> : cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-hospiflow-900">{item.name}</p>
                      <p className="text-xs text-hospiflow-600">KES {Number(item.price).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="rounded border border-hospiflow-300 px-2 py-1 text-hospiflow-700">−</button>
                      <span className="w-6 text-center text-sm">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="rounded border border-hospiflow-300 px-2 py-1 text-hospiflow-700">+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between border-t border-hospiflow-200 pt-3 font-semibold">
                <span>Total</span><span>KES {total.toFixed(2)}</span>
              </div>
              <button onClick={() => void submitOrder()} disabled={saving || cart.length === 0 || !selectedTable} className="mt-4 w-full rounded-md bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? 'Creating...' : 'Create order'}
              </button>
            </aside>
          </div>

          <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-hospiflow-200"><h2 className="text-lg font-semibold text-hospiflow-900">Active orders</h2></div>
            {visibleOrders.length === 0 ? <p className="p-4 text-sm text-hospiflow-600">No active orders for this outlet.</p> : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-hospiflow-200">
                  <thead className="bg-hospiflow-50"><tr><th className="px-4 py-3 text-left text-xs font-medium uppercase text-hospiflow-500">Order</th><th className="px-4 py-3 text-left text-xs font-medium uppercase text-hospiflow-500">Table</th><th className="px-4 py-3 text-left text-xs font-medium uppercase text-hospiflow-500">Type</th><th className="px-4 py-3 text-left text-xs font-medium uppercase text-hospiflow-500">Status</th><th className="px-4 py-3 text-left text-xs font-medium uppercase text-hospiflow-500">Total</th></tr></thead>
                  <tbody className="divide-y divide-hospiflow-200">
                    {visibleOrders.map((order) => <tr key={order.id}><td className="px-4 py-3 text-sm">{order.orderNumber}</td><td className="px-4 py-3 text-sm">{order.table?.name || 'Walk-in'}</td><td className="px-4 py-3 text-sm">{order.orderType}</td><td className="px-4 py-3 text-sm"><span className="rounded bg-hospiflow-100 px-2 py-1 text-xs">{order.status}</span></td><td className="px-4 py-3 text-sm">KES {Number(order.total || 0).toFixed(2)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
