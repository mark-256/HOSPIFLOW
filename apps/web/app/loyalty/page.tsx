'use client'

import { useEffect, useState } from 'react'

export default function LoyaltyPage() {
  const [guestId, setGuestId] = useState('')
  const [account, setAccount] = useState<any>(null)
  const [points, setPoints] = useState(0)
  const [reason, setReason] = useState('')

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''

  const fetchAccount = async () => {
    if (!guestId) return
    const res = await fetch(`/api/loyalty/account?guestId=${guestId}`, { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (json.success) setAccount(json.data)
  }

  useEffect(() => { fetchAccount() }, [guestId])

  const addPoints = async () => {
    await fetch('/api/loyalty/points', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ guestId, points, reason }) })
    setPoints(0); setReason(''); fetchAccount()
  }

  return (
    <div className="min-h-screen bg-hospiflow-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-hospiflow-900 mb-6">Loyalty</h1>
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <label className="block text-sm font-medium text-hospiflow-700 mb-2">Guest ID</label>
          <input className="border rounded p-2 w-full" value={guestId} onChange={e => setGuestId(e.target.value)} />
        </div>
        {account && (
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <p className="text-sm text-hospiflow-600">Points Balance</p>
            <p className="text-3xl font-bold text-hospiflow-900">{account.points}</p>
            <p className="text-sm text-hospiflow-600 mt-2">Lifetime Points: {account.lifetimePoints}</p>
            <p className="text-sm text-hospiflow-600">Tier: {account.tier}</p>
            <div className="mt-4 flex space-x-2">
              <input className="border rounded p-2" type="number" placeholder="Points" value={points} onChange={e => setPoints(parseInt(e.target.value))} />
              <input className="border rounded p-2" placeholder="Reason" value={reason} onChange={e => setReason(e.target.value)} />
              <button onClick={addPoints} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Add</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
