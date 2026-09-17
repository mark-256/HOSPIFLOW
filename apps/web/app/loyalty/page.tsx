'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleShell from '@/components/ModuleShell'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'

export default function LoyaltyPage() {
  const [guests, setGuests] = useState<any[]>([])
  const [guestId, setGuestId] = useState('')
  const [account, setAccount] = useState<any>(null)
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadGuests = useCallback(async () => {
    try {
      const response = await apiRequest<any[]>('/api/guests?limit=200')
      setGuests(responseData(response))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load guests'))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAccount = useCallback(async (selectedGuestId: string) => {
    setAccount(null)
    if (!selectedGuestId) return
    try {
      const response = await apiRequest<any>(`/api/loyalty/account?guestId=${encodeURIComponent(selectedGuestId)}`)
      setAccount(response.data)
    } catch (reason) {
      setError(getErrorMessage(reason, 'No loyalty account found for this guest'))
    }
  }, [])

  useEffect(() => { void loadGuests() }, [loadGuests])
  useEffect(() => { void loadAccount(guestId) }, [guestId, loadAccount])

  const addPoints = async () => {
    if (!guestId || !points) return
    setSaving(true)
    setError('')
    try {
      await apiRequest('/api/loyalty/points', { method: 'POST', body: JSON.stringify({ guestId, points: Number(points), reason }) })
      setPoints('')
      setReason('')
      setNotice('Points added successfully.')
      await loadAccount(guestId)
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to add points'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModuleShell title="Loyalty" description="Reward guests and track loyalty tiers">
      {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}
      {notice && <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-green-700">{notice}</div>}
      {loading ? <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-hospiflow-200 bg-white text-hospiflow-600">Loading loyalty workspace...</div> : (
        <div className="max-w-3xl space-y-6">
          <section className="rounded-lg border border-hospiflow-200 bg-white p-5"><label className="block text-sm font-medium text-hospiflow-700">Guest</label><select className="mt-2 w-full rounded-md border border-hospiflow-300 px-3 py-2 bg-white" value={guestId} onChange={(event) => setGuestId(event.target.value)}><option value="">Select guest</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.firstName} {guest.lastName} · {guest.email || guest.phone || 'No contact'}</option>)}</select></section>
          {account ? <section className="rounded-lg border border-hospiflow-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-hospiflow-600">Points balance</p><p className="text-4xl font-bold">{account.points}</p></div><span className="rounded bg-primary-100 px-3 py-1 text-sm font-medium text-primary-800">{account.tier || 'BRONZE'}</span></div><p className="mt-3 text-sm text-hospiflow-600">Lifetime points: {account.lifetimePoints || 0}</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><input type="number" min="1" placeholder="Points" className="rounded-md border border-hospiflow-300 px-3 py-2" value={points} onChange={(event) => setPoints(event.target.value)} /><input placeholder="Reason" className="rounded-md border border-hospiflow-300 px-3 py-2 sm:col-span-2" value={reason} onChange={(event) => setReason(event.target.value)} /><button disabled={saving || !points} onClick={() => void addPoints()} className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">{saving ? 'Saving...' : 'Add points'}</button></div></section> : guestId && <section className="rounded-lg border border-dashed border-hospiflow-300 bg-white p-8 text-center text-hospiflow-600">This guest does not have a loyalty account yet. Add points to create one.</section>}
        </div>
      )}
    </ModuleShell>
  )
}
