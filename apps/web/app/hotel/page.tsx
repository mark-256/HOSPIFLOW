'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

export default function HotelPage() {
  const [properties, setProperties] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [reservations, setReservations] = useState<any[]>([])
  const [guests, setGuests] = useState<any[]>([])
  const [folios, setFolios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [propertyResponse, roomResponse, reservationResponse, guestResponse, folioResponse] = await Promise.all([
        apiRequest<any[]>('/api/properties'),
        apiRequest<any[]>('/api/rooms?limit=100'),
        apiRequest<any[]>('/api/reservations?limit=10'),
        apiRequest<any[]>('/api/guests?limit=10'),
        apiRequest<any[]>('/api/folios?limit=10'),
      ])
      setProperties(responseData(propertyResponse))
      setRooms(responseData(roomResponse))
      setReservations(responseData(reservationResponse))
      setGuests(responseData(guestResponse))
      setFolios(responseData(folioResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load hotel operations'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const occupiedRooms = rooms.filter((room) => ['OCCUPIED', 'RESERVED'].includes(room.status)).length
  const dirtyRooms = rooms.filter((room) => ['DIRTY', 'CLEANING'].includes(room.status)).length
  const openFolios = folios.filter((folio) => folio.status !== 'CLOSED').length
  const upcoming = reservations.filter((reservation) => !['CANCELLED', 'CHECKED_OUT'].includes(reservation.status)).length

  return (
    <ModuleShell title="Hotel" description="Property operations, rooms, reservations, guests, and folios">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading hotel workspace...</div> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Properties</p><p className="mt-2 text-3xl font-bold">{properties.length}</p></div>
            <div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Rooms</p><p className="mt-2 text-3xl font-bold">{rooms.length}</p><p className="mt-1 text-xs text-hospiflow-600">{occupiedRooms} occupied · {dirtyRooms} needs attention</p></div>
            <div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Active reservations</p><p className="mt-2 text-3xl font-bold">{upcoming}</p></div>
            <div className="rounded-lg border border-hospiflow-200 bg-white p-5"><p className="text-sm text-hospiflow-600">Open folios</p><p className="mt-2 text-3xl font-bold">{openFolios}</p></div>
          </div>

          <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hospiflow-200 px-5 py-4">
              <h2 className="text-lg font-semibold">Properties</h2>
              <Link href="/settings" className="rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">Manage properties</Link>
            </div>
            {properties.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No properties are configured yet.</p> : (
              <div className="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">
                {properties.map((property) => (
                  <div key={property.id} className="rounded-lg border border-hospiflow-200 p-4">
                    <h3 className="font-semibold">{property.name}</h3>
                    <p className="mt-1 text-sm text-hospiflow-600">{property.code} · {property.city || 'Location not set'} · {property.country || ''}</p>
                    <p className="mt-3 text-xs text-hospiflow-500">{property._count?.rooms || 0} rooms · {property._count?.guests || 0} guests · {property._count?.outlets || 0} outlets</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-hospiflow-200 px-5 py-4"><h2 className="text-lg font-semibold">Recent reservations</h2><Link href="/reservations" className="text-sm font-medium text-primary-700">View all</Link></div>
              {reservations.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No reservations found.</p> : (
                <div className="divide-y divide-hospiflow-200">{reservations.map((reservation) => <div key={reservation.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium">{reservation.confirmationCode}</p><p className="text-xs text-hospiflow-600">{new Date(reservation.checkInDate).toLocaleDateString()} → {new Date(reservation.checkOutDate).toLocaleDateString()}</p></div><span className="rounded bg-hospiflow-100 px-2 py-1 text-xs">{reservation.status}</span></div>)}</div>
              )}
            </section>
            <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-hospiflow-200 px-5 py-4"><h2 className="text-lg font-semibold">Recent guests</h2><Link href="/guests" className="text-sm font-medium text-primary-700">View all</Link></div>
              {guests.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No guests found.</p> : (
                <div className="divide-y divide-hospiflow-200">{guests.map((guest) => <div key={guest.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="font-medium">{guest.firstName} {guest.lastName}</p><p className="text-xs text-hospiflow-600">{guest.email || guest.phone || 'No contact details'}</p></div>{guest.isVip && <span className="rounded bg-primary-100 px-2 py-1 text-xs text-primary-800">VIP</span>}</div>)}</div>
              )}
            </section>
          </div>
        </div>
      )}
    </ModuleShell>
  )
}
