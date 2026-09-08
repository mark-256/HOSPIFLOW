'use client'

import { useEffect, useState } from 'react'

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ propertyId: '', guestId: '', roomTypeId: '', roomId: '', checkInDate: '', checkOutDate: '', adults: 1, children: 0, rate: 0, specialRequests: '', notes: '' })

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''

  const fetchReservations = async () => {
    setLoading(true)
    const res = await fetch('/api/reservations', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (json.success) setReservations(json.data)
    setLoading(false)
  }

  useEffect(() => { void fetchReservations() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(form) })
    if (res.ok) { setShowForm(false); setForm({ propertyId: '', guestId: '', roomTypeId: '', roomId: '', checkInDate: '', checkOutDate: '', adults: 1, children: 0, rate: 0, specialRequests: '', notes: '' }); fetchReservations() }
  }

  return (
    <div className="min-h-screen bg-hospiflow-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-hospiflow-900">Reservations</h1>
          <button onClick={() => setShowForm(!showForm)} className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700">New Reservation</button>
        </div>
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="border rounded p-2" placeholder="Property ID" value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })} />
            <input className="border rounded p-2" placeholder="Guest ID" value={form.guestId} onChange={e => setForm({ ...form, guestId: e.target.value })} />
            <input className="border rounded p-2" placeholder="Room Type ID" value={form.roomTypeId} onChange={e => setForm({ ...form, roomTypeId: e.target.value })} />
            <input className="border rounded p-2" placeholder="Room ID (optional)" value={form.roomId} onChange={e => setForm({ ...form, roomId: e.target.value })} />
            <input className="border rounded p-2" type="date" placeholder="Check-in" value={form.checkInDate} onChange={e => setForm({ ...form, checkInDate: e.target.value })} />
            <input className="border rounded p-2" type="date" placeholder="Check-out" value={form.checkOutDate} onChange={e => setForm({ ...form, checkOutDate: e.target.value })} />
            <input className="border rounded p-2" type="number" placeholder="Adults" value={form.adults} onChange={e => setForm({ ...form, adults: parseInt(e.target.value) })} />
            <input className="border rounded p-2" type="number" placeholder="Children" value={form.children} onChange={e => setForm({ ...form, children: parseInt(e.target.value) })} />
            <input className="border rounded p-2" type="number" placeholder="Rate" value={form.rate} onChange={e => setForm({ ...form, rate: parseFloat(e.target.value) })} />
            <textarea className="border rounded p-2" placeholder="Special Requests" value={form.specialRequests} onChange={e => setForm({ ...form, specialRequests: e.target.value })} />
            <textarea className="border rounded p-2 md:col-span-2" placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            <button type="submit" className="md:col-span-2 bg-green-600 text-white py-2 rounded hover:bg-green-700">Create Reservation</button>
          </form>
        )}
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
          {loading && <p className="p-4 text-center text-hospiflow-600">Loading...</p>}
        </div>
      </div>
    </div>
  )
}
