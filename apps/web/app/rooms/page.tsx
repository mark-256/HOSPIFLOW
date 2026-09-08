'use client'

import { useEffect, useState } from 'react'

export default function RoomsPage() {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''

  const fetchRooms = async () => {
    setLoading(true)
    const res = await fetch('/api/rooms', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (json.success) setRooms(json.data)
    setLoading(false)
  }

  useEffect(() => { void fetchRooms() }, [])

  return (
    <div className="min-h-screen bg-hospiflow-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-hospiflow-900 mb-6">Rooms</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room: any) => (
            <div key={room.id} className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-hospiflow-900">Room {room.roomNumber}</h3>
              <p className="text-sm text-hospiflow-600">Type: {room.roomType?.name || 'N/A'}</p>
              <p className="text-sm text-hospiflow-600">Status: {room.status}</p>
              {room.floor && <p className="text-sm text-hospiflow-600">Floor: {room.floor}</p>}
            </div>
          ))}
        </div>
        {loading && <p className="text-center text-hospiflow-600">Loading...</p>}
      </div>
    </div>
  )
}
