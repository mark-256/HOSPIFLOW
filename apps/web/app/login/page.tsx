'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const LoginForm = dynamic(() => import('./LoginForm'), { ssr: false })

export default function LoginPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center bg-hospiflow-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-hospiflow-900">HOSPIFLOW</h1>
          <p className="mt-2 text-hospiflow-600">Sign in to your account</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
