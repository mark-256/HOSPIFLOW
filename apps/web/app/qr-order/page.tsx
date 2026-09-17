'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

type Product = { id: string; name: string; code: string; price: number | string }
type Menu = { id: string; outletId: string; name: string; categories?: { id: string; name: string; products?: Product[] }[] }

export default function QROrderPage() {
  const [token, setToken] = useState('')
  const [table, setTable] = useState<any>(null)
  const [menus, setMenus] = useState<Menu[]>([])
  const [cart, setCart] = useState<Array<{ product: Product; quantity: number }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadTable = useCallback(async () => {
    const queryToken = new URLSearchParams(window.location.search).get('token') || ''
    setToken(queryToken)
    if (!queryToken) {
      setError('A QR order token is required.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<any>(`/api/qr/lookup/${encodeURIComponent(queryToken)}`, {}, { auth: false })
      setTable(response.data)
      const menuResponse = await apiRequest<Menu[]>(`/api/menus?outletId=${encodeURIComponent(response.data.outletId)}`, {}, { auth: false })
      setMenus(responseData(menuResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Invalid or expired QR code'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadTable() }, [loadTable])

  const products = menus.flatMap((menu) => menu.categories || []).flatMap((category) => category.products || [])
  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      return existing ? current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { product, quantity: 1 }]
    })
  }
  const total = cart.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0)

  const submitOrder = async () => {
    if (!table || cart.length === 0) return
    setSaving(true)
    setError('')
    try {
      await apiRequest('/api/qr/orders', { method: 'POST', body: JSON.stringify({ token, items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })) }) }, { auth: false })
      setCart([])
      setNotice('Order placed successfully.')
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to place QR order'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-hospiflow-50">
      <header className="border-b border-hospiflow-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8"><Link href="/dashboard" className="text-lg font-bold text-hospiflow-900">HOSPIFLOW</Link><span className="text-sm text-hospiflow-600">Guest ordering</span></div></header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="mb-1 text-2xl font-bold text-hospiflow-900">QR Ordering</h1><p className="mb-5 text-sm text-hospiflow-600">Guest self-service menu and order placement</p>
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading menu...</div> : !table ? <div className="rounded-lg border border-dashed border-hospiflow-300 bg-white p-10 text-center text-hospiflow-600">Scan a QR code or open a QR order link to view the menu.</div> : (
        <div className="grid gap-6 lg:grid-cols-3"><section className="lg:col-span-2 rounded-lg border border-hospiflow-200 bg-white p-5"><div className="mb-4"><h2 className="text-xl font-semibold">Menu · {table.outletName}</h2><p className="text-sm text-hospiflow-600">Table {table.tableName}</p></div><div className="grid gap-3 sm:grid-cols-2">{products.map((product) => <button key={product.id} onClick={() => addToCart(product)} className="rounded-lg border border-hospiflow-200 p-4 text-left hover:border-primary-500"><p className="font-medium">{product.name}</p><p className="mt-1 text-sm text-hospiflow-600">KES {Number(product.price).toFixed(2)}</p></button>)}</div>{products.length === 0 && <p className="py-10 text-center text-hospiflow-600">No menu items are available.</p>}</section><aside className="rounded-lg border border-hospiflow-200 bg-white p-5"><h2 className="text-lg font-semibold">Your order</h2><div className="mt-4 space-y-3">{cart.length === 0 ? <p className="text-sm text-hospiflow-600">Select items from the menu.</p> : cart.map((item) => <div key={item.product.id} className="flex items-center justify-between gap-2"><span className="text-sm">{item.product.name}</span><span className="flex items-center gap-1"><button onClick={() => setCart((current) => current.map((entry) => entry.product.id === item.product.id ? { ...entry, quantity: Math.max(1, entry.quantity - 1) } : entry))}>−</button><span className="w-5 text-center">{item.quantity}</span><button onClick={() => setCart((current) => current.map((entry) => entry.product.id === item.product.id ? { ...entry, quantity: entry.quantity + 1 } : entry))}>+</button></span></div>)}</div><div className="mt-4 flex justify-between border-t border-hospiflow-200 pt-3 font-semibold"><span>Total</span><span>KES {total.toFixed(2)}</span></div><button disabled={saving || cart.length === 0} onClick={() => void submitOrder()} className="mt-4 w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">{saving ? 'Placing...' : 'Place order'}</button></aside></div>
      )}
      </main>
    </div>
  )
}
