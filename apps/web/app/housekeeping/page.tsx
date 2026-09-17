'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ propertyId: '', roomId: '', type: 'CLEANING', priority: 'NORMAL', notes: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [taskResponse, roomResponse, propertyResponse] = await Promise.all([apiRequest<any[]>('/api/housekeeping'), apiRequest<any[]>('/api/rooms?limit=200'), apiRequest<any[]>('/api/properties')])
      setTasks(responseData(taskResponse))
      setRooms(responseData(roomResponse))
      setProperties(responseData(propertyResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load housekeeping tasks'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/housekeeping', { method: 'POST', body: JSON.stringify(form) })
      setForm({ propertyId: '', roomId: '', type: 'CLEANING', priority: 'NORMAL', notes: '' })
      setShowForm(false)
      setNotice('Housekeeping task created.')
      await load()
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to create housekeeping task')) }
  }

  const update = async (task: any, status: string) => {
    setError('')
    try {
      await apiRequest(`/api/housekeeping/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setNotice('Housekeeping task updated.')
      await load()
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to update housekeeping task')) }
  }

  return (
    <ModuleShell title="Housekeeping" description="Assign and track room cleaning tasks">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}
      <div className="mb-5 flex justify-end"><button onClick={() => setShowForm((value) => !value)} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">{showForm ? 'Close form' : 'Create task'}</button></div>
      {showForm && <form onSubmit={submit} className="mb-6 rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 md:grid-cols-3"><h2 className="md:col-span-3 text-lg font-semibold">New housekeeping task</h2><label className="block"><span className="text-sm text-hospiflow-700">Property</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><label className="block"><span className="text-sm text-hospiflow-700">Room</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })}><option value="">Select room</option>{rooms.map((room) => <option key={room.id} value={room.id}>Room {room.roomNumber}</option>)}</select></label><label className="block"><span className="text-sm text-hospiflow-700">Type</span><select className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="CLEANING">Cleaning</option><option value="INSPECTION">Inspection</option><option value="TURNDOWN">Turndown</option><option value="DEEP_CLEAN">Deep clean</option></select></label><label className="block"><span className="text-sm text-hospiflow-700">Priority</span><select className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label><label className="md:col-span-2 block"><span className="text-sm text-hospiflow-700">Notes</span><textarea className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button type="submit" className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white self-end">Create task</button></form>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading housekeeping...</div> : tasks.length === 0 ? <div className="rounded-lg border border-hospiflow-200 bg-white p-8 text-center text-hospiflow-600">No housekeeping tasks found.</div> : <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Room</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Type</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Priority</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Status</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Actions</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{tasks.map((task) => <tr key={task.id}><td className="px-5 py-3 text-sm">Room {task.room?.roomNumber || task.roomId}</td><td className="px-5 py-3 text-sm">{task.type}</td><td className="px-5 py-3 text-sm">{task.priority}</td><td className="px-5 py-3 text-sm"><span className="rounded bg-hospiflow-100 px-2 py-1 text-xs">{task.status}</span></td><td className="px-5 py-3 text-sm">{task.status === 'PENDING' && <button onClick={() => void update(task, 'ASSIGNED')} className="rounded bg-primary-600 px-2 py-1 text-xs text-white">Assign</button>}{task.status === 'ASSIGNED' && <button onClick={() => void update(task, 'IN_PROGRESS')} className="rounded bg-yellow-600 px-2 py-1 text-xs text-white">Start</button>}{task.status === 'IN_PROGRESS' && <button onClick={() => void update(task, 'INSPECTION')} className="rounded bg-green-600 px-2 py-1 text-xs text-white">Complete</button>}{task.status === 'INSPECTION' && <button onClick={() => void update(task, 'VERIFIED')} className="rounded bg-hospiflow-600 px-2 py-1 text-xs text-white">Verify</button>}</td></tr>)}</tbody></table></div></section>}
    </ModuleShell>
  )
}
