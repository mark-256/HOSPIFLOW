'use client'

import { useEffect, useState } from 'react'

export default function POSPage() {
  const [tables, setTables] = useState<any[]>([])
  const [selectedTable, setSelectedTable] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderType, setOrderType] = useState('DINE_IN')

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''

  const fetchTables = async () => {
    const res = await fetch('/api/tables', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (json.success) setTables(json.data)
  }

  const fetchOrders = async () => {
    const res = await fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (json.success) setOrders(json.data)
  }

  useEffect(() => { void fetchTables(); fetchOrders() }, [])

  const createOrder = async () => {
    if (!selectedTable) return
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ outletId: '', tableId: selectedTable.id, orderType }) })
    if (res.ok) { setShowOrderForm(false); fetchOrders() }
  }

  return (
    <div className="min-h-screen bg-hospiflow-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-hospiflow-900 mb-6">POS</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Tables</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {tables.map((table: any) => (
                <button key={table.id} onClick={() => setSelectedTable(table)} className={`p-4 rounded-lg shadow text-left ${selectedTable?.id === table.id ? 'ring-2 ring-primary-500' : ''} ${table.status === 'AVAILABLE' ? 'bg-white' : 'bg-hospiflow-200'}`}>
                  <p className="font-medium">{table.name}</p>
                  <p className="text-xs text-hospiflow-600">{table.status}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-4">Active Orders</h2>
            <div className="bg-white rounded-lg shadow divide-y divide-hospiflow-200">
              {orders.map((order: any) => (
                <div key={order.id} className="p-4">
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="text-sm text-hospiflow-600">{order.status} - {order.orderType}</p>
                  <p className="text-sm text-hospiflow-600">Total: KES {order.total}</p>
                </div>
              ))}
            </div>
            {selectedTable && (
              <button onClick={createOrder} className="mt-4 w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">New Order for {selectedTable.name}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
