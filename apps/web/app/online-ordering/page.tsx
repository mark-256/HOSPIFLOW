'use client'

import { useEffect, useState } from 'react'

export default function OnlineOrderingPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ outletId: '', customerName: '', customerPhone: '', deliveryAddress: '', items: [] as any[] })
  const [itemName, setItemName] = useState('')
  const [itemQty, setItemQty] = useState(1)
  const [itemPrice, setItemPrice] = useState(0)

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''

  const fetchOrders = async () => {
    setLoading(true)
    const res = await fetch('/api/online-orders', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (json.success) setOrders(json.data)
    setLoading(false)
  }

  useEffect(() => { fetchOrders() }, [])

  const addItem = () => {
    if (!itemName || itemQty <= 0 || itemPrice <= 0) return
    setForm({ ...form, items: [...form.items, { productName: itemName, quantity: itemQty, unitPrice: itemPrice, productId: '', productCode: '' }] })
    setItemName(''); setItemQty(1); setItemPrice(0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/online-orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(form) })
    if (res.ok) { setShowForm(false); setForm({ outletId: '', customerName: '', customerPhone: '', deliveryAddress: '', items: [] }); fetchOrders() }
  }

  return (
    <div className="min-h-screen bg-hospiflow-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-hospiflow-900">Online Orders</h1>
          <button onClick={() => setShowForm(!showForm)} className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700">New Order</button>
        </div>
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6 space-y-4">
            <input className="border rounded p-2 w-full" placeholder="Outlet ID" value={form.outletId} onChange={e => setForm({ ...form, outletId: e.target.value })} />
            <input className="border rounded p-2 w-full" placeholder="Customer Name" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} />
            <input className="border rounded p-2 w-full" placeholder="Phone" value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} />
            <input className="border rounded p-2 w-full" placeholder="Delivery Address" value={form.deliveryAddress} onChange={e => setForm({ ...form, deliveryAddress: e.target.value })} />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input className="border rounded p-2" placeholder="Item name" value={itemName} onChange={e => setItemName(e.target.value)} />
              <input className="border rounded p-2" type="number" placeholder="Qty" value={itemQty} onChange={e => setItemQty(parseInt(e.target.value))} />
              <input className="border rounded p-2" type="number" placeholder="Price" value={itemPrice} onChange={e => setItemPrice(parseFloat(e.target.value))} />
              <button type="button" onClick={addItem} className="bg-gray-200 rounded p-2">Add Item</button>
            </div>
            {form.items.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-hospiflow-700">
                {form.items.map((item, idx) => (
                  <li key={idx}>{item.productName} x{item.quantity} @ {item.unitPrice}</li>
                ))}
              </ul>
            )}
            <button type="submit" className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">Place Order</button>
          </form>
        )}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-hospiflow-200">
            <thead className="bg-hospiflow-50">
              <tr><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Order</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Customer</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Total</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Status</th></tr>
            </thead>
            <tbody className="bg-white divide-y divide-hospiflow-200">
              {orders.map((order: any) => (
                <tr key={order.id}><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-900">{order.orderNumber}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{order.customerName}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{order.total}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{order.status}</td></tr>
              ))}
            </tbody>
          </table>
          {loading && <p className="p-4 text-center text-hospiflow-600">Loading...</p>}
        </div>
      </div>
    </div>
  )
}
