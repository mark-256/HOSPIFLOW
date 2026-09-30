'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardList, Plus, Sparkles } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import MetricCard from '@/components/dashboard/MetricCard'
import Button from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Card, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { SkeletonStatGrid, SkeletonTable } from '@/components/ui/Skeleton'
import { Dialog } from '@/components/ui/Modal'
import { Field, FormGrid, Select, Textarea } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { HOUSEKEEPING_STATUS, PRIORITY_STATUS, countByStatus } from '@/lib/status'
import { buildBreakdown, StatusBreakdown } from '@/components/dashboard/ChartCard'

type Task = {
  id: string
  type: string
  priority: string
  status: string
  notes?: string | null
  createdAt?: string
  room?: { roomNumber?: string } | null
  roomId?: string | null
  assignee?: { firstName?: string; lastName?: string } | null
}

const TASK_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'ASSIGNED', label: 'Assigned' },
  { id: 'IN_PROGRESS', label: 'In progress' },
  { id: 'INSPECTION', label: 'Inspection' },
  { id: 'VERIFIED', label: 'Verified' },
]

const NEXT_ACTIONS: Record<string, { label: string; status: string }> = {
  PENDING: { label: 'Assign', status: 'ASSIGNED' },
  ASSIGNED: { label: 'Start', status: 'IN_PROGRESS' },
  IN_PROGRESS: { label: 'Complete', status: 'INSPECTION' },
  INSPECTION: { label: 'Verify', status: 'VERIFIED' },
}

const EMPTY_FORM = { propertyId: '', roomId: '', type: 'CLEANING', priority: 'NORMAL', notes: '' }

