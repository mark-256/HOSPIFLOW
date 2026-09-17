'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

type Product = { id: string; name: string; price: number | string; code: string }
type Menu = { id: string; outletId: string; categories?: { id: string; name: string; products?: Product[] }[] }

export default function OnlineOrderingPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [outlets, setOutlets] = useState<any[]>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [outletId, setOutletId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [orderResponse, outletResponse, menuResponse] = await Promise.all([apiRequest<any[]>('/api/online-orders'), apiRequest<any[]>('/api/outlets'), apiRequest<Menu[]>('/api/menus')])
      setOrders(responseData(orderResponse))
      setOutlets(responseData(outletResponse))
      setMenus(responseData(menuResponse))
      setOutletId((current) => current || responseData(outletResponse)[0]?.id || '')
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to load online orders')) } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const products = menus.filter((menu) => menu.outletId === outletId).flatMap((menu) => menu.categories || []).flatMap((category) => category.products || [])
  const addProduct = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      return existing ? current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { product, quantity: 1 }]
    })
  }
  const total = cart.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!outletId || !customerName || !customerPhone || cart.length === 0) return
    try {
      await apiRequest('/api/online-orders', { method: 'POST', body: JSON.stringify({ outletId, customerName, customerPhone, deliveryAddress, items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })) }) })
      setCustomerName('')
      setCustomerPhone('')
      setDeliveryAddress('')
      setCart([])
      setShowForm(false)
      setNotice('Online order placed successfully.')
      await load()
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to place online order')) }
  }

  return (
    <ModuleShell title="Online Orders" description="Manage delivery and pickup orders">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}
      <div className="mb-5 flex justify-end"><button onClick={() => setShowForm((value) => !value)} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">{showForm ? 'Close order form' : 'New online order'}</button></div>
      {showForm && <form onSubmit={submit} className="mb-6 rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 lg:grid-cols-3"><div className="lg:col-span-1 space-y-3"><h2 className="text-lg font-semibold">Customer</h2><label className="block"><span className="text-sm text-hospiflow-700">Outlet</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={outletId} onChange={(event) => { setOutletId(event.target.value); setCart([]) }}><option value="">Select outlet</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label><input required placeholder="Customer name" className="w-full rounded-md border border-hospiflow-300 px-3 py-2" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /><input required placeholder="Phone" className="w-full rounded-md border border-hospiflow-300 px-3 py-2" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /><textarea placeholder="Delivery address" className="w-full rounded-md border border-hospiflow-300 px-3 py-2" value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} /></div><div className="lg:col-span-1"><h2 className="text-lg font-semibold">Menu</h2><div className="mt-3 grid gap-2">{products.map((product) => <button type="button" key={product.id} onClick={() => addProduct(product)} className="rounded-md border border-hospiflow-200 p-3 text-left hover:border-primary-500"><span className="text-sm font-medium">{product.name}</span><span className="ml-2 text-sm text-hospiflow-600">KES {Number(product.price).toFixed(2)}</span></button>)}</div>{products.length === 0 && <p className="mt-3 text-sm text-hospiflow-600">No menu items for this outlet.</p>}</div><div className="lg:col-span-1"><h2 className="text-lg font-semibold">Current order</h2><div className="mt-3 space-y-2">{cart.length === 0 ? <p className="text-sm text-hospiflow-600">Select products to begin.</p> : cart.map((item) => <div key={item.product.id} className="flex items-center justify-between text-sm"><span>{item.product.name}</span><span className="flex items-center gap-2"><button type="button" onClick={() => setCart((current) => current.map((entry) => entry.product.id === item.product.id ? { ...entry, quantity: Math.max(1, entry.quantity - 1) } : entry))}>−</button>{item.quantity}<button type="button" onClick={() => setCart((current) => current.map((entry) => entry.product.id === item.product.id ? { ...entry, quantity: entry.quantity + 1 } : entry))}>+</button></span></div>)}</div><p className="mt-4 flex justify-between border-t border-hospiflow-200 pt-3 font-semibold"><span>Total</span><span>KES {total.toFixed(2)}</span></p><button type="submit" className="mt-4 w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white">Place order</button></div></form>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading online orders...</div> : orders.length === 0 ? <div className="rounded-lg border border-hospiflow-200 bg-white p-8 text-center text-hospiflow-600">No online orders found.</div> : <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Order</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Customer</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Address</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Total</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Status</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{orders.map((order) => <tr key={order.id}><td className="px-5 py-3 text-sm">{order.orderNumber}</td><td className="px-5 py-3 text-sm">{order.customerName}<br /><span className="text-hospiflow-600">{order.customerPhone}</span></td><td className="px-5 py-3 text-sm">{order.roomNumber || 'N/A'}</td><td className="px-5 py-3 text-sm">KES {Number(order.total || 0).toFixed(2)}</td><td className="px-5 py-3 text-sm"><span className="rounded bg-hospiflow-100 px-2 py-1 text-xs">{order.status}</span></td></tr>)}</tbody></table></div></section>}
    </ModuleShell>
  )
}
