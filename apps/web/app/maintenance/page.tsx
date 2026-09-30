'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Wrench } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import MetricCard from '@/components/dashboard/MetricCard'
import { StatusBreakdown, buildBreakdown } from '@/components/dashboard/ChartCard'
import Button from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Card, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { SkeletonStatGrid, SkeletonTable } from '@/components/ui/Skeleton'
import { Dialog } from '@/components/ui/Modal'
import { Field, FormGrid, Input, Select, Textarea } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { MAINTENANCE_STATUS, PRIORITY_STATUS, countByStatus } from '@/lib/status'
import { formatDate } from '@/lib/format'

type Ticket = {
  id: string
  title: string
  description?: string | null
  priority: string
  category?: string
  status: string
  createdAt?: string
  room?: { roomNumber?: string } | null
  roomId?: string | null
  assignee?: { firstName?: string; lastName?: string } | null
}

const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'OPEN', label: 'Open' },
  { id: 'ASSIGNED', label: 'Assigned' },
  { id: 'IN_PROGRESS', label: 'In progress' },
  { id: 'RESOLVED', label: 'Resolved' },
  { id: 'CLOSED', label: 'Closed' },
]

const EMPTY_FORM = { propertyId: '', roomId: '', title: '', description: '', priority: 'MEDIUM', category: 'GENERAL' }