export default function HousekeepingPage() {
  const toast = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
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
      const [taskResponse, roomResponse, propertyResponse] = await Promise.all([
        apiRequest<Task[]>('/api/housekeeping?limit=100'),
        apiRequest<Array<{ id: string; roomNumber: string }>>('/api/rooms?limit=100'),
        apiRequest<Array<{ id: string; name: string }>>('/api/properties'),
      ])
      setTasks(responseData(taskResponse))
      setRooms(responseData(roomResponse))
      setProperties(responseData(propertyResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load housekeeping tasks'))
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
      await apiRequest('/api/housekeeping', { method: 'POST', body: JSON.stringify(form) })
      setForm(EMPTY_FORM)
      setShowForm(false)
      toast.success('Task created', 'The task was added to the housekeeping queue.')
      await load()
    } catch (reason) {
      setFormError(getErrorMessage(reason, 'Unable to create housekeeping task'))
    } finally {
      setSaving(false)
    }
  }

  const update = async (task: Task, status: string) => {
    setRowBusy(task.id)
    setError('')
    try {
      await apiRequest(`/api/housekeeping/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      toast.success('Task updated', `Room ${task.room?.roomNumber || ''} moved to ${HOUSEKEEPING_STATUS[status as keyof typeof HOUSEKEEPING_STATUS]?.label.toLowerCase() || status}.`)
      await load()
    } catch (reason) {
      const message = getErrorMessage(reason, 'Unable to update housekeeping task')
      setError(message)
      toast.error('Update failed', message)
    } finally {
      setRowBusy('')
    }
  }

  const visibleTasks = useMemo(
    () => (statusFilter === 'ALL' ? tasks : tasks.filter((task) => task.status === statusFilter)),
    [tasks, statusFilter],
  )

  const counts = useMemo(() => {
    const open = tasks.filter((task) => !['VERIFIED', 'COMPLETED'].includes(task.status)).length
    const urgent = tasks.filter((task) => ['HIGH', 'URGENT'].includes(task.priority) && !['VERIFIED', 'COMPLETED'].includes(task.status)).length
    return { open, urgent }
  }, [tasks])

  return (
    <ModuleShell
      title="Housekeeping"
      description="Room cleaning, turndown, and inspection workflow"
      actions={
        <Button size="sm" onClick={() => setShowForm(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
          <span className="hidden sm:inline">Create task</span>
          <span className="sm:hidden">New</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorState title="Housekeeping" message={error} onRetry={() => void load()} compact /> : null}

        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Tasks" value={tasks.length} icon={ClipboardList} tone="brand" loading={loading} />
          <MetricCard label="Open tasks" value={counts.open} icon={Sparkles} tone="info" loading={loading} />
          <MetricCard
            label="High priority"
            value={counts.urgent}
            icon={Sparkles}
            tone={counts.urgent > 0 ? 'warning' : 'neutral'}
            hint="Open high or urgent tasks"
            loading={loading}
          />
          <MetricCard label="Rooms tracked" value={rooms.length} icon={ClipboardList} tone="accent" loading={loading} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="overflow-hidden lg:col-span-2">
            <div className="px-2 sm:px-3">
              <Tabs
                ariaLabel="Filter housekeeping tasks"
                items={TASK_FILTERS.map((filter) => ({
                  ...filter,
                  count: filter.id === 'ALL' ? tasks.length : tasks.filter((task) => task.status === filter.id).length,
                }))}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
            {loading ? (
              <div className="px-4 py-4 sm:px-5">
                <SkeletonTable rows={5} columns={4} className="border-0 shadow-none" />
              </div>
            ) : tasks.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title="No housekeeping tasks"
                description="Create a cleaning, turndown, or inspection task for a room."
                action={
                  <Button size="sm" onClick={() => setShowForm(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                    Create task
                  </Button>
                }
              />
            ) : visibleTasks.length === 0 ? (
              <EmptyState
                size="icon"
                title="No tasks in this state"
                description="Switch to another status to see the rest of the queue."
                action={
                  <Button variant="outline" size="sm" onClick={() => setStatusFilter('ALL')}>
                    Show all tasks
                  </Button>
                }
              />
            ) : (
              <TableWrapper>
                <Table>
                  <THead>
                    <tr>
                      <TH>Room</TH>
                      <TH>Type</TH>
                      <TH>Priority</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Action</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {visibleTasks.map((task) => {
                      const action = NEXT_ACTIONS[task.status]
                      return (
                        <TR key={task.id}>
                          <TD className="font-medium text-ink-900">Room {task.room?.roomNumber || task.roomId || 'Unassigned'}</TD>
                          <TD className="text-ink-500">{task.type.replace(/_/g, ' ').toLowerCase()}</TD>
                          <TD>
                            <StatusBadge status={task.priority} registry={PRIORITY_STATUS} />
                          </TD>
                          <TD>
                            <StatusBadge status={task.status} registry={HOUSEKEEPING_STATUS} />
                          </TD>
                          <TD className="text-right">
                            {action ? (
                              <Button size="sm" variant="outline" loading={rowBusy === task.id} onClick={() => void update(task, action.status)}>
                                {action.label}
                              </Button>
                            ) : (
                              <span className="text-xs text-ink-400">Complete</span>
                            )}
                          </TD>
                        </TR>
                      )
                    })}
                  </TBody>
                </Table>
              </TableWrapper>
            )}
          </Card>

          <StatusBreakdown
            title="Task status"
            description="Distribution across the housekeeping queue"
            items={buildBreakdown(countByStatus(tasks, 'status'), HOUSEKEEPING_STATUS, ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'INSPECTION', 'VERIFIED'])}
          />
        </div>
      </div>

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title="New housekeeping task"
        description="Assign room work and set the service priority."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" form="housekeeping-form" loading={saving} loadingLabel="Creating">
              Create task
            </Button>
          </>
        }
      >
        <form id="housekeeping-form" onSubmit={submit} className="space-y-4" noValidate>
          {formError ? <ErrorState compact title="Unable to create task" message={formError} /> : null}
          <FormGrid>
            <Field label="Property" htmlFor="taskProperty" required>
              <Select id="taskProperty" required value={form.propertyId} onChange={(event) => setForm({ ...form, propertyId: event.target.value })}>
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Room" htmlFor="taskRoom" required>
              <Select id="taskRoom" required value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })}>
                <option value="">Select room</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    Room {room.roomNumber}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type" htmlFor="taskType" required>
              <Select id="taskType" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                <option value="CLEANING">Cleaning</option>
                <option value="INSPECTION">Inspection</option>
                <option value="TURNDOWN">Turndown</option>
                <option value="DEEP_CLEAN">Deep clean</option>
              </Select>
            </Field>
            <Field label="Priority" htmlFor="taskPriority" required>
              <Select id="taskPriority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </Field>
          </FormGrid>
          <Field label="Notes" htmlFor="taskNotes" className="sm:col-span-2">
            <Textarea id="taskNotes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
        </form>
      </Dialog>
    </ModuleShell>
  )
}
