'use client'

import { useEffect, useState } from 'react'

export default function KitchenPage() {
  const [orders, setOrders] = useState([])

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''

  const fetchOrders = async () => {
    const res = await fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (json.success) setOrders(json.data.filter((o: any) => ['SENT_TO_KITCHEN', 'PREPARING', 'READY'].includes(o.status)))
  }

  useEffect(() => { fetchOrders(); const interval = setInterval(fetchOrders, 5000); return () => clearInterval(interval) }, [])

  const updateStatus = async (orderId: string, status: string) => {
    await fetch(`/api/orders/${orderId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) })
    fetchOrders()
  }

  return (
    <div className="min-h-screen bg-hospiflow-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Kitchen Display</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order: any) => (
            <div key={order.id} className="bg-hospiflow-800 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">{order.orderNumber}</h3>
                <span className="text-xs bg-primary-600 px-2 py-1 rounded">{order.status}</span>
              </div>
              <div className="space-y-2 mb-4">
                {order.items.map((item: any) => (
                  <div key={item.id} className="border-b border-hospiflow-700 pb-2">
                    <p className="font-medium">{item.productName} x{item.quantity}</p>
                    {item.notes && <p className="text-xs text-hospiflow-400">{item.notes}</p>}
                  </div>
                ))}
              </div>
              <div className="flex space-x-2">
                {order.status === 'SENT_TO_KITCHEN' && <button onClick={() => updateStatus(order.id, 'PREPARING')} className="flex-1 bg-yellow-600 text-white py-2 rounded hover:bg-yellow-700">Start</button>}
                {order.status === 'PREPARING' && <button onClick={() => updateStatus(order.id, 'READY')} className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700">Ready</button>}
                {order.status === 'READY' && <button onClick={() => updateStatus(order.id, 'SERVED')} className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Served</button>}
              </div>
            </div>
          ))}
        </div>
        {orders.length === 0 && <p className="text-center text-hospiflow-400 mt-10">No active kitchen orders</p>}
      </div>
    </div>
  )
}
