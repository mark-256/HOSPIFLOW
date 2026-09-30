'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BedDouble, Building, Filter, Search } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import Button from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Card, CardBody } from '@/components/ui/Card'
import { EmptyState, ErrorState, NoResultsState } from '@/components/ui/States'
import { Skeleton } from '@/components/ui/Skeleton'
import { Pagination } from '@/components/ui/Pagination'
import { Input, Select } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { ROOM_STATUS } from '@/lib/status'

type Room = {
  id: string
  roomNumber: string
  status: string
  floor?: string | null
  building?: string | null
  roomType?: { name?: string } | null
}

const ROOM_STATUS_OPTIONS = [
  'AVAILABLE',
  'OCCUPIED',
  'DIRTY',
  'CLEANING',
  'INSPECTED',
  'RESERVED',
  'OUT_OF_ORDER',
  'OUT_OF_SERVICE',
]

const FILTERS = [
  { id: 'ALL', label: 'All rooms' },
  { id: 'AVAILABLE', label: 'Available' },
  { id: 'OCCUPIED', label: 'Occupied' },
  { id: 'DIRTY', label: 'Dirty' },
  { id: 'CLEANING', label: 'Cleaning' },
  { id: 'RESERVED', label: 'Reserved' },
  { id: 'OUT_OF_ORDER', label: 'Out of order' },
  { id: 'OUT_OF_SERVICE', label: 'Out of service' },
]

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [meta, setMeta] = useState<{ total?: number; totalPages?: number }>({})
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [savingId, setSavingId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<Room[]>(`/api/rooms?limit=${limit}&page=${page}`)
      setRooms(responseData(response))
      setMeta({ total: response.meta?.total as number | undefined, totalPages: response.meta?.totalPages as number | undefined })
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load rooms'))
    } finally {
      setLoading(false)
    }
  }, [limit, page])

  useEffect(() => {
    void load()
  }, [load])

  const updateStatus = async (roomId: string, status: string) => {
    setSavingId(roomId)
    setError('')
    try {
      await apiRequest(`/api/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setRooms((current) => current.map((room) => (room.id === roomId ? { ...room, status } : room)))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to update room status'))
    } finally {
      setSavingId('')
    }
  }

  const visibleRooms = useMemo(() => {
    const term = query.trim().toLowerCase()
    return rooms.filter((room) => {
      const matchesStatus = statusFilter === 'ALL' || room.status === statusFilter
      const matchesQuery =
        !term ||
        String(room.roomNumber).toLowerCase().includes(term) ||
        (room.roomType?.name || '').toLowerCase().includes(term) ||
        (room.building || '').toLowerCase().includes(term)
      return matchesStatus && matchesQuery
    })
  }, [rooms, statusFilter, query])

  return (
    <ModuleShell
      title="Rooms"
      description="Room inventory, status, and readiness across the property"
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()} leadingIcon={<Filter aria-hidden="true" className="h-4 w-4" />}>
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorState title="Unable to load rooms" message={error} onRetry={() => void load()} /> : null}

        <Card>
          <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="relative w-full sm:max-w-xs">
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search room number, type, or building"
                aria-label="Search rooms"
                leadingSlot={<Search aria-hidden="true" className="h-4 w-4" />}
              />
            </div>
            <p className="hf-caption tabular-nums">
              {meta.total ? `${meta.total} rooms in inventory` : `${rooms.length} rooms on this page`}
            </p>
          </div>
          <div className="px-2 sm:px-3">
            <Tabs
              ariaLabel="Filter rooms by status"
              items={FILTERS}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
            />
          </div>
        </Card>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading rooms">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-40 rounded-lg" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <Card>
            <EmptyState
              icon={<BedDouble className="h-5 w-5" />}
              title="No rooms configured"
              description="Add room types and rooms to the property to start managing inventory."
            />
          </Card>
        ) : visibleRooms.length === 0 ? (
          <Card>
            <NoResultsState
              query={query || FILTERS.find((filter) => filter.id === statusFilter)?.label}
              onClear={() => {
                setQuery('')
                setStatusFilter('ALL')
              }}
            />
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleRooms.map((room) => (
                <Card key={room.id} className="flex flex-col">
                  <CardBody className="flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-ink-900">Room {room.roomNumber}</p>
                        <p className="truncate text-xs text-ink-500">{room.roomType?.name || 'Room type not set'}</p>
                      </div>
                      <StatusBadge status={room.status} registry={ROOM_STATUS} />
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-ink-500">
                        <Building aria-hidden="true" className="h-3.5 w-3.5" />
                        <span className="truncate">{room.building || 'No building'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-ink-500">
                        <BedDouble aria-hidden="true" className="h-3.5 w-3.5" />
                        <span>{room.floor ? `Floor ${room.floor}` : 'No floor'}</span>
                      </div>
                    </dl>
                    <Select
                      aria-label={`Set status for room ${room.roomNumber}`}
                      value={room.status}
                      disabled={savingId === room.id}
                      onChange={(event) => void updateStatus(room.id, event.target.value)}
                    >
                      {ROOM_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {ROOM_STATUS[option as keyof typeof ROOM_STATUS]?.label || option}
                        </option>
                      ))}
                    </Select>
                  </CardBody>
                </Card>
              ))}
            </div>
            <Card>
              <Pagination
                page={page}
                limit={limit}
                total={meta.total}
                totalPages={meta.totalPages}
                onPageChange={setPage}
                onLimitChange={(value) => {
                  setLimit(value)
                  setPage(1)
                }}
                itemLabel="rooms"
              />
            </Card>
          </>
        )}
      </div>
    </ModuleShell>
  )
}
