export function parsePagination(query: Record<string, unknown>) {
  // A non-numeric page/limit must fall back to the default rather than becoming
  // NaN, which Prisma rejects and would surface as an unhandled 500.
  const rawPage = Number.parseInt(String(query.page ?? '1'), 10)
  const rawLimit = Number.parseInt(String(query.limit ?? '20'), 10)
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 20
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
