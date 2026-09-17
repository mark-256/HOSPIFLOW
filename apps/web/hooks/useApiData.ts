'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '@/lib/api'

export function useApiData<T>(path: string, dependencies: readonly unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<T>(path)
      setData(response.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load data')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [path, ...dependencies])

  useEffect(() => {
    void load()
  }, [load])

  return { data, loading, error, setData, reload: load }
}
