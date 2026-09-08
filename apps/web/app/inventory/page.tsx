'use client'

import { useEffect, useState } from 'react'

export default function InventoryPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ organizationId: '', name: '', sku: '', description: '', category: '', unit: '', unitCost: '', reorderLevel: '', minStockLevel: '', maxStockLevel: '', expiryTracking: false })

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''

  const fetchItems = async () => {
    setLoading(true)
    const res = await fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (json.success) setItems(json.data)
    setLoading(false)
  }

  useEffect(() => { void fetchItems() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(form) })
    if (res.ok) { setShowForm(false); setForm({ organizationId: '', name: '', sku: '', description: '', category: '', unit: '', unitCost: '', reorderLevel: '', minStockLevel: '', maxStockLevel: '', expiryTracking: false }); fetchItems() }
  }

  return (
    <div className="min-h-screen bg-hospiflow-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-hospiflow-900">Inventory</h1>
          <button onClick={() => setShowForm(!showForm)} className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700">Add Item</button>
        </div>
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="border rounded p-2" placeholder="Organization ID" value={form.organizationId} onChange={e => setForm({ ...form, organizationId: e.target.value })} />
            <input className="border rounded p-2" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="border rounded p-2" placeholder="SKU" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} />
            <input className="border rounded p-2" placeholder="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
            <input className="border rounded p-2" placeholder="Unit" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
            <input className="border rounded p-2" type="number" placeholder="Unit Cost" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} />
            <input className="border rounded p-2" type="number" placeholder="Reorder Level" value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} />
            <input className="border rounded p-2" type="number" placeholder="Min Stock Level" value={form.minStockLevel} onChange={e => setForm({ ...form, minStockLevel: e.target.value })} />
            <input className="border rounded p-2" type="number" placeholder="Max Stock Level" value={form.maxStockLevel} onChange={e => setForm({ ...form, maxStockLevel: e.target.value })} />
            <label className="flex items-center space-x-2"><input type="checkbox" checked={form.expiryTracking} onChange={e => setForm({ ...form, expiryTracking: e.target.checked })} /><span>Expiry Tracking</span></label>
            <button type="submit" className="md:col-span-2 bg-green-600 text-white py-2 rounded hover:bg-green-700">Save Item</button>
          </form>
        )}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-hospiflow-200">
            <thead className="bg-hospiflow-50">
              <tr><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Name</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">SKU</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Category</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Unit</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Cost</th></tr>
            </thead>
            <tbody className="bg-white divide-y divide-hospiflow-200">
              {items.map((item: any) => (
                <tr key={item.id}><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-900">{item.name}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{item.sku}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{item.category}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{item.unit}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{item.unitCost}</td></tr>
              ))}
            </tbody>
          </table>
          {loading && <p className="p-4 text-center text-hospiflow-600">Loading...</p>}
        </div>
      </div>
    </div>
  )
}
