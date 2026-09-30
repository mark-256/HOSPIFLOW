'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Search, Users } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState, NoResultsState } from '@/components/ui/States'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { Pagination } from '@/components/ui/Pagination'
import { Dialog, Drawer } from '@/components/ui/Modal'
import { Checkbox, Field, FormGrid, Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { formatDate, fullName, initials } from '@/lib/format'

type Guest = {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  nationality?: string
  idNumber?: string
  idType?: string
  address?: string
  city?: string
  country?: string
  isVip?: boolean
  createdAt?: string
  property?: { name?: string } | null
}

const EMPTY_FORM = {
  propertyId: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  nationality: '',
  idNumber: '',
  idType: '',
  address: '',
  city: '',
  country: '',
  isVip: false,
}

export default function GuestsPage() {
  const toast = useToast()
  const [guests, setGuests] = useState<Guest[]>([])
  const [meta, setMeta] = useState<{ total?: number; totalPages?: number }>({})
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [detail, setDetail] = useState<Guest | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [guestResponse, propertyResponse] = await Promise.all([
        apiRequest<Guest[]>(`/api/guests?limit=${limit}&page=${page}`),
        apiRequest<Array<{ id: string; name: string }>>('/api/properties'),
      ])
      setGuests(responseData(guestResponse))
      setMeta({ total: guestResponse.meta?.total as number | undefined, totalPages: guestResponse.meta?.totalPages as number | undefined })
      setProperties(responseData(propertyResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load guests'))
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
      await apiRequest('/api/guests', { method: 'POST', body: JSON.stringify(form) })
      setForm(EMPTY_FORM)
      setShowForm(false)
      toast.success('Guest saved', `${form.firstName} ${form.lastName} was added to the directory.`)
      await load()
    } catch (reason) {
      setFormError(getErrorMessage(reason, 'Unable to save guest'))
    } finally {
      setSaving(false)
    }
  }

  const visibleGuests = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return guests
    return guests.filter((guest) =>
      [fullName(guest), guest.email, guest.phone, guest.nationality, guest.idNumber]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [guests, query])

  const vipCount = guests.filter((guest) => guest.isVip).length

  return (
    <ModuleShell
      title="Guests"
      description="Guest profiles, contact details, and VIP recognition"
      actions={
        <Button size="sm" onClick={() => setShowForm(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
          <span className="hidden sm:inline">Add guest</span>
          <span className="sm:hidden">Add</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorState title="Unable to load guests" message={error} onRetry={() => void load()} /> : null}

        <Card>
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="relative w-full sm:max-w-sm">
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email, phone, or ID"
                aria-label="Search guests"
                leadingSlot={<Search aria-hidden="true" className="h-4 w-4" />}
              />
            </div>
            <p className="hf-caption tabular-nums">
              {meta.total ? `${meta.total} guests` : `${guests.length} on this page`}
              {vipCount > 0 ? ` · ${vipCount} VIP on this page` : ''}
            </p>
          </div>
        </Card>

        {loading ? (
          <SkeletonTable rows={6} columns={4} />
        ) : guests.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No guests yet"
              description="Add a guest profile to start recording stays, preferences, and loyalty activity."
              action={
                <Button size="sm" onClick={() => setShowForm(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                  Add guest
                </Button>
              }
            />
          </Card>
        ) : visibleGuests.length === 0 ? (
          <Card>
            <NoResultsState query={query} onClear={() => setQuery('')} />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <TableWrapper>
              <Table>
                <THead>
                  <tr>
                    <TH>Guest</TH>
                    <TH>Contact</TH>
                    <TH>Property</TH>
                    <TH>Location</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Details</TH>
                  </tr>
                </THead>
                <TBody>
                  {visibleGuests.map((guest) => (
                    <TR key={guest.id}>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-2xs font-semibold text-ink-600"
                          >
                            {initials(guest.firstName, guest.lastName)}
                          </span>
                          <span className="font-medium text-ink-900">{fullName(guest)}</span>
                        </div>
                      </TD>
                      <TD className="text-ink-500">{guest.email || guest.phone || 'Not recorded'}</TD>
                      <TD className="text-ink-500">{guest.property?.name || 'Unassigned'}</TD>
                      <TD className="text-ink-500">
                        {[guest.city, guest.country].filter(Boolean).join(', ') || 'Not recorded'}
                      </TD>
                      <TD>
                        {guest.isVip ? <Badge tone="accent">VIP</Badge> : <span className="text-xs text-ink-400">Standard</span>}
                      </TD>
                      <TD className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setDetail(guest)}>
                          View
                        </Button>
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
              itemLabel="guests"
            />
          </Card>
        )}
      </div>

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add guest"
        description="Store the guest profile used across reservations, folios, and loyalty."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" form="guest-form" loading={saving} loadingLabel="Saving">
              Save guest
            </Button>
          </>
        }
      >
        <form id="guest-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError ? <ErrorState compact title="Unable to save guest" message={formError} /> : null}
          <FormGrid>
            <Field label="Property" htmlFor="guestProperty" required>
              <Select
                id="guestProperty"
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
            <Field label="First name" htmlFor="firstName" required>
              <Input
                id="firstName"
                required
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
              />
            </Field>
            <Field label="Last name" htmlFor="lastName" required>
              <Input
                id="lastName"
                required
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              />
            </Field>
            <Field label="Email" htmlFor="email" hint="Used for confirmations and receipts.">
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
            <Field label="Nationality" htmlFor="nationality">
              <Input
                id="nationality"
                value={form.nationality}
                onChange={(event) => setForm({ ...form, nationality: event.target.value })}
              />
            </Field>
            <Field label="ID type" htmlFor="idType">
              <Input id="idType" value={form.idType} onChange={(event) => setForm({ ...form, idType: event.target.value })} />
            </Field>
            <Field label="ID number" htmlFor="idNumber">
              <Input
                id="idNumber"
                value={form.idNumber}
                onChange={(event) => setForm({ ...form, idNumber: event.target.value })}
              />
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            </Field>
            <Field label="Country" htmlFor="country">
              <Input
                id="country"
                value={form.country}
                onChange={(event) => setForm({ ...form, country: event.target.value })}
              />
            </Field>
          </FormGrid>
          <Field label="Address" htmlFor="address">
            <Input id="address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
          </Field>
          <Checkbox
            id="isVip"
            label="VIP guest"
            description="VIP guests are highlighted across reservations, folios, and loyalty."
            checked={form.isVip}
            onChange={(event) => setForm({ ...form, isVip: event.target.checked })}
          />
        </form>
      </Dialog>

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? fullName(detail) : 'Guest'}
        description={detail?.isVip ? 'VIP guest' : 'Guest profile'}
        footer={
          <Button variant="outline" onClick={() => setDetail(null)}>
            Close
          </Button>
        }
      >
        {detail ? (
          <dl className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="hf-caption">Email</dt>
                <dd className="mt-0.5 font-medium text-ink-900">{detail.email || 'Not recorded'}</dd>
              </div>
              <div>
                <dt className="hf-caption">Phone</dt>
                <dd className="mt-0.5 font-medium text-ink-900">{detail.phone || 'Not recorded'}</dd>
              </div>
              <div>
                <dt className="hf-caption">Nationality</dt>
                <dd className="mt-0.5 font-medium text-ink-900">{detail.nationality || 'Not recorded'}</dd>
              </div>
              <div>
                <dt className="hf-caption">Property</dt>
                <dd className="mt-0.5 font-medium text-ink-900">{detail.property?.name || 'Unassigned'}</dd>
              </div>
              <div>
                <dt className="hf-caption">Identity</dt>
                <dd className="mt-0.5 font-medium text-ink-900">
                  {detail.idNumber ? `${detail.idType || 'ID'}: ${detail.idNumber}` : 'Not recorded'}
                </dd>
              </div>
              <div>
                <dt className="hf-caption">Added</dt>
                <dd className="mt-0.5 font-medium text-ink-900">{formatDate(detail.createdAt)}</dd>
              </div>
            </div>
            <div>
              <dt className="hf-caption">Address</dt>
              <dd className="mt-1 rounded-md border border-line bg-surface-muted px-3 py-2 text-ink-700">
                {[detail.address, detail.city, detail.country].filter(Boolean).join(', ') || 'Not recorded'}
              </dd>
            </div>
            <p className="rounded-md border border-line bg-surface-muted px-3 py-2 text-xs text-ink-500">
              Stay history and folio balances are available in the Reservations and Finance modules.
            </p>
          </dl>
        ) : null}
      </Drawer>
    </ModuleShell>
  )
}
