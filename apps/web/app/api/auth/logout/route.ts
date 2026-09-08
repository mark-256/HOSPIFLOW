import { NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const response = await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: authHeader || '' },
    })
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch {
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Proxy error' } }, { status: 500 })
  }
}
