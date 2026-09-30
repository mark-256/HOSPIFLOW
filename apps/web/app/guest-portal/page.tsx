'use client'

import { useCallback, useEffect, useState } from 'react'
import { Globe2, Search, UserRound } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import { StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { Field, Input, Select } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { FOLIO_STATUS, RESERVATION_STATUS } from '@/lib/status'
import { formatCurrency, formatDate, fullName } from '@/lib/format'

type Guest = { id: string; firstName?: string; lastName?: string; email?: string; phone?: string }

type PortalReservation = {
  id: string
  confirmationCode: string
  status: string
  checkInDate: string
  checkOutDate: string
  room?: { roomNumber?: string } | null
}

type PortalFolio = { id: string; folioNumber: string; status: string; balance: number | string }

export default function GuestPortalPage() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [guestId, setGuestId] = useState('')
  const [query, setQuery] = useState('')
  const [reservations, setReservations] = useState<PortalReservation[]>([])
  const [folios, setFolios] = useState<PortalFolio[]>([])
  const [view, setView] = useState<'reservations' | 'folios'>('reservations')
  const [loading, setLoading] = useState(false)
  const [loadingGuests, setLoadingGuests] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadGuests = async () => {
      try {
        const response = await apiRequest<Guest[]>('/api/guests?limit=100')
        setGuests(responseData(response))
      } catch (reason) {
        setError(getErrorMessage(reason, 'Unable to load guests'))
      } finally {
        setLoadingGuests(false)
      }
    }
    void loadGuests()
  }, [])

  const load = useCallback(async () => {
    if (!guestId) {
      setReservations([])
      setFolios([])
      setError('')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<Array<PortalReservation | PortalFolio>>(
        `/api/guest-portal/${view}?guestId=${encodeURIComponent(guestId)}`,
      )
      if (view === 'reservations') setReservations(responseData(response) as PortalReservation[])
      else setFolios(responseData(response) as PortalFolio[])
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load guest portal data'))
    } finally {
      setLoading(false)
    }
  }, [guestId, view])

  useEffect(() => {
    void load()
  }, [load])

  const matchedGuests = query.trim()
    ? guests.filter((guest) =>
        [fullName(guest), guest.email, guest.phone]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query.trim().toLowerCase())),
      )
    : guests

  return (
    <ModuleShell title="Guest Portal" description="View a guest's reservations and folios">
      <div className="space-y-4">
        {error ? <ErrorState title="Unable to load guest portal data" message={error} onRetry={() => void load()} /> : null}

        <Card>
          <CardHeader>
            <CardTitle description="Search the directory or paste a guest identifier">Find a guest</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label="Search guests" htmlFor="portalQuery">
                <Input
                  id="portalQuery"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name, email, or phone"
                  aria-label="Search guests"
                  leadingSlot={<Search aria-hidden="true" className="h-4 w-4" />}
                />
              </Field>
              <Field label="Guest ID" htmlFor="portalGuestId" hint="Used directly by the portal API.">
                <Input
                  id="portalGuestId"
                  value={guestId}
                  onChange={(event) => setGuestId(event.target.value.trim())}
                  placeholder="Paste a guest identifier"
                />
              </Field>
            </div>
            <Field label="Guest from directory" htmlFor="portalGuestSelect">
              <Select id="portalGuestSelect" value={guestId} onChange={(event) => setGuestId(event.target.value)}>
                <option value="">{loadingGuests ? 'Loading guests...' : 'Select a guest'}</option>
                {matchedGuests.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {fullName(guest)} · {guest.email || guest.phone || guest.id}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-2 sm:px-3">
            <Tabs
              ariaLabel="Guest portal records"
              items={[
                { id: 'reservations', label: 'Reservations' },
                { id: 'folios', label: 'Folios' },
              ]}
              value={view}
              onChange={(value) => setView(value as 'reservations' | 'folios')}
            />
          </div>

          {loading ? (
            <div className="px-4 py-4 sm:px-5">
              <SkeletonTable rows={4} columns={4} className="border-0 shadow-none" />
            </div>
          ) : !guestId ? (
            <EmptyState
              icon={<Globe2 className="h-5 w-5" />}
              title="Select a guest"
              description="Choose a guest from the directory or enter a guest ID to view their portal."
            />
          ) : view === 'reservations' ? (
            reservations.length === 0 ? (
              <EmptyState
                size="icon"
                icon={<UserRound className="h-5 w-5" />}
                title="No reservations for this guest"
                description="Reservations linked to this guest will appear here."
              />
            ) : (
              <TableWrapper>
                <Table>
                  <THead>
                    <tr>
                      <TH>Confirmation</TH>
                      <TH>Room</TH>
                      <TH>Check-in</TH>
                      <TH>Check-out</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {reservations.map((reservation) => (
                      <TR key={reservation.id}>
                        <TD className="font-medium text-ink-900">{reservation.confirmationCode}</TD>
                        <TD className="text-ink-500">{reservation.room ? `Room ${reservation.room.roomNumber}` : 'Unassigned'}</TD>
                        <TD className="text-ink-500">{formatDate(reservation.checkInDate)}</TD>
                        <TD className="text-ink-500">{formatDate(reservation.checkOutDate)}</TD>
                        <TD>
                          <StatusBadge status={reservation.status} registry={RESERVATION_STATUS} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            )
          ) : folios.length === 0 ? (
            <EmptyState
              size="icon"
              icon={<UserRound className="h-5 w-5" />}
              title="No folios for this guest"
              description="Guest folios and their balances will appear here."
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <tr>
                    <TH>Folio</TH>
                    <TH className="text-right">Balance</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {folios.map((folio) => (
                    <TR key={folio.id}>
                      <TD className="font-mono text-xs font-medium text-ink-900">{folio.folioNumber}</TD>
                      <TD className="text-right font-medium tabular-nums">{formatCurrency(folio.balance || 0)}</TD>
                      <TD>
                        <StatusBadge status={folio.status} registry={FOLIO_STATUS} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </Card>

        <Button variant="outline" size="sm" onClick={() => void load()} disabled={!guestId}>
          Refresh portal data
        </Button>
      </div>
    </ModuleShell>
  )
}
