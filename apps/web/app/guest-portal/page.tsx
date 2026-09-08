'use client'

import { useEffect, useState } from 'react'

export default function GuestPortalPage() {
  const [guestId, setGuestId] = useState('')
  const [reservations, setReservations] = useState([])
  const [folios, setFolios] = useState([])
  const [view, setView] = useState<'reservations' | 'folios'>('reservations')
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''

  const load = async () => {
    if (!guestId) return
    const res = await fetch(`/api/guest-portal/${view}?guestId=${guestId}`, { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (json.success) {
      if (view === 'reservations') setReservations(json.data)
      else setFolios(json.data)
    }
  }

  useEffect(() => { load() }, [view, guestId])

  return (
    <div className="min-h-screen bg-hospiflow-50 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-hospiflow-900 mb-6">Guest Portal</h1>
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <label className="block text-sm font-medium text-hospiflow-700 mb-2">Guest ID</label>
          <input className="border rounded p-2 w-full" value={guestId} onChange={e => setGuestId(e.target.value)} placeholder="Enter guest ID" />
          <div className="mt-4 space-x-2">
            <button onClick={() => setView('reservations')} className="px-4 py-2 rounded bg-primary-600 text-white">Reservations</button>
            <button onClick={() => setView('folios')} className="px-4 py-2 rounded bg-primary-600 text-white">Folios</button>
          </div>
        </div>
        {view === 'reservations' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-hospiflow-200">
              <thead className="bg-hospiflow-50">
                <tr><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Code</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Check-in</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Check-out</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Status</th></tr>
              </thead>
              <tbody className="bg-white divide-y divide-hospiflow-200">
                {reservations.map((r: any) => (
                  <tr key={r.id}><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-900">{r.confirmationCode}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{new Date(r.checkInDate).toLocaleDateString()}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{new Date(r.checkOutDate).toLocaleDateString()}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{r.status}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view === 'folios' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-hospiflow-200">
              <thead className="bg-hospiflow-50">
                <tr><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Folio</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Balance</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Status</th></tr>
              </thead>
              <tbody className="bg-white divide-y divide-hospiflow-200">
                {folios.map((f: any) => (
                  <tr key={f.id}><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-900">{f.folioNumber}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{f.balance}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{f.status}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
