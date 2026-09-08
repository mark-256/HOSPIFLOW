'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Not authenticated')
        return res.json()
      })
      .then((data) => setUser(data.data))
      .catch(() => router.push('/login'))
  }, [router])

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  const menuItems = [
    { href: '/pos', label: 'POS', icon: '💳' },
    { href: '/hotel', label: 'Hotel', icon: '🏨' },
    { href: '/reservations', label: 'Reservations', icon: '📅' },
    { href: '/rooms', label: 'Rooms', icon: '🚪' },
    { href: '/guests', label: 'Guests', icon: '👥' },
    { href: '/restaurant', label: 'Restaurant', icon: '🍽️' },
    { href: '/kitchen', label: 'Kitchen', icon: '👨‍🍳' },
    { href: '/bar', label: 'Bar', icon: '🍸' },
    { href: '/inventory', label: 'Inventory', icon: '📦' },
    { href: '/housekeeping', label: 'Housekeeping', icon: '🧹' },
    { href: '/maintenance', label: 'Maintenance', icon: '🔧' },
    { href: '/online-ordering', label: 'Online Orders', icon: '🛒' },
    { href: '/loyalty', label: 'Loyalty', icon: '🎁' },
    { href: '/guest-portal', label: 'Guest Portal', icon: '🌐' },
    { href: '/reports', label: 'Reports', icon: '📊' },
    { href: '/finance', label: 'Finance', icon: '💰' },
    { href: '/settings', label: 'Settings', icon: '⚙️' },
  ]

  return (
    <div className="min-h-screen bg-hospiflow-50">
      <nav className="bg-white shadow-sm border-b border-hospiflow-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-hospiflow-900">HOSPIFLOW</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-hospiflow-600">
                {user.firstName} {user.lastName}
              </span>
              <button
                onClick={() => {
                  localStorage.removeItem('token')
                  router.push('/login')
                }}
                className="text-sm text-hospiflow-600 hover:text-hospiflow-900"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h2 className="text-2xl font-bold text-hospiflow-900 mb-6">Dashboard</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  <div className="text-3xl mb-2">{item.icon}</div>
                  <div className="text-lg font-medium text-hospiflow-900">{item.label}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
