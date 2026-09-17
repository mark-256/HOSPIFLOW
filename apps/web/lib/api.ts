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

// Request deduplication cache
const pendingRequests = new Map<string, Promise<ApiResponse>>()

export async function apiRequest<T = any>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean; retries?: number } = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers)
  const maxRetries = options.retries ?? 1

  if (options.auth !== false) {
    const token = typeof window === 'undefined' ? null : window.localStorage.getItem('token')
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  // Deduplicate identical GET requests
  const requestKey = `${path}:${init.method || 'GET'}:${JSON.stringify(init.body || '')}`
  const isWriteRequest = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(init.method || '')
  
  if (!isWriteRequest) {
    const existing = pendingRequests.get(requestKey)
    if (existing) return existing
  }

  let lastError: ApiError | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
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
    } catch (error) {
      lastError = error as ApiError
      // Don't retry on 4xx client errors (except 429)
      if (error instanceof Error && 'status' in error) {
        const status = (error as ApiError).status
        if (status && status >= 400 && status < 500 && status !== 429) {
          throw error
        }
      }
      // Wait before retry
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 5000)))
      }
    }
  }

  throw lastError || new Error('Request failed')
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
