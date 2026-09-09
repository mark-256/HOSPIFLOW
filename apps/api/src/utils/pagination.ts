export function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page || '1'), 10))
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '20'), 10)))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

export function paginatedResponse<T>(data: T[], page: number, limit: number, total: number) {
  return {
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  }
}
