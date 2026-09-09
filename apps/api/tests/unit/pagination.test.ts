import { it, expect } from 'vitest'
import { parsePagination, paginatedResponse } from '../../src/utils/pagination'

it('parses pagination defaults', () => {
  const result = parsePagination({})
  expect(result.page).toBe(1)
  expect(result.limit).toBe(20)
  expect(result.skip).toBe(0)
})

it('parses pagination with values', () => {
  const result = parsePagination({ page: '2', limit: '50' })
  expect(result.page).toBe(2)
  expect(result.limit).toBe(50)
  expect(result.skip).toBe(50)
})

it('clamps limit to max 100', () => {
  const result = parsePagination({ limit: '200' })
  expect(result.limit).toBe(100)
})

it('paginatedResponse has correct meta', () => {
  const data = [{ id: '1' }, { id: '2' }]
  const result = paginatedResponse(data, 1, 20, 2)
  expect(result.data).toHaveLength(2)
  expect(result.meta.totalPages).toBe(1)
})
