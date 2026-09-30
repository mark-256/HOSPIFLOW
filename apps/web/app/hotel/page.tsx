'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BedDouble, Building2, CalendarCheck, ReceiptText, Users } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import MetricCard from '@/components/dashboard/MetricCard'
import { StatusBreakdown, buildBreakdown } from '@/components/dashboard/ChartCard'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { SkeletonStatGrid, Skeleton } from '@/components/ui/Skeleton'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { FOLIO_STATUS, RESERVATION_STATUS, ROOM_STATUS } from '@/lib/status'
import { countByStatus } from '@/lib/status'
import { formatCurrency, formatDate, formatNumber, fullName, isSameDay, startOfToday } from '@/lib/format'

type Property = {
  id: string
  name: string
  code: string
  city?: string
  country?: string
  status?: string
  _count?: { rooms?: number; guests?: number; outlets?: number }
}

type Room = { id: string; roomNumber: string; status: string; floor?: string | null }
type Reservation = {
  id: string
  confirmationCode: string
  status: string
  checkInDate: string
  checkOutDate: string
  guest?: { firstName?: string; lastName?: string } | null
  room?: { roomNumber?: string } | null
}
type Guest = { id: string; firstName?: string; lastName?: string; email?: string; phone?: string; isVip?: boolean }
type Folio = { id: string; folioNumber: string; status: string; balance: number | string; guest?: { firstName?: string; lastName?: string } | null }

