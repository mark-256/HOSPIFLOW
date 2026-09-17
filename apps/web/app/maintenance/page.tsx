'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ propertyId: '', roomId: '', title: '', description: '', priority: 'MEDIUM', category: 'GENERAL' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ticketResponse, roomResponse, propertyResponse] = await Promise.all([apiRequest<any[]>('/api/maintenance'), apiRequest<any[]>('/api/rooms?limit=200'), apiRequest<any[]>('/api/properties')])
      setTickets(responseData(ticketResponse))
      setRooms(responseData(roomResponse))
      setProperties(responseData(propertyResponse))
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to load maintenance tickets')) } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/maintenance', { method: 'POST', body: JSON.stringify(form) })
      setForm({ propertyId: '', roomId: '', title: '', description: '', priority: 'MEDIUM', category: 'GENERAL' })
      setShowForm(false)
      setNotice('Maintenance ticket created.')
      await load()
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to create maintenance ticket')) }
  }

  const update = async (ticket: any, status: string) => {
    setError('')
    try {
      await apiRequest(`/api/maintenance/${ticket.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setNotice('Maintenance ticket updated.')
      await load()
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to update maintenance ticket')) }
  }

  return (
    <ModuleShell title="Maintenance" description="Log and resolve property maintenance tickets">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}
      <div className="mb-5 flex justify-end"><button onClick={() => setShowForm((value) => !value)} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">{showForm ? 'Close form' : 'Create ticket'}</button></div>
      {showForm && <form onSubmit={submit} className="mb-6 rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 md:grid-cols-3"><h2 className="md:col-span-3 text-lg font-semibold">New maintenance ticket</h2><label className="block"><span className="text-sm text-hospiflow-700">Property</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><label className="block"><span className="text-sm text-hospiflow-700">Room</span><select className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })}><option value="">General property</option>{rooms.map((room) => <option key={room.id} value={room.id}>Room {room.roomNumber}</option>)}</select></label><label className="block"><span className="text-sm text-hospiflow-700">Priority</span><select className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label><label className="md:col-span-2 block"><span className="text-sm text-hospiflow-700">Title</span><input required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="md:col-span-3 block"><span className="text-sm text-hospiflow-700">Description</span><textarea required rows={3} className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><button type="submit" className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white self-end">Create ticket</button></form>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading maintenance...</div> : tickets.length === 0 ? <div className="rounded-lg border border-hospiflow-200 bg-white p-8 text-center text-hospiflow-600">No maintenance tickets found.</div> : <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Title</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Room</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Priority</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Status</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Actions</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{tickets.map((ticket) => <tr key={ticket.id}><td className="px-5 py-3 text-sm">{ticket.title}</td><td className="px-5 py-3 text-sm">{ticket.room?.roomNumber || ticket.roomId || 'Property'}</td><td className="px-5 py-3 text-sm">{ticket.priority}</td><td className="px-5 py-3 text-sm"><span className="rounded bg-hospiflow-100 px-2 py-1 text-xs">{ticket.status}</span></td><td className="px-5 py-3 text-sm">{ticket.status === 'OPEN' && <button onClick={() => void update(ticket, 'ASSIGNED')} className="rounded bg-primary-600 px-2 py-1 text-xs text-white">Assign</button>}{ticket.status === 'ASSIGNED' && <button onClick={() => void update(ticket, 'IN_PROGRESS')} className="rounded bg-yellow-600 px-2 py-1 text-xs text-white">Start</button>}{['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'].includes(ticket.status) && <button onClick={() => void update(ticket, 'RESOLVED')} className="ml-2 rounded bg-green-600 px-2 py-1 text-xs text-white">Resolve</button>}{ticket.status === 'RESOLVED' && <button onClick={() => void update(ticket, 'CLOSED')} className="rounded bg-hospiflow-600 px-2 py-1 text-xs text-white">Close</button>}</td></tr>)}</tbody></table></div></section>}
    </ModuleShell>
  )
}
