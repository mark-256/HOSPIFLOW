'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

export default function RoomsPage() {
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [savingId, setSavingId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<any[]>('/api/rooms?limit=200')
      setRooms(responseData(response))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load rooms'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const updateStatus = async (roomId: string, status: string) => {
    setSavingId(roomId)
    setError('')
    try {
      await apiRequest(`/api/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setRooms((current) => current.map((room) => room.id === roomId ? { ...room, status } : room))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to update room status'))
    } finally {
      setSavingId('')
    }
  }

  return (
    <ModuleShell title="Rooms" description="View room inventory and update room status">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      <div className="mb-5 flex flex-wrap gap-2">
        {['ALL', 'AVAILABLE', 'OCCUPIED', 'DIRTY', 'CLEANING', 'RESERVED', 'OUT_OF_ORDER'].map((status) => <button key={status} onClick={() => setFilter(status)} className={`rounded-md border px-3 py-1 text-sm ${filter === status ? 'border-primary-600 bg-primary-600 text-white' : 'border-hospiflow-300 bg-white text-hospiflow-700'}`}>{status.replace('_', ' ')}</button>)}
      </div>
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading rooms...</div> : rooms.length === 0 ? <div className="rounded-lg border border-hospiflow-200 bg-white p-8 text-center text-hospiflow-600">No rooms are configured for this organization.</div> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.filter((room) => filter === 'ALL' || room.status === filter).map((room) => <div key={room.id} className="rounded-lg border border-hospiflow-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold">Room {room.roomNumber}</p><p className="text-sm text-hospiflow-600">{room.roomType?.name || 'Room type not set'}</p></div><span className={`rounded px-2 py-1 text-xs ${room.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' : room.status === 'OCCUPIED' ? 'bg-red-100 text-red-800' : 'bg-hospiflow-100 text-hospiflow-800'}`}>{room.status}</span></div>{room.floor && <p className="mt-3 text-sm text-hospiflow-600">Floor: {room.floor}</p>}{room.building && <p className="text-sm text-hospiflow-600">Building: {room.building}</p>}<select disabled={savingId === room.id} value={room.status} onChange={(event) => void updateStatus(room.id, event.target.value)} className="mt-4 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white text-sm"><option value="AVAILABLE">Available</option><option value="OCCUPIED">Occupied</option><option value="DIRTY">Dirty</option><option value="CLEANING">Cleaning</option><option value="INSPECTED">Inspected</option><option value="RESERVED">Reserved</option><option value="OUT_OF_ORDER">Out of order</option><option value="OUT_OF_SERVICE">Out of service</option></select></div>)}
        </div>
      )}
    </ModuleShell>
  )
}
