'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [roomTypes, setRoomTypes] = useState<any[]>([])
  const [guests, setGuests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ propertyId: '', guestId: '', roomTypeId: '', roomId: '', checkInDate: '', checkOutDate: '', adults: 1, children: 0, rate: 0, specialRequests: '', notes: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [reservationResponse, propertyResponse, roomTypeResponse, guestResponse] = await Promise.all([
        apiRequest<any[]>('/api/reservations?limit=100'),
        apiRequest<any[]>('/api/properties'),
        apiRequest<any[]>('/api/room-types'),
        apiRequest<any[]>('/api/guests?limit=100'),
      ])
      setReservations(responseData(reservationResponse))
      setProperties(responseData(propertyResponse))
      setRoomTypes(responseData(roomTypeResponse))
      setGuests(responseData(guestResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load reservations'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/reservations', { method: 'POST', body: JSON.stringify(form) })
      setForm({ propertyId: '', guestId: '', roomTypeId: '', roomId: '', checkInDate: '', checkOutDate: '', adults: 1, children: 0, rate: 0, specialRequests: '', notes: '' })
      setShowForm(false)
      setNotice('Reservation created successfully.')
      await load()
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to create reservation'))
    }
  }

  const updateStatus = async (reservation: any, status: string) => {
    setError('')
    try {
      await apiRequest(`/api/reservations/${reservation.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setNotice(`Reservation ${reservation.confirmationCode} updated.`)
      await load()
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to update reservation'))
    }
  }

  return (
    <ModuleShell title="Reservations" description="Create bookings and manage the guest arrival workflow">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}
      <div className="mb-5 flex justify-end"><button onClick={() => setShowForm((value) => !value)} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">{showForm ? 'Close form' : 'New reservation'}</button></div>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 md:grid-cols-3">
          <h2 className="md:col-span-3 text-lg font-semibold">Reservation details</h2>
          <label className="block"><span className="text-sm text-hospiflow-700">Property</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
          <label className="block"><span className="text-sm text-hospiflow-700">Guest</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.guestId} onChange={(event) => setForm({ ...form, guestId: event.target.value })}><option value="">Select guest</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.firstName} {guest.lastName}</option>)}</select></label>
          <label className="block"><span className="text-sm text-hospiflow-700">Room type</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.roomTypeId} onChange={(event) => setForm({ ...form, roomTypeId: event.target.value })}><option value="">Select room type</option>{roomTypes.map((roomType) => <option key={roomType.id} value={roomType.id}>{roomType.name}</option>)}</select></label>
          <label className="block"><span className="text-sm text-hospiflow-700">Room (optional)</span><select className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })}><option value="">Unassigned</option>{roomTypes.flatMap((roomType) => roomType.rooms || []).map((room: any) => <option key={room.id} value={room.id}>Room {room.roomNumber}</option>)}</select></label>
          <label className="block"><span className="text-sm text-hospiflow-700">Check-in</span><input required type="date" className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.checkInDate} onChange={(event) => setForm({ ...form, checkInDate: event.target.value })} /></label>
          <label className="block"><span className="text-sm text-hospiflow-700">Check-out</span><input required type="date" className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.checkOutDate} onChange={(event) => setForm({ ...form, checkOutDate: event.target.value })} /></label>
          <label className="block"><span className="text-sm text-hospiflow-700">Adults</span><input required type="number" min="1" className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.adults} onChange={(event) => setForm({ ...form, adults: Number(event.target.value) })} /></label>
          <label className="block"><span className="text-sm text-hospiflow-700">Children</span><input type="number" min="0" className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.children} onChange={(event) => setForm({ ...form, children: Number(event.target.value) })} /></label>
          <label className="block"><span className="text-sm text-hospiflow-700">Rate</span><input type="number" min="0" step="0.01" className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.rate} onChange={(event) => setForm({ ...form, rate: Number(event.target.value) })} /></label>
          <label className="md:col-span-2 block"><span className="text-sm text-hospiflow-700">Special requests</span><textarea className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.specialRequests} onChange={(event) => setForm({ ...form, specialRequests: event.target.value })} /></label>
          <label className="md:col-span-3 block"><span className="text-sm text-hospiflow-700">Notes</span><textarea className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <button type="submit" className="md:col-span-3 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white">Create reservation</button>
        </form>
      )}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading reservations...</div> : reservations.length === 0 ? <div className="rounded-lg border border-hospiflow-200 bg-white p-8 text-center text-hospiflow-600">No reservations found.</div> : (
        <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Code</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Guest</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Check-in</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Check-out</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Status</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Actions</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{reservations.map((reservation) => <tr key={reservation.id}><td className="px-5 py-3 text-sm">{reservation.confirmationCode}</td><td className="px-5 py-3 text-sm">{reservation.guest?.firstName || ''} {reservation.guest?.lastName || ''}</td><td className="px-5 py-3 text-sm">{new Date(reservation.checkInDate).toLocaleDateString()}</td><td className="px-5 py-3 text-sm">{new Date(reservation.checkOutDate).toLocaleDateString()}</td><td className="px-5 py-3 text-sm"><span className="rounded bg-hospiflow-100 px-2 py-1 text-xs">{reservation.status}</span></td><td className="px-5 py-3 text-sm">{reservation.status === 'PENDING' && <button onClick={() => void updateStatus(reservation, 'CONFIRMED')} className="rounded bg-primary-600 px-2 py-1 text-xs text-white">Confirm</button>}{reservation.status === 'CONFIRMED' && <button onClick={() => void updateStatus(reservation, 'CHECKED_IN')} className="rounded bg-green-600 px-2 py-1 text-xs text-white">Check in</button>}{reservation.status === 'CHECKED_IN' && <button onClick={() => void updateStatus(reservation, 'CHECKED_OUT')} className="rounded bg-hospiflow-600 px-2 py-1 text-xs text-white">Check out</button>}{['PENDING', 'CONFIRMED'].includes(reservation.status) && <button onClick={() => void updateStatus(reservation, 'CANCELLED')} className="ml-2 rounded bg-red-600 px-2 py-1 text-xs text-white">Cancel</button>}</td></tr>)}</tbody></table></div></section>
      )}
    </ModuleShell>
  )
}
