'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Filter, Plus, Search } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import Button from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Card, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState, NoResultsState } from '@/components/ui/States'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { Pagination } from '@/components/ui/Pagination'
import { Dialog, Drawer } from '@/components/ui/Modal'
import { Field, FormGrid, Input, Select, Textarea } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { RESERVATION_STATUS } from '@/lib/status'
import { formatCurrency, formatDate, fullName } from '@/lib/format'

type Reservation = {
  id: string
  confirmationCode: string
  status: string
  checkInDate: string
  checkOutDate: string
  adults?: number
  children?: number
  rate?: number | string
  totalAmount?: number | string
  specialRequests?: string | null
  notes?: string | null
  roomId?: string | null
  room?: { id: string; roomNumber: string; roomType?: { name?: string } | null } | null
  guest?: { firstName?: string; lastName?: string; email?: string; phone?: string } | null
}

const STATUS_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'CONFIRMED', label: 'Confirmed' },
  { id: 'CHECKED_IN', label: 'Checked in' },
  { id: 'CHECKED_OUT', label: 'Checked out' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: 'NO_SHOW', label: 'No show' },
]

const EMPTY_FORM = {
  propertyId: '',
  guestId: '',
  roomTypeId: '',
  roomId: '',
  checkInDate: '',
  checkOutDate: '',
  adults: 1,
  children: 0,
  rate: 0,
  specialRequests: '',
  notes: '',
}

