'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage } from '@/lib/api'

export default function ReportsPage() {
  const [sales, setSales] = useState<any>(null)
  const [occupancy, setOccupancy] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryAfter, setRetryAfter] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setRetryAfter(0)
    try {
      const [salesResponse, occupancyResponse] = await Promise.all([apiRequest<any>('/api/reports/sales?limit=100'), apiRequest<any>('/api/reports/occupancy')])
      setSales(salesResponse.data)
      setOccupancy(occupancyResponse.data)
    } catch (reason) {
      const message = getErrorMessage(reason, 'Unable to load reports')
      setError(message)
      if (reason instanceof Error && 'status' in reason && (reason as any).status === 429) {
        const retryAfterHeader = (reason as any).retryAfter
        if (retryAfterHeader) {
          setRetryAfter(parseInt(retryAfterHeader, 10) || 0)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (retryAfter <= 0) return
    const timer = window.setInterval(() => {
      setRetryAfter((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [retryAfter])

  return (
    <ModuleShell title="Reports" description="Sales, order, and occupancy performance">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        {error}
        {retryAfter > 0 && <span className="ml-2 text-sm">Retry in {retryAfter}s</span>}
      </div>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading reports...</div> : (
        <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Total sales</p><p className="mt-2 text-2xl font-bold">KES {Number(sales?.totalSales || 0).toFixed(2)}</p></div><div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Total orders</p><p className="mt-2 text-2xl font-bold">{sales?.totalOrders || 0}</p></div><div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Average order value</p><p className="mt-2 text-2xl font-bold">KES {Number(sales?.avgOrderValue || 0).toFixed(2)}</p></div><div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Occupancy rate</p><p className="mt-2 text-2xl font-bold">{Number(occupancy?.occupancyRate || 0).toFixed(1)}%</p></div></div><section className="rounded-lg border border-hospiflow-200 bg-white p-5"><h2 className="text-lg font-semibold">Occupancy</h2><p className="mt-2 text-hospiflow-700">{occupancy?.occupied || 0} of {occupancy?.total || 0} rooms occupied for the selected date.</p><div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-hospiflow-100"><div className="h-full bg-primary-600" style={{ width: `${Math.min(100, Number(occupancy?.occupancyRate || 0))}%` }} /></div></section></div>
      )}
    </ModuleShell>
  )
}
