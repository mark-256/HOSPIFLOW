'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

type Property = { id: string; name: string; code: string; city?: string; country?: string; currency?: string; status?: string }
type Outlet = { id: string; name: string; code: string; type: string; status?: string; propertyId: string }
type Terminal = { id: string; name: string; code: string; status?: string; outletId: string }
type User = { id: string; email: string; firstName: string; lastName: string; role?: { id: string; name: string }; isActive?: boolean }

export default function SettingsPage() {
  const [tab, setTab] = useState<'organization' | 'properties' | 'outlets' | 'terminals' | 'users'>('organization')
  const [organization, setOrganization] = useState<any>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [terminals, setTerminals] = useState<Terminal[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [propertyForm, setPropertyForm] = useState({ name: '', code: '', city: '', country: '', currency: 'KES', timezone: 'Africa/Nairobi' })
  const [outletForm, setOutletForm] = useState({ propertyId: '', name: '', code: '', type: 'RESTAURANT' })
  const [terminalForm, setTerminalForm] = useState({ outletId: '', name: '', code: '' })
  const [userForm, setUserForm] = useState({ roleId: '', email: '', password: '', firstName: '', lastName: '', phone: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [organizationResponse, propertyResponse, outletResponse, terminalResponse, userResponse] = await Promise.all([
        apiRequest<any[]>('/api/organizations'),
        apiRequest<Property[]>('/api/properties'),
        apiRequest<Outlet[]>('/api/outlets'),
        apiRequest<Terminal[]>('/api/terminals'),
        apiRequest<User[]>('/api/users'),
      ])
      const nextProperties = responseData(propertyResponse)
      const nextUsers = responseData(userResponse)
      setOrganization(responseData(organizationResponse)[0] || null)
      setProperties(nextProperties)
      setOutlets(responseData(outletResponse))
      setTerminals(responseData(terminalResponse))
      setUsers(nextUsers)
      setOutletForm((current) => ({ ...current, propertyId: current.propertyId || nextProperties[0]?.id || '' }))
      setUserForm((current) => ({ ...current, roleId: current.roleId || nextUsers[0]?.role?.id || '' }))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load settings'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const submitProperty = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/properties', { method: 'POST', body: JSON.stringify(propertyForm) })
      setPropertyForm({ name: '', code: '', city: '', country: '', currency: 'KES', timezone: 'Africa/Nairobi' })
      setNotice('Property saved successfully.')
      await load()
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to save property')) }
  }

  const submitOutlet = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/outlets', { method: 'POST', body: JSON.stringify(outletForm) })
      setOutletForm({ propertyId: properties[0]?.id || '', name: '', code: '', type: 'RESTAURANT' })
      setNotice('Outlet saved successfully.')
      await load()
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to save outlet')) }
  }

  const submitTerminal = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/terminals', { method: 'POST', body: JSON.stringify(terminalForm) })
      setTerminalForm({ outletId: outlets[0]?.id || '', name: '', code: '' })
      setNotice('Terminal saved successfully.')
      await load()
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to save terminal')) }
  }

  const submitUser = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await apiRequest('/api/users', { method: 'POST', body: JSON.stringify(userForm) })
      setUserForm({ roleId: users[0]?.role?.id || '', email: '', password: '', firstName: '', lastName: '', phone: '' })
      setNotice('User saved successfully.')
      await load()
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to save user')) }
  }

  const roleMap = new Map<string, { id: string; name: string }>()
  for (const user of users) {
    if (user.role) roleMap.set(user.role.id, user.role)
  }
  const roles = Array.from(roleMap.entries())
  const tabs = [
    ['organization', 'Organization'],
    ['properties', 'Properties'],
    ['outlets', 'Outlets'],
    ['terminals', 'Terminals'],
    ['users', 'Users'],
  ] as const

  return (
    <ModuleShell title="Settings" description="Configure the organization, properties, outlets, terminals, and users">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading settings...</div> : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 border-b border-hospiflow-200">
            {tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`rounded-t-md px-4 py-2 text-sm font-medium ${tab === value ? 'bg-white text-primary-700 border-b-2 border-primary-600' : 'text-hospiflow-600 hover:text-hospiflow-900'}`}>{label}</button>)}
          </div>

          {tab === 'organization' && (
            <section className="rounded-lg border border-hospiflow-200 bg-white p-5 space-y-4">
              <h2 className="text-lg font-semibold">Organization profile</h2>
              <div className="grid gap-4 md:grid-cols-2"><div><p className="text-sm text-hospiflow-600">Name</p><p className="font-medium">{organization?.name || 'Not configured'}</p></div><div><p className="text-sm text-hospiflow-600">Slug</p><p className="font-medium">{organization?.slug || 'Not configured'}</p></div><div><p className="text-sm text-hospiflow-600">Status</p><p className="font-medium">{organization?.status || 'Not configured'}</p></div><div><p className="text-sm text-hospiflow-600">Created</p><p className="font-medium">{organization?.createdAt ? new Date(organization.createdAt).toLocaleDateString() : 'Not configured'}</p></div></div>
              <p className="rounded-md bg-hospiflow-50 p-3 text-sm text-hospiflow-700">Organization-wide permissions and integrations are applied to every property and outlet.</p>
            </section>
          )}

          {tab === 'properties' && (
            <div className="space-y-6">
              <form onSubmit={submitProperty} className="rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 md:grid-cols-3">
                <h2 className="md:col-span-3 text-lg font-semibold">Add property</h2>
                {[['name', 'Name'], ['code', 'Code'], ['city', 'City'], ['country', 'Country']].map(([field, label]) => <label key={field} className="block"><span className="text-sm text-hospiflow-700">{label}</span><input required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={(propertyForm as any)[field]} onChange={(event) => setPropertyForm({ ...propertyForm, [field]: event.target.value })} /></label>)}
                <label className="block"><span className="text-sm text-hospiflow-700">Currency</span><select className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={propertyForm.currency} onChange={(event) => setPropertyForm({ ...propertyForm, currency: event.target.value })}><option value="KES">KES</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Timezone</span><input className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={propertyForm.timezone} onChange={(event) => setPropertyForm({ ...propertyForm, timezone: event.target.value })} /></label>
                <button type="submit" className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white self-end">Save property</button>
              </form>
              <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">{properties.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No properties configured.</p> : <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-3">{properties.map((property) => <div key={property.id} className="rounded-lg border border-hospiflow-200 p-4"><p className="font-medium">{property.name}</p><p className="mt-1 text-xs text-hospiflow-600">{property.code} · {property.city || ''} · {property.country || ''}</p><p className="mt-2 text-xs"><span className="rounded bg-hospiflow-100 px-2 py-1">{property.status}</span></p></div>)}</div>}</section>
            </div>
          )}

          {tab === 'outlets' && (
            <div className="space-y-6">
              <form onSubmit={submitOutlet} className="rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 md:grid-cols-4">
                <h2 className="md:col-span-4 text-lg font-semibold">Add outlet</h2>
                <label className="block"><span className="text-sm text-hospiflow-700">Property</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={outletForm.propertyId} onChange={(event) => setOutletForm({ ...outletForm, propertyId: event.target.value })}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Name</span><input required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={outletForm.name} onChange={(event) => setOutletForm({ ...outletForm, name: event.target.value })} /></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Code</span><input required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={outletForm.code} onChange={(event) => setOutletForm({ ...outletForm, code: event.target.value })} /></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Type</span><select className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={outletForm.type} onChange={(event) => setOutletForm({ ...outletForm, type: event.target.value })}><option value="RESTAURANT">Restaurant</option><option value="BAR">Bar</option><option value="CAFE">Cafe</option><option value="ROOM_SERVICE">Room service</option><option value="POOL_BAR">Pool bar</option></select></label>
                <button type="submit" className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white self-end">Save outlet</button>
              </form>
              <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">{outlets.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No outlets configured.</p> : <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-3">{outlets.map((outlet) => <div key={outlet.id} className="rounded-lg border border-hospiflow-200 p-4"><p className="font-medium">{outlet.name}</p><p className="mt-1 text-xs text-hospiflow-600">{outlet.code} · {outlet.type}</p></div>)}</div>}</section>
            </div>
          )}

          {tab === 'terminals' && (
            <div className="space-y-6">
              <form onSubmit={submitTerminal} className="rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 md:grid-cols-3">
                <h2 className="md:col-span-3 text-lg font-semibold">Add terminal</h2>
                <label className="block"><span className="text-sm text-hospiflow-700">Outlet</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={terminalForm.outletId} onChange={(event) => setTerminalForm({ ...terminalForm, outletId: event.target.value })}><option value="">Select outlet</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Name</span><input required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={terminalForm.name} onChange={(event) => setTerminalForm({ ...terminalForm, name: event.target.value })} /></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Code</span><input required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={terminalForm.code} onChange={(event) => setTerminalForm({ ...terminalForm, code: event.target.value })} /></label>
                <button type="submit" className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white self-end">Save terminal</button>
              </form>
              <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">{terminals.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No terminals configured.</p> : <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-3">{terminals.map((terminal) => <div key={terminal.id} className="rounded-lg border border-hospiflow-200 p-4"><p className="font-medium">{terminal.name}</p><p className="mt-1 text-xs text-hospiflow-600">{terminal.code} · {terminal.status}</p></div>)}</div>}</section>
            </div>
          )}

          {tab === 'users' && (
            <div className="space-y-6">
              <form onSubmit={submitUser} className="rounded-lg border border-hospiflow-200 bg-white p-5 grid gap-4 md:grid-cols-3">
                <h2 className="md:col-span-3 text-lg font-semibold">Add user</h2>
                <label className="block"><span className="text-sm text-hospiflow-700">Role</span><select required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={userForm.roleId} onChange={(event) => setUserForm({ ...userForm, roleId: event.target.value })}><option value="">Select role</option>{roles.map(([id, role]) => <option key={id} value={id}>{role.name}</option>)}</select></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Email</span><input required type="email" className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} /></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Password</span><input required type="password" className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} /></label>
                <label className="block"><span className="text-sm text-hospiflow-700">First name</span><input required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={userForm.firstName} onChange={(event) => setUserForm({ ...userForm, firstName: event.target.value })} /></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Last name</span><input required className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={userForm.lastName} onChange={(event) => setUserForm({ ...userForm, lastName: event.target.value })} /></label>
                <label className="block"><span className="text-sm text-hospiflow-700">Phone</span><input className="mt-1 w-full rounded-md border border-hospiflow-300 px-3 py-2" value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} /></label>
                <button type="submit" className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white self-end">Save user</button>
              </form>
              <section className="rounded-lg border border-hospiflow-200 bg-white overflow-hidden">{users.length === 0 ? <p className="p-5 text-sm text-hospiflow-600">No users found.</p> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-hospiflow-200"><thead className="bg-hospiflow-50"><tr><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Name</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Email</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Role</th><th className="px-5 py-3 text-left text-xs font-medium uppercase text-hospiflow-600">Status</th></tr></thead><tbody className="divide-y divide-hospiflow-200">{users.map((user) => <tr key={user.id}><td className="px-5 py-3 text-sm">{user.firstName} {user.lastName}</td><td className="px-5 py-3 text-sm">{user.email}</td><td className="px-5 py-3 text-sm">{user.role?.name || 'N/A'}</td><td className="px-5 py-3 text-sm"><span className={`rounded px-2 py-1 text-xs ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{user.isActive ? 'Active' : 'Inactive'}</span></td></tr>)}</tbody></table></div>}</section>
            </div>
          )}
        </div>
      )}
    </ModuleShell>
  )
}
