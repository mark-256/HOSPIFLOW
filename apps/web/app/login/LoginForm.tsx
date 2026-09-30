'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, LogIn } from 'lucide-react'
import { Field, Input } from '@/components/ui/Input'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      let data: { data?: { token?: string; user?: unknown }; error?: { message?: string } } | null = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        throw new Error(data?.error?.message || `Login failed (status ${response.status})`)
      }

      const token = data?.data?.token
      if (!token) {
        throw new Error('Login failed: the server did not return a session token')
      }

      localStorage.setItem('token', token)
      if (data?.data?.user) {
        localStorage.setItem('user', JSON.stringify(data.data.user))
      }
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="hf-card p-5 sm:p-6" noValidate>
      {error ? (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-800">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="space-y-4">
        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={Boolean(error)}
            placeholder="you@organization.com"
          />
        </Field>
        <Field label="Password" htmlFor="password" required>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={Boolean(error)}
          />
        </Field>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-600 text-sm font-medium text-white shadow-xs transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <LogIn aria-hidden="true" className="h-4 w-4" />}
        {loading ? 'Signing in...' : 'Sign in'}
      </button>

      <p className="mt-4 text-center text-xs text-ink-500">
        Access is granted by your organization administrator.
      </p>
    </form>
  )
}
