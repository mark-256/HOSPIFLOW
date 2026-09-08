'use client'

import { useEffect, useState } from 'react'

export default function ReportsPage() {
  const [sales, setSales] = useState<any>(null)
  const [occupancy, setOccupancy] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''

  useEffect(() => {
    Promise.all([
      fetch('/api/reports/sales', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/reports/occupancy', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([salesJson, occJson]) => {
      if (salesJson.success) setSales(salesJson.data)
      if (occJson.success) setOccupancy(occJson.data)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="min-h-screen bg-hospiflow-50 flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen bg-hospiflow-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-hospiflow-900 mb-6">Reports</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-hospiflow-600">Total Sales</p>
            <p className="text-2xl font-bold text-hospiflow-900">KES {sales?.totalSales?.toFixed(2) || '0.00'}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-hospiflow-600">Total Orders</p>
            <p className="text-2xl font-bold text-hospiflow-900">{sales?.totalOrders || 0}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-hospiflow-600">Avg Order Value</p>
            <p className="text-2xl font-bold text-hospiflow-900">KES {sales?.avgOrderValue?.toFixed(2) || '0.00'}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-hospiflow-600">Occupancy Rate</p>
            <p className="text-2xl font-bold text-hospiflow-900">{occupancy?.occupancyRate || 0}%</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-sm text-hospiflow-600">Rooms Occupied</p>
            <p className="text-2xl font-bold text-hospiflow-900">{occupancy?.occupied || 0} / {occupancy?.total || 0}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
