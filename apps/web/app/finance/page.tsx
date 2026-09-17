'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

type Folio = {
  id: string
  folioNumber: string
  status: string
  balance: number | string
  guest?: { firstName?: string; lastName?: string }
  reservation?: { confirmationCode?: string }
}

type Payment = {
  id: string
  reference?: string
  paymentMethod?: string
  status?: string
  amount: number | string
  paidAt?: string
  order?: { orderNumber?: string }
}

export default function FinancePage() {
  const [sales, setSales] = useState<any>(null)
  const [occupancy, setOccupancy] = useState<any>(null)
  const [folios, setFolios] = useState<Folio[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showTransaction, setShowTransaction] = useState(false)
  const [transaction, setTransaction] = useState({ folioId: '', type: 'CHARGE', category: 'SERVICE', description: '', amount: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [salesResponse, occupancyResponse, folioResponse, paymentResponse] = await Promise.all([
        apiRequest<any>('/api/reports/sales?limit=50'),
        apiRequest<any>('/api/reports/occupancy'),
        apiRequest<Folio[]>('/api/folios?limit=50'),
        apiRequest<Payment[]>('/api/payments'),
      ])
      setSales(salesResponse.data)
      setOccupancy(occupancyResponse.data)
      setFolios(responseData(folioResponse))
      setPayments(responseData(paymentResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load finance data'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const submitTransaction = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest(`/api/folios/${transaction.folioId}/transactions`, { method: 'POST', body: JSON.stringify(transaction) })
      setTransaction({ folioId: '', type: 'CHARGE', category: 'SERVICE', description: '', amount: '' })
      setShowTransaction(false)
      setNotice('Folio transaction saved successfully.')
      await load()
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to save folio transaction'))
    }
  }

  return (
    <ModuleShell title="Finance" description="Track folios, payments, sales, and guest balances">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading finance workspace...</div> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Total sales</p><p className="mt-2 text-2xl font-bold">KES {Number(sales?.totalSales || 0).toFixed(2)}</p></div>
            <div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Orders</p><p className="mt-2 text-2xl font-bold">{sales?.totalOrders || 0}</p></div>
            <div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Open folios</p><p className="mt-2 text-2xl font-bold">{folios.filter((folio) => folio.status !== 'CLOSED').length}</p></div>
            <div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Occupancy</p><p className="mt-2 text-2xl font-bold">{occupancy?.occupancyRate || 0}%</p></div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowTransaction((value) => !value)} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">{showTransaction ? 'Close transaction form' : 'Add folio transaction'}</button>
            <button onClick={() => void load()} className="rounded-md border border-hospiflow-300 bg-white px-4 py-2 text-sm font-medium text-hospiflow-700">Refresh</button>
          </div>

          {showTransaction && (
            <form onSubmit={submitTransaction} className="rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 md:grid-cols-4">
              <h2 className="md:col-span-4 text-lg font-semibold">Folio transaction</h2>
              <label className="block"><span className="text-sm text-hospiflow-700">Folio</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={transaction.folioId} onChange={(event) => setTransaction({ ...transaction, folioId: event.target.value })}><option value="">Select folio</option>{folios.filter((folio) => folio.status !== 'CLOSED').map((folio) => <option key={folio.id} value={folio.id}>{folio.folioNumber} · {folio.guest?.firstName || ''} {folio.guest?.lastName || ''}</option>)}</select></label>
              <label className="block"><span className="text-sm text-hospiflow-700">Type</span><select className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={transaction.type} onChange={(event) => setTransaction({ ...transaction, type: event.target.value })}><option value="CHARGE">Charge</option><option value="PAYMENT">Payment</option><option value="DISCOUNT">Discount</option><option value="REFUND">Refund</option></select></label>
              <label className="block"><span className="text-sm text-hospiflow-700">Amount</span><input required type="number" min="0" step="0.01" className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={transaction.amount} onChange={(event) => setTransaction({ ...transaction, amount: event.target.value })} /></label>
              <label className="block"><span className="text-sm text-hospiflow-700">Description</span><input required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={transaction.description} onChange={(event) => setTransaction({ ...transaction, description: event.target.value })} /></label>
              <button type="submit" className="md:col-span-4 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white">Save transaction</button>
            </form>
          )}

          <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-hospiflow-200"><h2 className="text-lg font-semibold">Folios</h2></div>
            {folios.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No folios found.</p> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Folio</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Guest</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Reservation</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Balance</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Status</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{folios.map((folio) => <tr key={folio.id}><td className="px-5 py-3 text-sm">{folio.folioNumber}</td><td className="px-5 py-3 text-sm">{folio.guest?.firstName || ''} {folio.guest?.lastName || ''}</td><td className="px-5 py-3 text-sm">{folio.reservation?.confirmationCode || 'N/A'}</td><td className="px-5 py-3 text-sm">KES {Number(folio.balance || 0).toFixed(2)}</td><td className="px-5 py-3 text-sm"><span className="rounded bg-hospiflow-100 px-2 py-1 text-xs">{folio.status}</span></td></tr>)}</tbody></table></div>}
          </section>

          <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-hospiflow-200"><h2 className="text-lg font-semibold">Payments</h2></div>
            {payments.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No payments found.</p> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Reference</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Order</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Method</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Amount</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Status</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{payments.map((payment) => <tr key={payment.id}><td className="px-5 py-3 text-sm">{payment.reference || payment.id}</td><td className="px-5 py-3 text-sm">{payment.order?.orderNumber || 'N/A'}</td><td className="px-5 py-3 text-sm">{payment.paymentMethod || 'N/A'}</td><td className="px-5 py-3 text-sm">KES {Number(payment.amount || 0).toFixed(2)}</td><td className="px-5 py-3 text-sm"><span className="rounded bg-hospiflow-100 px-2 py-1 text-xs">{payment.status || 'N/A'}</span></td></tr>)}</tbody></table></div>}
          </section>
        </div>
      )}
    </ModuleShell>
  )
}