export default function ReservationsPage() {
  const toast = useToast()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [meta, setMeta] = useState<{ total?: number; totalPages?: number }>({})
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([])
  const [roomTypes, setRoomTypes] = useState<Array<{ id: string; name: string; rooms?: Array<{ id: string; roomNumber: string }> }>>([])
  const [guests, setGuests] = useState<Array<{ id: string; firstName?: string; lastName?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [rowBusy, setRowBusy] = useState('')
  const [detail, setDetail] = useState<Reservation | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [reservationResponse, propertyResponse, roomTypeResponse, guestResponse] = await Promise.all([
        apiRequest<Reservation[]>(`/api/reservations?limit=${limit}&page=${page}`),
        apiRequest<Array<{ id: string; name: string }>>('/api/properties'),
        apiRequest<Array<{ id: string; name: string; rooms?: Array<{ id: string; roomNumber: string }> }>>('/api/room-types'),
        apiRequest<Array<{ id: string; firstName?: string; lastName?: string }>>('/api/guests?limit=100'),
      ])
      setReservations(responseData(reservationResponse))
      setMeta({ total: reservationResponse.meta?.total as number | undefined, totalPages: reservationResponse.meta?.totalPages as number | undefined })
      setProperties(responseData(propertyResponse))
      setRoomTypes(responseData(roomTypeResponse))
      setGuests(responseData(guestResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load reservations'))
    } finally {
      setLoading(false)
    }
  }, [limit, page])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const response = await apiRequest<{ confirmationCode?: string }>('/api/reservations', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
      toast.success('Reservation created', response.data?.confirmationCode ? `Confirmation ${response.data.confirmationCode}` : undefined)
      await load()
    } catch (reason) {
      setFormError(getErrorMessage(reason, 'Unable to create reservation'))
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (reservation: Reservation, status: string) => {
    setRowBusy(reservation.id)
    setError('')
    try {
      await apiRequest(`/api/reservations/${reservation.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      toast.success('Reservation updated', `${reservation.confirmationCode} is now ${RESERVATION_STATUS[status as keyof typeof RESERVATION_STATUS]?.label.toLowerCase() || status}.`)
      await load()
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to update reservation'))
      toast.error('Update failed', getErrorMessage(reason, 'Unable to update reservation'))
    } finally {
      setRowBusy('')
    }
  }

  const visibleReservations = useMemo(() => {
    const term = query.trim().toLowerCase()
    return reservations.filter((reservation) => {
      const matchesStatus = statusFilter === 'ALL' || reservation.status === statusFilter
      const matchesQuery =
        !term ||
        String(reservation.confirmationCode || '').toLowerCase().includes(term) ||
        fullName(reservation.guest).toLowerCase().includes(term) ||
        String(reservation.room?.roomNumber || '').toLowerCase().includes(term)
      return matchesStatus && matchesQuery
    })
  }, [reservations, statusFilter, query])

  return (
    <ModuleShell
      title="Reservations"
      description="Bookings, arrivals, and departures"
      actions={
        <Button size="sm" onClick={() => setShowForm(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
          <span className="hidden sm:inline">New reservation</span>
          <span className="sm:hidden">New</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorState title="Reservation data is out of date" message={error} onRetry={() => void load()} compact /> : null}

        <Card>
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="relative w-full sm:max-w-xs">
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search confirmation, guest, or room"
                aria-label="Search reservations"
                leadingSlot={<Search aria-hidden="true" className="h-4 w-4" />}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="hf-caption tabular-nums">{meta.total ? `${meta.total} reservations` : `${reservations.length} on this page`}</span>
              <Button variant="outline" size="sm" onClick={() => void load()} leadingIcon={<Filter aria-hidden="true" className="h-4 w-4" />}>
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
          <div className="px-2 sm:px-3">
            <Tabs
              ariaLabel="Filter reservations by status"
              items={STATUS_FILTERS}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value)
                setPage(1)
              }}
            />
          </div>
        </Card>

        {loading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : reservations.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CalendarCheck className="h-5 w-5" />}
              title="No reservations yet"
              description="Create your first reservation to start managing guest stays and arrivals."
              action={
                <Button size="sm" onClick={() => setShowForm(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                  New reservation
                </Button>
              }
            />
          </Card>
        ) : visibleReservations.length === 0 ? (
          <Card>
            <NoResultsState
              query={query || STATUS_FILTERS.find((item) => item.id === statusFilter)?.label}
              onClear={() => {
                setQuery('')
                setStatusFilter('ALL')
              }}
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <TableWrapper>
              <Table>
                <THead>
                  <tr>
                    <TH>Confirmation</TH>
                    <TH>Guest</TH>
                    <TH>Room</TH>
                    <TH>Stay</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Actions</TH>
                  </tr>
                </THead>
                <TBody>
                  {visibleReservations.map((reservation) => (
                    <TR key={reservation.id}>
                      <TD>
                        <button
                          type="button"
                          onClick={() => setDetail(reservation)}
                          className="rounded font-medium text-brand-700 hover:text-brand-800 hover:underline"
                        >
                          {reservation.confirmationCode}
                        </button>
                      </TD>
                      <TD className="text-ink-900">{fullName(reservation.guest)}</TD>
                      <TD className="text-ink-500">{reservation.room ? `Room ${reservation.room.roomNumber}` : 'Unassigned'}</TD>
                      <TD className="text-ink-500">
                        {formatDate(reservation.checkInDate)} - {formatDate(reservation.checkOutDate)}
                      </TD>
                      <TD>
                        <StatusBadge status={reservation.status} registry={RESERVATION_STATUS} />
                      </TD>
                      <TD className="text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {reservation.status === 'PENDING' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={rowBusy === reservation.id}
                              onClick={() => void updateStatus(reservation, 'CONFIRMED')}
                            >
                              Confirm
                            </Button>
                          ) : null}
                          {reservation.status === 'CONFIRMED' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={rowBusy === reservation.id}
                              onClick={() => void updateStatus(reservation, 'CHECKED_IN')}
                            >
                              Check in
                            </Button>
                          ) : null}
                          {reservation.status === 'CHECKED_IN' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={rowBusy === reservation.id}
                              onClick={() => void updateStatus(reservation, 'CHECKED_OUT')}
                            >
                              Check out
                            </Button>
                          ) : null}
                          {['PENDING', 'CONFIRMED'].includes(reservation.status) ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger-700 hover:bg-danger-50"
                              loading={rowBusy === reservation.id}
                              onClick={() => void updateStatus(reservation, 'CANCELLED')}
                            >
                              Cancel
                            </Button>
                          ) : null}
                          <Button size="sm" variant="ghost" onClick={() => setDetail(reservation)}>
                            Details
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
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
              itemLabel="reservations"
            />
          </Card>
        )}
      </div>

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title="New reservation"
        description="Capture the stay details and assign the reservation to a property."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" form="reservation-form" loading={saving} loadingLabel="Creating">
              Create reservation
            </Button>
          </>
        }
      >
        <form id="reservation-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError ? <ErrorState compact title="Unable to create reservation" message={formError} /> : null}
          <FormGrid>
            <Field label="Property" htmlFor="propertyId" required>
              <Select
                id="propertyId"
                required
                value={form.propertyId}
                onChange={(event) => setForm({ ...form, propertyId: event.target.value })}
              >
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Guest" htmlFor="guestId" required>
              <Select
                id="guestId"
                required
                value={form.guestId}
                onChange={(event) => setForm({ ...form, guestId: event.target.value })}
              >
                <option value="">Select guest</option>
                {guests.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {fullName(guest)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Room type" htmlFor="roomTypeId" required>
              <Select
                id="roomTypeId"
                required
                value={form.roomTypeId}
                onChange={(event) => setForm({ ...form, roomTypeId: event.target.value, roomId: '' })}
              >
                <option value="">Select room type</option>
                {roomTypes.map((roomType) => (
                  <option key={roomType.id} value={roomType.id}>
                    {roomType.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Room" htmlFor="roomId" hint="Optional - can be assigned at check-in.">
              <Select id="roomId" value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })}>
                <option value="">Unassigned</option>
                {(roomTypes.find((roomType) => roomType.id === form.roomTypeId)?.rooms || []).map((room) => (
                  <option key={room.id} value={room.id}>
                    Room {room.roomNumber}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Check-in" htmlFor="checkInDate" required>
              <Input
                id="checkInDate"
                type="date"
                required
                value={form.checkInDate}
                onChange={(event) => setForm({ ...form, checkInDate: event.target.value })}
              />
            </Field>
            <Field label="Check-out" htmlFor="checkOutDate" required>
              <Input
                id="checkOutDate"
                type="date"
                required
                value={form.checkOutDate}
                onChange={(event) => setForm({ ...form, checkOutDate: event.target.value })}
              />
            </Field>
            <Field label="Adults" htmlFor="adults" required>
              <Input
                id="adults"
                type="number"
                min={1}
                required
                value={form.adults}
                onChange={(event) => setForm({ ...form, adults: Number(event.target.value) })}
              />
            </Field>
            <Field label="Children" htmlFor="children">
              <Input
                id="children"
                type="number"
                min={0}
                value={form.children}
                onChange={(event) => setForm({ ...form, children: Number(event.target.value) })}
              />
            </Field>
            <Field label="Rate" htmlFor="rate" hint="Per night, in property currency.">
              <Input
                id="rate"
                type="number"
                min={0}
                step="0.01"
                value={form.rate}
                onChange={(event) => setForm({ ...form, rate: Number(event.target.value) })}
              />
            </Field>
          </FormGrid>
          <Field label="Special requests" htmlFor="specialRequests">
            <Textarea
              id="specialRequests"
              value={form.specialRequests}
              onChange={(event) => setForm({ ...form, specialRequests: event.target.value })}
              placeholder="Accessibility, arrival time, or preference notes"
            />
          </Field>
          <Field label="Internal notes" htmlFor="notes">
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </Field>
        </form>
      </Dialog>

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Reservation ${detail.confirmationCode}` : 'Reservation'}
        description={detail ? fullName(detail.guest) : undefined}
        footer={
          <Button variant="outline" onClick={() => setDetail(null)}>
            Close
          </Button>
        }
      >
        {detail ? (
          <dl className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="hf-caption">Status</dt>
              <dd>
                <StatusBadge status={detail.status} registry={RESERVATION_STATUS} />
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="hf-caption">Check-in</dt>
                <dd className="mt-0.5 font-medium text-ink-900">{formatDate(detail.checkInDate)}</dd>
              </div>
              <div>
                <dt className="hf-caption">Check-out</dt>
                <dd className="mt-0.5 font-medium text-ink-900">{formatDate(detail.checkOutDate)}</dd>
              </div>
              <div>
                <dt className="hf-caption">Room</dt>
                <dd className="mt-0.5 font-medium text-ink-900">
                  {detail.room ? `Room ${detail.room.roomNumber}` : 'Unassigned'}
                </dd>
              </div>
              <div>
                <dt className="hf-caption">Rate</dt>
                <dd className="mt-0.5 font-medium text-ink-900">{formatCurrency(detail.rate || 0)}</dd>
              </div>
              <div>
                <dt className="hf-caption">Guests</dt>
                <dd className="mt-0.5 font-medium text-ink-900">
                  {detail.adults || 0} adults{detail.children ? `, ${detail.children} children` : ''}
                </dd>
              </div>
              <div>
                <dt className="hf-caption">Contact</dt>
                <dd className="mt-0.5 font-medium text-ink-900">{detail.guest?.email || detail.guest?.phone || 'Not recorded'}</dd>
              </div>
            </div>
            {detail.specialRequests ? (
              <div>
                <dt className="hf-caption">Special requests</dt>
                <dd className="mt-1 rounded-md border border-line bg-surface-muted px-3 py-2 text-ink-700">{detail.specialRequests}</dd>
              </div>
            ) : null}
            {detail.notes ? (
              <div>
                <dt className="hf-caption">Internal notes</dt>
                <dd className="mt-1 rounded-md border border-line bg-surface-muted px-3 py-2 text-ink-700">{detail.notes}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </Drawer>
    </ModuleShell>
  )
}
