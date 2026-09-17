'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ModuleShell from '@/components/ModuleShell'

type User = {
  firstName?: string
  lastName?: string
  email?: string
  role?: string
}

const menuItems = [
  { href: '/hotel', label: 'Hotel', description: 'Properties, rooms, guests, and stays' },
  { href: '/reservations', label: 'Reservations', description: 'Bookings and arrival workflow' },
  { href: '/rooms', label: 'Rooms', description: 'Room inventory and status' },
  { href: '/guests', label: 'Guests', description: 'Guest profiles and preferences' },
  { href: '/pos', label: 'POS', description: 'Tables, menus, and orders' },
  { href: '/restaurant', label: 'Restaurant', description: 'Restaurant ordering workspace' },
  { href: '/bar', label: 'Bar', description: 'Bar ordering workspace' },
  { href: '/kitchen', label: 'Kitchen', description: 'Kitchen display and fulfillment' },
  { href: '/inventory', label: 'Inventory', description: 'Stock items and movements' },
  { href: '/procurement', label: 'Procurement', description: 'Suppliers and purchase orders' },
  { href: '/housekeeping', label: 'Housekeeping', description: 'Room service tasks' },
  { href: '/maintenance', label: 'Maintenance', description: 'Repairs and tickets' },
  { href: '/online-ordering', label: 'Online Orders', description: 'Delivery and pickup orders' },
  { href: '/qr-order', label: 'QR Ordering', description: 'Guest self-ordering' },
  { href: '/loyalty', label: 'Loyalty', description: 'Points and guest rewards' },
  { href: '/guest-portal', label: 'Guest Portal', description: 'Guest reservations and folios' },
  { href: '/reports', label: 'Reports', description: 'Sales and occupancy analytics' },
  { href: '/finance', label: 'Finance', description: 'Folios, payments, and balances' },
  { href: '/settings', label: 'Settings', description: 'Organization and access setup' },
  { href: '/ai', label: 'AI Assistant', description: 'Operational insights and actions' },
]

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()

  useEffect(() => {
    const token = window.localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      return
    }
    // ModuleShell handles auth check; just wait for it
    const timer = setTimeout(() => {
      const storedUser = window.localStorage.getItem('user')
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser))
        } catch {
          setUser(null)
        }
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [router])

  if (!user) return <ModuleShell title="Dashboard"><div className="flex min-h-[300px] items-center justify-center text-hospiflow-600">Loading dashboard...</div></ModuleShell>

  return (
    <ModuleShell title="Dashboard" description={`Welcome back, ${user.firstName || 'User'}`}>
      <div className="mb-6 rounded-lg border border-primary-100 bg-primary-50 p-5">
        <h2 className="text-lg font-semibold text-hospiflow-900">Operations overview</h2>
        <p className="mt-1 text-sm text-hospiflow-700">Use the modules below to manage the property, food and beverage, stock, guests, and finance workflows.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {menuItems.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-lg border border-hospiflow-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
            <h3 className="text-lg font-semibold text-hospiflow-900">{item.label}</h3>
            <p className="mt-1 text-sm text-hospiflow-600">{item.description}</p>
            <p className="mt-4 text-sm font-medium text-primary-700">Open module →</p>
          </Link>
        ))}
      </div>
    </ModuleShell>
  )
}
