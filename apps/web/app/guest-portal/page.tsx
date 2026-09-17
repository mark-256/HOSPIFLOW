'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

export default function GuestPortalPage() {
  const [guestId, setGuestId] = useState('')
  const [reservations, setReservations] = useState<any[]>([])
  const [folios, setFolios] = useState<any[]>([])
  const [view, setView] = useState<'reservations' | 'folios'>('reservations')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!guestId) {
      setReservations([])
      setFolios([])
      setError('')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<any[]>(`/api/guest-portal/${view}?guestId=${encodeURIComponent(guestId)}`)
      if (view === 'reservations') setReservations(responseData(response))
      else setFolios(responseData(response))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load guest portal data'))
    } finally {
      setLoading(false)
    }
  }, [guestId, view])

  useEffect(() => { void load() }, [load])

  return (
    <ModuleShell title="Guest Portal" description="View a guest’s reservations and folios">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      <section className="rounded-lg border border-hospiflow-200 bg-white p-5"><label className="block text-sm font-medium text-hospiflow-700">Guest ID</label><input className="mt-2 w-full rounded-md border border-hospiflow-300 px-3 py-2" placeholder="Enter guest ID" value={guestId} onChange={(event) => setGuestId(event.target.value)} /><div className="mt-4 flex gap-2"><button onClick={() => setView('reservations')} className={`rounded-md px-4 py-2 text-sm font-medium ${view === 'reservations' ? 'bg-primary-600 text-white' : 'border border-hospiflow-300 text-hospiflow-700'}`}>Reservations</button><button onClick={() => setView('folios')} className={`rounded-md px-4 py-2 text-sm font-medium ${view === 'folios' ? 'bg-primary-600 text-white' : 'border border-hospiflow-300 text-hospiflow-700'}`}>Folios</button></div></section>
      {loading ? <div className="mt-6 flex min-h-[200px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading guest data...</div> : !guestId ? <div className="mt-6 rounded-lg border border-dashed border-hospiflow-300 bg-white p-8 text-center text-hospiflow-600">Enter a guest ID to view their portal.</div> : view === 'reservations' ? <section className="mt-6 rounded-lg border border-hospiflow-200 bg-white overflow-hidden">{reservations.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No reservations found.</p> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Code</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Check-in</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Check-out</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Status</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{reservations.map((reservation) => <tr key={reservation.id}><td className="px-5 py-3 text-sm">{reservation.confirmationCode}</td><td className="px-5 py-3 text-sm">{new Date(reservation.checkInDate).toLocaleDateString()}</td><td className="px-5 py-3 text-sm">{new Date(reservation.checkOutDate).toLocaleDateString()}</td><td className="px-5 py-3 text-sm">{reservation.status}</td></tr>)}</tbody></table></div>}</section> : <section className="mt-6 rounded-lg border border-hospiflow-200 bg-white overflow-hidden">{folios.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No folios found.</p> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Folio</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Balance</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Status</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{folios.map((folio) => <tr key={folio.id}><td className="px-5 py-3 text-sm">{folio.folioNumber}</td><td className="px-5 py-3 text-sm">KES {Number(folio.balance || 0).toFixed(2)}</td><td className="px-5 py-3 text-sm">{folio.status}</td></tr>)}</tbody></table></div>}</section>}
    </ModuleShell>
  )
}
