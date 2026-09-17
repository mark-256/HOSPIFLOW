'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

export default function KitchenPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const response = await apiRequest<any[]>('/api/orders?limit=100')
      setOrders(responseData(response).filter((order) => ['SENT_TO_KITCHEN', 'PREPARING', 'READY'].includes(order.status)))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load kitchen orders'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(interval)
  }, [load])

  const updateStatus = async (orderId: string, status: string) => {
    setError('')
    try {
      await apiRequest(`/api/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await load()
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to update kitchen order'))
    }
  }

  return (
    <ModuleShell title="Kitchen" description="Kitchen display for preparing and serving orders">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading kitchen orders...</div> : orders.length === 0 ? <div className="rounded-lg border border-hospiflow-200 bg-white p-10 text-center text-hospiflow-600">No active kitchen orders</div> : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{orders.map((order) => <section key={order.id} className="rounded-lg border border-hospiflow-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold">{order.orderNumber}</p><p className="text-xs text-hospiflow-600">{order.table?.name || 'Walk-in'} · {order.orderType}</p></div><span className="rounded bg-primary-100 px-2 py-1 text-xs text-primary-800">{order.status}</span></div><div className="mt-4 space-y-2">{order.items?.map((item: any) => <div key={item.id} className="flex justify-between gap-3 border-b border-hospiflow-200 pb-2"><span className="text-sm">{item.productName}</span><span className="text-sm font-medium">x{item.quantity}</span></div>)}</div><div className="mt-5 flex gap-2">{order.status === 'SENT_TO_KITCHEN' && <button onClick={() => void updateStatus(order.id, 'PREPARING')} className="flex-1 rounded bg-yellow-600 px-3 py-2 text-sm font-medium text-white">Start preparation</button>}{order.status === 'PREPARING' && <button onClick={() => void updateStatus(order.id, 'READY')} className="flex-1 rounded bg-green-600 px-3 py-2 text-sm font-medium text-white">Mark ready</button>}{order.status === 'READY' && <button onClick={() => void updateStatus(order.id, 'SERVED')} className="flex-1 rounded bg-primary-600 px-3 py-2 text-sm font-medium text-white">Mark served</button>}</div></section>)}</div>
      )}
    </ModuleShell>
  )
}
