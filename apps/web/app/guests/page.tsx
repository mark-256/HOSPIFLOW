'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

export default function GuestsPage() {
  const [guests, setGuests] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ propertyId: '', firstName: '', lastName: '', email: '', phone: '', nationality: '', idNumber: '', idType: '', address: '', city: '', country: '', isVip: false })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [guestResponse, propertyResponse] = await Promise.all([apiRequest<any[]>('/api/guests?limit=200'), apiRequest<any[]>('/api/properties')])
      setGuests(responseData(guestResponse))
      setProperties(responseData(propertyResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load guests'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/guests', { method: 'POST', body: JSON.stringify(form) })
      setForm({ propertyId: '', firstName: '', lastName: '', email: '', phone: '', nationality: '', idNumber: '', idType: '', address: '', city: '', country: '', isVip: false })
      setShowForm(false)
      setNotice('Guest saved successfully.')
      await load()
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to save guest'))
    }
  }

  return (
    <ModuleShell title="Guests" description="Manage guest profiles, contact details, and VIP status">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}
      <div className="mb-5 flex justify-end"><button onClick={() => setShowForm((value) => !value)} className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">{showForm ? 'Close form' : 'Add guest'}</button></div>
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 md:grid-cols-3">
          <h2 className="md:col-span-3 text-lg font-semibold">Guest details</h2>
          <label className="block"><span className="text-sm text-hospiflow-700">Property</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
          {[['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['phone', 'Phone'], ['nationality', 'Nationality'], ['idNumber', 'ID number'], ['idType', 'ID type'], ['city', 'City'], ['country', 'Country']].map(([field, label]) => <label key={field} className="block"><span className="text-sm text-hospiflow-700">{label}</span><input required={field === 'firstName' || field === 'lastName'} className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={(form as any)[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>)}
          <label className="md:col-span-2 block"><span className="text-sm text-hospiflow-700">Address</span><input className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
          <label className="flex items-center gap-2 self-end"><input type="checkbox" checked={form.isVip} onChange={(event) => setForm({ ...form, isVip: event.target.checked })} /><span className="text-sm font-medium">VIP guest</span></label>
          <button type="submit" className="md:col-span-3 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white">Save guest</button>
        </form>
      )}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading guests...</div> : guests.length === 0 ? <div className="rounded-lg border border-hospiflow-200 bg-white p-8 text-center text-hospiflow-600">No guests found.</div> : (
        <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Name</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Contact</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Property</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">VIP</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{guests.map((guest) => <tr key={guest.id}><td className="px-5 py-3 text-sm">{guest.firstName} {guest.lastName}</td><td className="px-5 py-3 text-sm">{guest.email || guest.phone || 'N/A'}</td><td className="px-5 py-3 text-sm">{guest.property?.name || guest.propertyId}</td><td className="px-5 py-3 text-sm">{guest.isVip ? <span className="rounded bg-primary-100 px-2 py-1 text-xs text-primary-800">Yes</span> : 'No'}</td></tr>)}</tbody></table></div></section>
      )}
    </ModuleShell>
  )
}