export default function HotelPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [folios, setFolios] = useState<Folio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [propertyResponse, roomResponse, reservationResponse, guestResponse, folioResponse] = await Promise.all([
        apiRequest<Property[]>('/api/properties'),
        apiRequest<Room[]>('/api/rooms?limit=100'),
        apiRequest<Reservation[]>('/api/reservations?limit=50'),
        apiRequest<Guest[]>('/api/guests?limit=50'),
        apiRequest<Folio[]>('/api/folios?limit=50'),
      ])
      setProperties(responseData(propertyResponse))
      setRooms(responseData(roomResponse))
      setReservations(responseData(reservationResponse))
      setGuests(responseData(guestResponse))
      setFolios(responseData(folioResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load hotel operations'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => {
    const today = startOfToday()
    const occupiedRooms = rooms.filter((room) => ['OCCUPIED', 'RESERVED'].includes(room.status)).length
    const dirtyRooms = rooms.filter((room) => ['DIRTY', 'CLEANING'].includes(room.status)).length
    const openFolios = folios.filter((folio) => folio.status !== 'CLOSED')
    const outstandingBalance = openFolios.reduce((sum, folio) => sum + Number(folio.balance || 0), 0)
    const activeReservations = reservations.filter((reservation) => !['CANCELLED', 'CHECKED_OUT'].includes(reservation.status))
    const arrivals = reservations.filter(
      (reservation) => isSameDay(reservation.checkInDate, today) && ['PENDING', 'CONFIRMED'].includes(reservation.status),
    )
    return { occupiedRooms, dirtyRooms, openFolios, outstandingBalance, activeReservations, arrivals }
  }, [rooms, reservations, folios])

  const roomBreakdown = useMemo(
    () =>
      buildBreakdown(countByStatus(rooms, 'status'), ROOM_STATUS, [
        'AVAILABLE',
        'OCCUPIED',
        'CLEANING',
        'DIRTY',
        'INSPECTED',
        'RESERVED',
        'OUT_OF_ORDER',
        'OUT_OF_SERVICE',
      ]),
    [rooms],
  )

  return (
    <ModuleShell
      title="Hotel"
      description="Property overview, availability, arrivals, and guest accounts"
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      }
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load hotel operations" message={error} onRetry={() => void load()} /> : null}

        {loading ? (
          <SkeletonStatGrid count={4} />
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Properties" value={formatNumber(properties.length)} icon={Building2} tone="brand" href="/settings" />
            <MetricCard
              label="Occupied rooms"
              value={`${summary.occupiedRooms}/${rooms.length}`}
              icon={BedDouble}
              tone="info"
              hint={`${summary.dirtyRooms} awaiting housekeeping`}
              href="/rooms"
            />
            <MetricCard
              label="Arrivals today"
              value={summary.arrivals.length}
              icon={CalendarCheck}
              tone="accent"
              hint={`${summary.activeReservations.length} active reservations`}
              href="/reservations"
            />
            <MetricCard
              label="Open folio balance"
              value={formatCurrency(summary.outstandingBalance)}
              icon={ReceiptText}
              tone={summary.outstandingBalance > 0 ? 'warning' : 'neutral'}
              hint={`${summary.openFolios.length} open folios`}
              href="/finance"
            />
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle description="Properties available to this organization">Portfolio</CardTitle>
            <Link href="/settings" className="text-sm font-medium text-brand-700 hover:text-brand-800">
              Manage properties
            </Link>
          </CardHeader>
          {loading ? (
            <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-28 rounded-lg" />
              ))}
            </CardBody>
          ) : properties.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title="No properties configured"
              description="Add a property in Settings to start managing rooms, reservations, and folios."
            />
          ) : (
            <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {properties.map((property) => (
                <div key={property.id} className="rounded-lg border border-line p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{property.name}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        {[property.code, property.city, property.country].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {property.status ? <Badge tone={property.status === 'ACTIVE' ? 'success' : 'neutral'}>{property.status}</Badge> : null}
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                    <div>
                      <dt className="hf-caption">Rooms</dt>
                      <dd className="text-sm font-semibold tabular-nums text-ink-900">{property._count?.rooms || 0}</dd>
                    </div>
                    <div>
                      <dt className="hf-caption">Guests</dt>
                      <dd className="text-sm font-semibold tabular-nums text-ink-900">{property._count?.guests || 0}</dd>
                    </div>
                    <div>
                      <dt className="hf-caption">Outlets</dt>
                      <dd className="text-sm font-semibold tabular-nums text-ink-900">{property._count?.outlets || 0}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </CardBody>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <StatusBreakdown
            title="Room availability"
            description={`${rooms.length} rooms tracked`}
            items={roomBreakdown}
            className="lg:col-span-1"
            footer={
              <Link href="/rooms" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                Open rooms
              </Link>
            }
          />

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle description="Latest booking activity">Reservations</CardTitle>
              <Link href="/reservations" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                View all
              </Link>
            </CardHeader>
            {loading ? (
              <CardBody className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10" />
                ))}
              </CardBody>
            ) : reservations.length === 0 ? (
              <EmptyState
                size="icon"
                title="No reservations yet"
                description="Create a reservation to see booking activity here."
              />
            ) : (
              <TableWrapper>
                <Table>
                  <THead>
                    <tr>
                      <TH>Confirmation</TH>
                      <TH>Guest</TH>
                      <TH>Stay</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {reservations.slice(0, 6).map((reservation) => (
                      <TR key={reservation.id}>
                        <TD className="font-medium text-ink-900">{reservation.confirmationCode}</TD>
                        <TD className="text-ink-500">{fullName(reservation.guest)}</TD>
                        <TD className="text-ink-500">
                          {formatDate(reservation.checkInDate)} - {formatDate(reservation.checkOutDate)}
                        </TD>
                        <TD>
                          <StatusBadge status={reservation.status} registry={RESERVATION_STATUS} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            )}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle description="Most recently added profiles">Guests</CardTitle>
              <Link href="/guests" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                View all
              </Link>
            </CardHeader>
            {loading ? (
              <CardBody className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10" />
                ))}
              </CardBody>
            ) : guests.length === 0 ? (
              <EmptyState size="icon" icon={<Users className="h-5 w-5" />} title="No guests yet" description="Guest profiles will appear here." />
            ) : (
              <CardBody className="divide-y divide-line">
                {guests.slice(0, 6).map((guest) => (
                  <div key={guest.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{fullName(guest)}</p>
                      <p className="truncate text-xs text-ink-500">{guest.email || guest.phone || 'No contact details'}</p>
                    </div>
                    {guest.isVip ? <Badge tone="accent">VIP</Badge> : null}
                  </div>
                ))}
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle description="Outstanding guest balances">Folios</CardTitle>
              <Link href="/finance" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                Open finance
              </Link>
            </CardHeader>
            {loading ? (
              <CardBody className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10" />
                ))}
              </CardBody>
            ) : folios.length === 0 ? (
              <EmptyState size="icon" icon={<ReceiptText className="h-5 w-5" />} title="No folios yet" description="Folios are created when a reservation is confirmed." />
            ) : (
              <CardBody className="divide-y divide-line">
                {folios.slice(0, 6).map((folio) => (
                  <div key={folio.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">{folio.folioNumber}</p>
                      <p className="truncate text-xs text-ink-500">{fullName(folio.guest)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-medium tabular-nums text-ink-900">{formatCurrency(folio.balance || 0)}</span>
                      <StatusBadge status={folio.status} registry={FOLIO_STATUS} showDot={false} />
                    </div>
                  </div>
                ))}
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </ModuleShell>
  )
}
