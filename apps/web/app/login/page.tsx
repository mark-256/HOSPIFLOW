'use client'

import dynamic from 'next/dynamic'
import AuthLayout from './AuthLayout'

const LoginForm = dynamic(() => import('./LoginForm'), { ssr: false })

export default function LoginPage() {
  return (
    <AuthLayout title="Sign in" description="Use your organization credentials to access HOSPIFLOW.">
      <LoginForm />
    </AuthLayout>
  )
}
