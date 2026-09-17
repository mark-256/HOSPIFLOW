'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

type Supplier = {
  id: string
  name: string
  code: string
  contactPerson?: string
  email?: string
  phone?: string
  isActive?: boolean
}

type InventoryItem = {
  id: string
  name: string
  sku: string
  unit: string
  unitCost: number | string
}

type PurchaseOrder = {
  id: string
  orderNumber: string
  status: string
  supplier?: { name: string }
  total: number | string
  expectedDate?: string
  items?: { quantity: number; unitCost: number | string; inventoryItem?: { name: string } }[]
}

export default function ProcurementPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [supplierForm, setSupplierForm] = useState({ name: '', code: '', contactPerson: '', email: '', phone: '', paymentTerms: '', notes: '' })
  const [orderForm, setOrderForm] = useState({ supplierId: '', expectedDate: '', notes: '', items: [{ inventoryItemId: '', quantity: 1, unitCost: '' }] })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [supplierResponse, itemResponse, orderResponse] = await Promise.all([
        apiRequest<Supplier[]>('/api/suppliers'),
        apiRequest<InventoryItem[]>('/api/inventory?limit=100'),
        apiRequest<PurchaseOrder[]>('/api/purchase-orders'),
      ])
      setSuppliers(responseData(supplierResponse))
      setItems(responseData(itemResponse))
      setOrders(responseData(orderResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load procurement data'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const submitSupplier = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/suppliers', { method: 'POST', body: JSON.stringify(supplierForm) })
      setSupplierForm({ name: '', code: '', contactPerson: '', email: '', phone: '', paymentTerms: '', notes: '' })
      setShowSupplierForm(false)
      setNotice('Supplier saved successfully.')
      await load()
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to save supplier'))
    }
  }

  const updateOrderItem = (index: number, field: string, value: string | number) => {
    setOrderForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }))
  }

  const submitOrder = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/purchase-orders', { method: 'POST', body: JSON.stringify(orderForm) })
      setOrderForm({ supplierId: '', expectedDate: '', notes: '', items: [{ inventoryItemId: '', quantity: 1, unitCost: '' }] })
      setShowOrderForm(false)
      setNotice('Purchase order created successfully.')
      await load()
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to create purchase order'))
    }
  }

  const updateOrderStatus = async (order: PurchaseOrder, status: string) => {
    setError('')
    try {
      await apiRequest(`/api/purchase-orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setNotice(`Purchase order ${order.orderNumber} updated.`)
      await load()
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to update purchase order'))
    }
  }

  return (
    <ModuleShell title="Procurement" description="Manage suppliers, stock requests, and purchase orders">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading procurement workspace...</div> : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowSupplierForm((value) => !value)} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">{showSupplierForm ? 'Close supplier form' : 'Add supplier'}</button>
            <button onClick={() => setShowOrderForm((value) => !value)} className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">{showOrderForm ? 'Close order form' : 'Create purchase order'}</button>
            <button onClick={() => void load()} className="rounded-md border border-hospiflow-300 bg-white px-4 py-2 text-sm font-medium text-hospiflow-700">Refresh</button>
          </div>

          {showSupplierForm && (
            <form onSubmit={submitSupplier} className="rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 md:grid-cols-2">
              <h2 className="md:col-span-2 text-lg font-semibold">New supplier</h2>
              {[['name', 'Supplier name'], ['code', 'Code'], ['contactPerson', 'Contact person'], ['email', 'Email'], ['phone', 'Phone'], ['paymentTerms', 'Payment terms']].map(([field, label]) => <label key={field} className="block"><span className="text-sm text-hospiflow-700">{label}</span><input required={field === 'name' || field === 'code'} className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={(supplierForm as any)[field]} onChange={(event) => setSupplierForm({ ...supplierForm, [field]: event.target.value })} /></label>)}
              <label className="md:col-span-2 block"><span className="text-sm text-hospiflow-700">Notes</span><textarea className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={supplierForm.notes} onChange={(event) => setSupplierForm({ ...supplierForm, notes: event.target.value })} /></label>
              <button className="md:col-span-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white" type="submit">Save supplier</button>
            </form>
          )}

          {showOrderForm && (
            <form onSubmit={submitOrder} className="rounded-lg border border-hospiflow-200 bg-white p-5 space-y-4">
              <h2 className="text-lg font-semibold">New purchase order</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block"><span className="text-sm text-hospiflow-700">Supplier</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={orderForm.supplierId} onChange={(event) => setOrderForm({ ...orderForm, supplierId: event.target.value })}><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Expected date</span><input type="date" className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={orderForm.expectedDate} onChange={(event) => setOrderForm({ ...orderForm, expectedDate: event.target.value })} /></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Notes</span><input className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={orderForm.notes} onChange={(event) => setOrderForm({ ...orderForm, notes: event.target.value })} /></label>
              </div>
              <div className="rounded-lg border border-hospiflow-200 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 bg-hospiflow-50 px-3 py-2 text-xs font-medium uppercase text-hospiflow-600"><div className="col-span-5">Inventory item</div><div className="col-span-2">Quantity</div><div className="col-span-3">Unit cost</div><div className="col-span-2" /></div>
                {orderForm.items.map((item, index) => <div key={index} className="grid grid-cols-12 gap-2 p-3 border-t border-hospiflow-200"><select className="col-span-5 rounded-md border border-hospiflow-300 px-2 py-2 bg-white" value={item.inventoryItemId} onChange={(event) => updateOrderItem(index, 'inventoryItemId', event.target.value)}><option value="">Select item</option>{items.map((inventoryItem) => <option key={inventoryItem.id} value={inventoryItem.id}>{inventoryItem.name} · {inventoryItem.sku}</option>)}</select><input type="number" min="1" className="col-span-2 rounded-md border border-hospiflow-300 px-2 py-2" value={item.quantity} onChange={(event) => updateOrderItem(index, 'quantity', Number(event.target.value))} /><input type="number" min="0" step="0.01" className="col-span-3 rounded-md border border-hospiflow-300 px-2 py-2" value={item.unitCost} onChange={(event) => updateOrderItem(index, 'unitCost', event.target.value)} /><button type="button" onClick={() => setOrderForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} className="col-span-2 rounded-md border border-red-200 text-red-700">Remove</button></div>)}
              </div>
              <div className="flex gap-3"><button type="button" onClick={() => setOrderForm((current) => ({ ...current, items: [...current.items, { inventoryItemId: '', quantity: 1, unitCost: '' }] }))} className="rounded-md border border-hospiflow-300 px-4 py-2">Add item</button><button type="submit" className="rounded-md bg-green-600 px-4 py-2 text-white">Create order</button></div>
            </form>
          )}

          <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-hospiflow-200"><h2 className="text-lg font-semibold">Suppliers</h2></div>
            {suppliers.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No suppliers have been added.</p> : <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-3">{suppliers.map((supplier) => <div key={supplier.id} className="rounded-lg border border-hospiflow-200 p-4"><p className="font-medium">{supplier.name}</p><p className="mt-1 text-xs text-hospiflow-600">{supplier.code}{supplier.contactPerson ? ` · ${supplier.contactPerson}` : ''}</p><p className="mt-1 text-xs text-hospiflow-600">{supplier.phone || supplier.email || 'No contact details'}</p></div>)}</div>}
          </section>

          <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-hospiflow-200"><h2 className="text-lg font-semibold">Purchase orders</h2></div>
            {orders.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No purchase orders have been created.</p> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Order</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Supplier</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Status</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Total</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Actions</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{orders.map((order) => <tr key={order.id}><td className="px-5 py-3 text-sm">{order.orderNumber}</td><td className="px-5 py-3 text-sm">{order.supplier?.name || 'N/A'}</td><td className="px-5 py-3 text-sm"><span className="rounded bg-hospiflow-100 px-2 py-1 text-xs">{order.status}</span></td><td className="px-5 py-3 text-sm">KES {Number(order.total || 0).toFixed(2)}</td><td className="px-5 py-3 text-sm">{order.status === 'DRAFT' && <button onClick={() => void updateOrderStatus(order, 'SUBMITTED')} className="rounded bg-primary-600 px-2 py-1 text-xs text-white">Submit</button>}{order.status === 'SUBMITTED' && <button onClick={() => void updateOrderStatus(order, 'APPROVED')} className="rounded bg-green-600 px-2 py-1 text-xs text-white">Approve</button>}{order.status === 'APPROVED' && <button onClick={() => void updateOrderStatus(order, 'ORDERED')} className="rounded bg-primary-600 px-2 py-1 text-xs text-white">Order</button>}{order.status === 'ORDERED' && <button onClick={() => void updateOrderStatus(order, 'RECEIVED')} className="rounded bg-green-600 px-2 py-1 text-xs text-white">Receive</button>}{order.status === 'RECEIVED' && <button onClick={() => void updateOrderStatus(order, 'CLOSED')} className="rounded bg-hospiflow-600 px-2 py-1 text-xs text-white">Close</button>}</td></tr>)}</tbody></table></div>}</section>
        </div>
      )}
    </ModuleShell>
  )
}
