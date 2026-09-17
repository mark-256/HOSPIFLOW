'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useEffect, useState, useCallback, useRef } from 'react'
import { apiRequest } from '@/lib/api'

type User = {
  firstName?: string
  lastName?: string
  email?: string
  role?: string
  organization?: {
    name?: string
  }
}

type MenuItem = {
  href: string
  label: string
}

const menuItems: MenuItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/hotel', label: 'Hotel' },
  { href: '/reservations', label: 'Reservations' },
  { href: '/rooms', label: 'Rooms' },
  { href: '/guests', label: 'Guests' },
  { href: '/pos', label: 'POS' },
  { href: '/restaurant', label: 'Restaurant' },
  { href: '/bar', label: 'Bar' },
  { href: '/kitchen', label: 'Kitchen' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/procurement', label: 'Procurement' },
  { href: '/housekeeping', label: 'Housekeeping' },
  { href: '/maintenance', label: 'Maintenance' },
  { href: '/online-ordering', label: 'Online Orders' },
  { href: '/qr-order', label: 'QR Ordering' },
  { href: '/loyalty', label: 'Loyalty' },
  { href: '/guest-portal', label: 'Guest Portal' },
  { href: '/reports', label: 'Reports' },
  { href: '/finance', label: 'Finance' },
  { href: '/settings', label: 'Settings' },
  { href: '/ai', label: 'AI Assistant' },
]

type ModuleShellProps = {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}

export default function ModuleShell({ title, description, children, actions }: ModuleShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const authCheckRef = useRef<Promise<void> | null>(null)

  const checkAuth = useCallback(async () => {
    // Try to use cached user data first
    const storedUser = window.localStorage.getItem('user')
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
        setLoading(false)
        return
      } catch {
        // Ignore, continue with full check
      }
    }

    const token = window.localStorage.getItem('token')
    if (!token) {
      router.replace('/login')
      setLoading(false)
      return
    }

    try {
      const response = await apiRequest<User>('/api/auth/me')
      setUser(response.data)
      window.localStorage.setItem('user', JSON.stringify(response.data))
    } catch {
      window.localStorage.removeItem('token')
      window.localStorage.removeItem('user')
      router.replace('/login')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (authCheckRef.current) return
    authCheckRef.current = checkAuth()
  }, [checkAuth])

  if (loading) {
    return <div className="min-h-screen bg-hospiflow-50 flex items-center justify-center"><div className="text-hospiflow-600">Loading HOSPIFLOW...</div></div>
  }

  const signOut = async () => {
    const token = window.localStorage.getItem('token')
    if (token) {
      await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    }
    window.localStorage.removeItem('token')
    window.localStorage.removeItem('user')
    router.replace('/login')
  }

  return (
    <div className="min-h-screen bg-hospiflow-50">
      <aside className="fixed inset-y-0 left-0 z-20 w-64 bg-hospiflow-900 text-white overflow-y-auto">
        <Link href="/dashboard" className="flex items-center justify-center h-16 border-b border-hospiflow-700 font-bold text-xl">
          HOSPIFLOW
        </Link>
        <nav className="p-3 space-y-1" aria-label="Primary navigation">
          {menuItems.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-primary-600 text-white' : 'text-hospiflow-200 hover:bg-hospiflow-800 hover:text-white'}`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="bg-white border-b border-hospiflow-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-hospiflow-900 truncate">{title}</h1>
              {description && <p className="text-sm text-hospiflow-600 mt-0.5 truncate">{description}</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {actions}
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-hospiflow-900">{user?.firstName || 'User'} {user?.lastName || ''}</p>
                <p className="text-xs text-hospiflow-600">{user?.organization?.name || user?.role || ''}</p>
              </div>
              <button onClick={() => void signOut()} className="text-sm text-hospiflow-600 hover:text-hospiflow-900 rounded-md px-2 py-1">Sign out</button>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">{children}</main>
      </div>
    </div>
  )
}
