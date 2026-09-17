'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ name: '', sku: '', description: '', category: '', unit: '', unitCost: '', reorderLevel: '', minStockLevel: '', maxStockLevel: '', expiryTracking: false })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<any[]>('/api/inventory?limit=200')
      setItems(responseData(response))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load inventory'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/inventory', { method: 'POST', body: JSON.stringify(form) })
      setForm({ name: '', sku: '', description: '', category: '', unit: '', unitCost: '', reorderLevel: '', minStockLevel: '', maxStockLevel: '', expiryTracking: false })
      setShowForm(false)
      setNotice('Inventory item saved successfully.')
      await load()
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to save inventory item'))
    }
  }

  const lowStock = items.filter((item) => Number(item.reorderLevel || 0) > 0 && Number(item.minStockLevel || 0) <= Number(item.reorderLevel || 0))
  return (
    <ModuleShell title="Inventory" description="Track stock items, reorder thresholds, and item values">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-hospiflow-600">{items.length} items · {lowStock.length} at or below reorder level</div><button onClick={() => setShowForm((value) => !value)} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">{showForm ? 'Close form' : 'Add item'}</button></div>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 md:grid-cols-3">
          <h2 className="md:col-span-3 text-lg font-semibold">Inventory item</h2>
          {[['name', 'Name'], ['sku', 'SKU'], ['category', 'Category'], ['unit', 'Unit'], ['unitCost', 'Unit cost'], ['reorderLevel', 'Reorder level'], ['minStockLevel', 'Minimum stock'], ['maxStockLevel', 'Maximum stock']].map(([field, label]) => <label key={field} className="block"><span className="text-sm text-hospiflow-700">{label}</span><input required={field === 'name' || field === 'sku' || field === 'unit'} type={['unitCost', 'reorderLevel', 'minStockLevel', 'maxStockLevel'].includes(field) ? 'number' : 'text'} step="0.01" className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={(form as any)[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>)}
          <label className="md:col-span-2 block"><span className="text-sm text-hospiflow-700">Description</span><textarea className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="flex items-center gap-2 self-end"><input type="checkbox" checked={form.expiryTracking} onChange={(event) => setForm({ ...form, expiryTracking: event.target.checked })} /><span className="text-sm font-medium">Expiry tracking</span></label>
          <button type="submit" className="md:col-span-3 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white">Save item</button>
        </form>
      )}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading inventory...</div> : items.length === 0 ? <div className="rounded-lg border border-hospiflow-200 bg-white p-8 text-center text-hospiflow-600">No inventory items found.</div> : (
        <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Item</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">SKU</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Category</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Unit</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Cost</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Reorder</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{items.map((item) => <tr key={item.id}><td className="px-5 py-3 text-sm">{item.name}</td><td className="px-5 py-3 text-sm">{item.sku}</td><td className="px-5 py-3 text-sm">{item.category || 'N/A'}</td><td className="px-5 py-3 text-sm">{item.unit}</td><td className="px-5 py-3 text-sm">KES {Number(item.unitCost || 0).toFixed(2)}</td><td className="px-5 py-3 text-sm">{Number(item.reorderLevel || 0) > 0 ? <span className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800">{item.reorderLevel}</span> : 'Not set'}</td></tr>)}</tbody></table></div></section>
      )}
    </ModuleShell>
  )
}