export default function MaintenancePage() {
  const toast = useToast()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [rooms, setRooms] = useState<Array<{ id: string; roomNumber: string }>>([])
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [rowBusy, setRowBusy] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ticketResponse, roomResponse, propertyResponse] = await Promise.all([
        apiRequest<Ticket[]>('/api/maintenance?limit=100'),
        apiRequest<Array<{ id: string; roomNumber: string }>>('/api/rooms?limit=100'),
        apiRequest<Array<{ id: string; name: string }>>('/api/properties'),
      ])
      setTickets(responseData(ticketResponse))
      setRooms(responseData(roomResponse))
      setProperties(responseData(propertyResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load maintenance tickets'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await apiRequest('/api/maintenance', { method: 'POST', body: JSON.stringify(form) })
      setForm(EMPTY_FORM)
      setShowForm(false)
      toast.success('Ticket created', 'The maintenance ticket is now in the queue.')
      await load()
    } catch (reason) {
      setFormError(getErrorMessage(reason, 'Unable to create maintenance ticket'))
    } finally {
      setSaving(false)
    }
  }

  const update = async (ticket: Ticket, status: string) => {
    setRowBusy(ticket.id)
    setError('')
    try {
      await apiRequest(`/api/maintenance/${ticket.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      toast.success('Ticket updated', `${ticket.title} moved to ${MAINTENANCE_STATUS[status as keyof typeof MAINTENANCE_STATUS]?.label.toLowerCase() || status}.`)
      await load()
    } catch (reason) {
      const message = getErrorMessage(reason, 'Unable to update maintenance ticket')
      setError(message)
      toast.error('Update failed', message)
    } finally {
      setRowBusy('')
    }
  }

  const visibleTickets = useMemo(
    () => (statusFilter === 'ALL' ? tickets : tickets.filter((ticket) => ticket.status === statusFilter)),
    [tickets, statusFilter],
  )

  const counts = useMemo(() => {
    const open = tickets.filter((ticket) => !['RESOLVED', 'CLOSED'].includes(ticket.status)).length
    const urgent = tickets.filter((ticket) => ['HIGH', 'URGENT'].includes(ticket.priority) && !['RESOLVED', 'CLOSED'].includes(ticket.status)).length
    return { open, urgent }
  }, [tickets])

  return (
    <ModuleShell
      title="Maintenance"
      description="Property tickets, repairs, and resolution tracking"
      actions={
        <Button size="sm" onClick={() => setShowForm(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
          <span className="hidden sm:inline">Create ticket</span>
          <span className="sm:hidden">New</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorState title="Maintenance" message={error} onRetry={() => void load()} compact /> : null}

        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Tickets" value={tickets.length} icon={Wrench} tone="brand" loading={loading} />
          <MetricCard label="Open tickets" value={counts.open} icon={Wrench} tone="info" loading={loading} />
          <MetricCard
            label="High priority"
            value={counts.urgent}
            icon={Wrench}
            tone={counts.urgent > 0 ? 'danger' : 'neutral'}
            hint="Open high or urgent tickets"
            loading={loading}
          />
          <MetricCard label="Resolved" value={tickets.filter((ticket) => ['RESOLVED', 'CLOSED'].includes(ticket.status)).length} icon={Wrench} tone="success" loading={loading} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="overflow-hidden lg:col-span-2">
            <div className="px-2 sm:px-3">
              <Tabs
                ariaLabel="Filter maintenance tickets"
                items={FILTERS.map((filter) => ({
                  ...filter,
                  count: filter.id === 'ALL' ? tickets.length : tickets.filter((ticket) => ticket.status === filter.id).length,
                }))}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
            {loading ? (
              <div className="px-4 py-4 sm:px-5">
                <SkeletonTable rows={5} columns={4} className="border-0 shadow-none" />
              </div>
            ) : tickets.length === 0 ? (
              <EmptyState
                icon={<Wrench className="h-5 w-5" />}
                title="No maintenance tickets"
                description="Log a ticket to track repairs and technical issues for the property."
                action={
                  <Button size="sm" onClick={() => setShowForm(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                    Create ticket
                  </Button>
                }
              />
            ) : visibleTickets.length === 0 ? (
              <EmptyState
                size="icon"
                title="No tickets in this state"
                description="Switch to another status to see the rest of the queue."
                action={
                  <Button variant="outline" size="sm" onClick={() => setStatusFilter('ALL')}>
                    Show all tickets
                  </Button>
                }
              />
            ) : (
              <TableWrapper>
                <Table>
                  <THead>
                    <tr>
                      <TH>Ticket</TH>
                      <TH>Location</TH>
                      <TH>Priority</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Actions</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {visibleTickets.map((ticket) => (
                      <TR key={ticket.id}>
                        <TD>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink-900">{ticket.title}</p>
                            <p className="truncate text-xs text-ink-500">
                              {(ticket.category || 'General').toLowerCase()} · {formatDate(ticket.createdAt)}
                            </p>
                          </div>
                        </TD>
                        <TD className="text-ink-500">
                          {ticket.room ? `Room ${ticket.room.roomNumber}` : ticket.roomId ? 'Room' : 'Property-wide'}
                        </TD>
                        <TD>
                          <StatusBadge status={ticket.priority} registry={PRIORITY_STATUS} />
                        </TD>
                        <TD>
                          <StatusBadge status={ticket.status} registry={MAINTENANCE_STATUS} />
                        </TD>
                        <TD className="text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {ticket.status === 'OPEN' ? (
                              <Button size="sm" variant="outline" loading={rowBusy === ticket.id} onClick={() => void update(ticket, 'ASSIGNED')}>
                                Assign
                              </Button>
                            ) : null}
                            {ticket.status === 'ASSIGNED' ? (
                              <Button size="sm" variant="outline" loading={rowBusy === ticket.id} onClick={() => void update(ticket, 'IN_PROGRESS')}>
                                Start
                              </Button>
                            ) : null}
                            {['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'].includes(ticket.status) ? (
                              <Button size="sm" variant="outline" loading={rowBusy === ticket.id} onClick={() => void update(ticket, 'RESOLVED')}>
                                Resolve
                              </Button>
                            ) : null}
                            {ticket.status === 'RESOLVED' ? (
                              <Button size="sm" variant="outline" loading={rowBusy === ticket.id} onClick={() => void update(ticket, 'CLOSED')}>
                                Close
                              </Button>
                            ) : null}
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            )}
          </Card>

          <StatusBreakdown
            title="Ticket status"
            description="Distribution across the maintenance queue"
            items={buildBreakdown(countByStatus(tickets, 'status'), MAINTENANCE_STATUS, ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'])}
          />
        </div>
      </div>

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title="New maintenance ticket"
        description="Record the issue, location, and priority for the technical team."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" form="maintenance-form" loading={saving} loadingLabel="Creating">
              Create ticket
            </Button>
          </>
        }
      >
        <form id="maintenance-form" onSubmit={submit} className="space-y-4" noValidate>
          {formError ? <ErrorState compact title="Unable to create ticket" message={formError} /> : null}
          <FormGrid>
            <Field label="Property" htmlFor="ticketProperty" required>
              <Select id="ticketProperty" required value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })}>
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Room" htmlFor="ticketRoom" hint="Optional - leave empty for property-wide issues.">
              <Select id="ticketRoom" value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })}>
                <option value="">Property-wide</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    Room {room.roomNumber}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="ticketPriority" required>
              <Select id="ticketPriority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </Field>
            <Field label="Category" htmlFor="ticketCategory" required className="sm:col-span-2">
              <Select id="ticketCategory" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                <option value="GENERAL">General</option>
                <option value="ELECTRICAL">Electrical</option>
                <option value="PLUMBING">Plumbing</option>
                <option value="HVAC">HVAC</option>
                <option value="APPLIANCE">Appliance</option>
              </Select>
            </Field>
            <Field label="Title" htmlFor="ticketTitle" required className="sm:col-span-2 lg:col-span-3">
              <Input id="ticketTitle" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </Field>
          </FormGrid>
          <Field label="Description" htmlFor="ticketDescription" required>
            <Textarea
              id="ticketDescription"
              required
              rows={4}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
        </form>
      </Dialog>
    </ModuleShell>
  )
}
