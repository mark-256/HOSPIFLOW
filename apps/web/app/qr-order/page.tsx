'use client'

import { useEffect, useState } from 'react'

export default function QROrderPage() {
  const [table, setTable] = useState<any>(null)
  const [menu, setMenu] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) return
    fetch(`/api/qr/lookup/${token}`)
      .then(r => r.json())
      .then(json => { if (json.success) setTable(json.data) })
  }, [])

  useEffect(() => {
    if (!table?.outletId) return
    fetch(`/api/menus?outletId=${table.outletId}`)
      .then(r => r.json())
      .then(json => { if (json.success) setMenu(json.data) })
  }, [table])

  const addToCart = (product: any) => {
    setCart([...cart, { ...product, cartId: Date.now() + Math.random() }])
  }

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  const submitOrder = async () => {
    if (!table || cart.length === 0) return
    const orderRes = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: JSON.stringify({ outletId: table.outletId, tableId: table.tableId, orderType: 'DINE_IN' }) })
    const orderJson = await orderRes.json()
    if (orderJson.success) {
      for (const item of cart) {
        await fetch(`/api/orders/${orderJson.data.id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: JSON.stringify({ productId: item.id, productName: item.name, productCode: item.code, quantity: 1, unitPrice: item.price }) })
      }
      setCart([])
      alert('Order placed successfully')
    }
  }

  if (!table) return <div className="min-h-screen bg-hospiflow-50 flex items-center justify-center">Loading menu...</div>

  return (
    <div className="min-h-screen bg-hospiflow-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-hospiflow-900 mb-2">Menu - {table.tableName}</h1>
        <p className="text-hospiflow-600 mb-6">Outlet: {table.outletName}</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {menu.map((m: any) => m.categories?.map((cat: any) => cat.products?.map((p: any) => (
              <button key={p.id} onClick={() => addToCart(p)} className="bg-white p-4 rounded-lg shadow text-left hover:shadow-md">
                <p className="font-medium text-hospiflow-900">{p.name}</p>
                <p className="text-sm text-hospiflow-600">KES {p.price}</p>
              </button>
            ))))}
          </div>
          <div className="bg-white p-4 rounded-lg shadow h-fit">
            <h2 className="text-lg font-semibold mb-4">Your Order</h2>
            <div className="space-y-2 mb-4">
              {cart.map(item => (
                <div key={item.cartId} className="flex justify-between text-sm">
                  <span>{item.name} x1</span>
                  <span>KES {item.price}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>Total</span>
              <span>KES {total}</span>
            </div>
            <button onClick={submitOrder} className="mt-4 w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">Place Order</button>
          </div>
        </div>
      </div>
    </div>
  )
}
