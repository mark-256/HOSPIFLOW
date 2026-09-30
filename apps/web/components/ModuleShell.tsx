'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { apiRequest } from '@/lib/api'
import AppShell from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/Skeleton'
import type { ShellUser } from '@/components/layout/Sidebar'

function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split('.')[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const claims = JSON.parse(atob(padded)) as { exp?: number }
    return typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

type ModuleShellProps = {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}

/** Loading surface shown while the session is verified. */
function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-canvas" role="status" aria-label="Loading HOSPIFLOW">
      <div className="fixed inset-y-0 left-0 hidden w-64 bg-ink-950 lg:block">
        <div className="space-y-3 p-4">
          <Skeleton className="h-8 w-32 bg-white/10" />
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full bg-white/5" />
          ))}
        </div>
      </div>
      <div className="lg:pl-64">
        <div className="border-b border-line bg-surface">
          <div className="space-y-2 px-4 py-4 sm:px-6 lg:px-8">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-5 w-56" />
          </div>
        </div>
        <div className="hf-page">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export default function ModuleShell({ title, description, children, actions }: ModuleShellProps) {
  const router = useRouter()
  const [user, setUser] = useState<ShellUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)
  const authCheckRef = useRef<Promise<void> | null>(null)

  const checkAuth = useCallback(async () => {
    const token = window.localStorage.getItem('token')
    if (!token || isTokenExpired(token)) {
      window.localStorage.removeItem('token')
      window.localStorage.removeItem('user')
      router.replace('/login')
      setLoading(false)
      return
    }

    try {
      const response = await apiRequest<ShellUser>('/api/auth/me')
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

  const signOut = async () => {
    setSigningOut(true)
    const token = window.localStorage.getItem('token')
    if (token) {
      await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    }
    window.localStorage.removeItem('token')
    window.localStorage.removeItem('user')
    router.replace('/login')
  }

  if (loading || !user) return <ShellSkeleton />

  return (
    <AppShell
      user={user}
      title={title}
      description={description}
      actions={actions}
      onSignOut={() => void signOut()}
      signingOut={signingOut}
    >
      {children}
    </AppShell>
  )
}
