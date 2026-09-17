export type ApiError = Error & {
  code?: string
  status?: number
}

export type ApiResponse<T = any> = {
  success: boolean
  data: T
  meta?: Record<string, unknown>
  error?: {
    code?: string
    message?: string
  }
}

export async function apiRequest<T = any>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean } = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers)

  if (options.auth !== false) {
    const token = typeof window === 'undefined' ? null : window.localStorage.getItem('token')
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, { ...init, headers })
  let payload: ApiResponse<T> | { success: false; error?: { code?: string; message?: string } } = {
    success: false,
    error: { code: 'INVALID_RESPONSE', message: 'The server returned an invalid response' },
  }

  try {
    payload = (await response.json()) as ApiResponse<T>
  } catch {
    payload = {
      success: false,
      error: { code: 'INVALID_RESPONSE', message: 'The server returned an invalid response' },
    }
  }

  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error?.message || `Request failed with status ${response.status}`) as ApiError
    error.code = payload.error?.code
    error.status = response.status
    throw error
  }

  return payload
}

export function responseData<T>(response: ApiResponse<T | T[]>): T[] {
  return Array.isArray(response.data) ? response.data : []
}

export function firstData<T>(response: ApiResponse<T | T[]>): T | null {
  return Array.isArray(response.data) ? (response.data[0] ?? null) : response.data
}

export function getErrorMessage(error: unknown, fallback = 'Unable to complete this request'): string {
  return error instanceof Error ? error.message : fallback
}
