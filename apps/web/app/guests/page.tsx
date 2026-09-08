'use client'

import { useEffect, useState } from 'react'

export default function GuestsPage() {
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ propertyId: '', firstName: '', lastName: '', email: '', phone: '', nationality: '', idNumber: '', idType: '', address: '', city: '', country: '', isVip: false })

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''

  const fetchGuests = async () => {
    setLoading(true)
    const res = await fetch('/api/guests', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (json.success) setGuests(json.data)
    setLoading(false)
  }

  useEffect(() => { void fetchGuests() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/guests', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(form) })
    if (res.ok) { setShowForm(false); setForm({ propertyId: '', firstName: '', lastName: '', email: '', phone: '', nationality: '', idNumber: '', idType: '', address: '', city: '', country: '', isVip: false }); fetchGuests() }
  }

  return (
    <div className="min-h-screen bg-hospiflow-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-hospiflow-900">Guests</h1>
          <button onClick={() => setShowForm(!showForm)} className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700">Add Guest</button>
        </div>
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="border rounded p-2" placeholder="Property ID" value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value })} />
            <input className="border rounded p-2" placeholder="First Name" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            <input className="border rounded p-2" placeholder="Last Name" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
            <input className="border rounded p-2" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input className="border rounded p-2" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <input className="border rounded p-2" placeholder="Nationality" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} />
            <input className="border rounded p-2" placeholder="ID Number" value={form.idNumber} onChange={e => setForm({ ...form, idNumber: e.target.value })} />
            <input className="border rounded p-2" placeholder="ID Type" value={form.idType} onChange={e => setForm({ ...form, idType: e.target.value })} />
            <input className="border rounded p-2" placeholder="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            <input className="border rounded p-2" placeholder="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
            <input className="border rounded p-2" placeholder="Country" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} />
            <label className="flex items-center space-x-2"><input type="checkbox" checked={form.isVip} onChange={e => setForm({ ...form, isVip: e.target.checked })} /><span>VIP</span></label>
            <button type="submit" className="md:col-span-2 bg-green-600 text-white py-2 rounded hover:bg-green-700">Save Guest</button>
          </form>
        )}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-hospiflow-200">
            <thead className="bg-hospiflow-50">
              <tr><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Name</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Contact</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">VIP</th></tr>
            </thead>
            <tbody className="bg-white divide-y divide-hospiflow-200">
              {guests.map((g: any) => (
                <tr key={g.id}><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-900">{g.firstName} {g.lastName}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{g.email || g.phone}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{g.isVip ? 'Yes' : 'No'}</td></tr>
              ))}
            </tbody>
          </table>
          {loading && <p className="p-4 text-center text-hospiflow-600">Loading...</p>}
        </div>
      </div>
    </div>
  )
}
