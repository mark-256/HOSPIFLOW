import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-hospiflow-50 flex items-center justify-center">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-hospiflow-900">HOSPIFLOW</h1>
          <p className="mt-2 text-hospiflow-600">Unified Hospitality Management Platform</p>
        </div>
        <div className="bg-white p-8 rounded-lg shadow-md space-y-6">
          <div className="space-y-4">
            <Link
              href="/login"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Sign In
            </Link>
            <p className="text-center text-sm text-hospiflow-600">
              Demo: admin@hospiflow.com / admin123
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
