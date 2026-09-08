'use client'

import { useEffect, useState } from 'react'

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : ''

  const fetchTasks = async () => {
    setLoading(true)
    const res = await fetch('/api/housekeeping', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (json.success) setTasks(json.data)
    setLoading(false)
  }

  useEffect(() => { void fetchTasks() }, [])

  return (
    <div className="min-h-screen bg-hospiflow-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-hospiflow-900 mb-6">Housekeeping</h1>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-hospiflow-200">
            <thead className="bg-hospiflow-50">
              <tr><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Room</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Type</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Status</th><th className="px-6 py-3 text-left text-xs font-medium text-hospiflow-500 uppercase">Priority</th></tr>
            </thead>
            <tbody className="bg-white divide-y divide-hospiflow-200">
              {tasks.map((task: any) => (
                <tr key={task.id}><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-900">Room {task.room?.roomNumber || task.roomId}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{task.type}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{task.status}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-hospiflow-600">{task.priority}</td></tr>
              ))}
            </tbody>
          </table>
          {loading && <p className="p-4 text-center text-hospiflow-600">Loading...</p>}
        </div>
      </div>
    </div>
  )
}
