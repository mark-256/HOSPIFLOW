'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Monitor, Plus, RefreshCw, Store, UserCog, Users } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import MetricCard from '@/components/dashboard/MetricCard'
import { StatusBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { SkeletonStatGrid, SkeletonTable } from '@/components/ui/Skeleton'
import { Dialog } from '@/components/ui/Modal'
import { Field, FormGrid, Input, Select } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { ENTITY_STATUS } from '@/lib/status'
import { formatDate, formatDateTime, initials } from '@/lib/format'

type Property = { id: string; name: string; code: string; city?: string; country?: string; currency?: string; status?: string; createdAt?: string }
type Outlet = { id: string; name: string; code: string; type: string; status?: string; propertyId: string }
type Terminal = { id: string; name: string; code: string; status?: string; outletId: string }
type User = { id: string; email: string; firstName: string; lastName: string; isActive?: boolean; createdAt?: string; role?: { id: string; name: string } | null }
type Organization = { id: string; name?: string; slug?: string; status?: string; createdAt?: string } | null
type Account = { id?: string; email?: string; firstName?: string; lastName?: string; role?: string; permissions?: string[]; organization?: { id?: string; name?: string } }

type TabId = 'account' | 'organization' | 'properties' | 'outlets' | 'terminals' | 'users'

const TAB_ITEMS = [
  { id: 'account' as TabId, label: 'Account' },
  { id: 'organization' as TabId, label: 'Organization' },
  { id: 'properties' as TabId, label: 'Properties' },
  { id: 'outlets' as TabId, label: 'Outlets' },
  { id: 'terminals' as TabId, label: 'Terminals' },
  { id: 'users' as TabId, label: 'Users' },
]

const EMPTY_PROPERTY = { name: '', code: '', city: '', country: '', currency: 'KES', timezone: 'Africa/Nairobi' }
const EMPTY_OUTLET = { propertyId: '', name: '', code: '', type: 'RESTAURANT' }
const EMPTY_TERMINAL = { outletId: '', name: '', code: '' }
const EMPTY_USER = { roleId: '', email: '', password: '', firstName: '', lastName: '', phone: '' }

export default function SettingsPage() {
  const toast = useToast()
  const [tab, setTab] = useState<TabId>('account')
  const [organization, setOrganization] = useState<Organization>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [terminals, setTerminals] = useState<Terminal[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [propertyOpen, setPropertyOpen] = useState(false)
  const [outletOpen, setOutletOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [propertyForm, setPropertyForm] = useState(EMPTY_PROPERTY)
  const [outletForm, setOutletForm] = useState(EMPTY_OUTLET)
  const [terminalForm, setTerminalForm] = useState(EMPTY_TERMINAL)
  const [userForm, setUserForm] = useState(EMPTY_USER)

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab') as TabId | null
    if (requested && TAB_ITEMS.some((item) => item.id === requested)) setTab(requested)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [accountResponse, organizationResponse, propertyResponse, outletResponse, terminalResponse, userResponse] =
        await Promise.all([
          apiRequest<Account>('/api/auth/me'),
          apiRequest<Property[]>('/api/organizations'),
          apiRequest<Property[]>('/api/properties'),
          apiRequest<Outlet[]>('/api/outlets'),
          apiRequest<Terminal[]>('/api/terminals'),
          apiRequest<User[]>('/api/users'),
        ])
      setAccount(accountResponse.data)
      setOrganization(responseData(organizationResponse)[0] || null)
      const nextProperties = responseData(propertyResponse)
      setProperties(nextProperties)
      setOutlets(responseData(outletResponse))
      setTerminals(responseData(terminalResponse))
      const nextUsers = responseData(userResponse)
      setUsers(nextUsers)
      setOutletForm((current) => ({ ...current, propertyId: current.propertyId || nextProperties[0]?.id || '' }))
      setUserForm((current) => ({ ...current, roleId: current.roleId || nextUsers[0]?.role?.id || '' }))
      setTerminalForm((current) => ({ ...current, outletId: current.outletId || responseData(outletResponse)[0]?.id || '' }))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load settings'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const roles = useMemo(() => {
    const map = new Map<string, string>()
    for (const user of users) {
      if (user.role) map.set(user.role.id, user.role.name)
    }
    return Array.from(map.entries())
  }, [users])

  const submit = async (event: React.FormEvent, path: string, body: unknown, reset: () => void, close: () => void, message: string) => {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await apiRequest(path, { method: 'POST', body: JSON.stringify(body) })
      reset()
      close()
      toast.success('Saved', message)
      await load()
    } catch (reason) {
      setFormError(getErrorMessage(reason, 'Unable to save the record'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModuleShell
      title="Settings"
      description="Account, organization, properties, outlets, terminals, and access"
      actions={
        <Button variant="outline" size="sm" onClick={() => void load()} leadingIcon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}>
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorState title="Unable to load settings" message={error} onRetry={() => void load()} /> : null}

        {loading ? (
          <SkeletonStatGrid count={4} />
        ) : (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Properties" value={properties.length} icon={Building2} tone="brand" />
            <MetricCard label="Outlets" value={outlets.length} icon={Store} tone="info" />
            <MetricCard label="Terminals" value={terminals.length} icon={Monitor} tone="accent" />
            <MetricCard label="Users" value={users.length} icon={Users} tone="success" />
          </div>
        )}

        <Card>
          <div className="px-2 sm:px-3">
            <Tabs ariaLabel="Settings sections" items={TAB_ITEMS} value={tab} onChange={(value) => setTab(value as TabId)} />
          </div>

          {loading ? (
            <CardBody>
              <SkeletonTable rows={4} columns={4} className="border-0 shadow-none" />
            </CardBody>
          ) : tab === 'account' ? (
            <CardBody className="space-y-5">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white"
                >
                  {initials(account?.firstName, account?.lastName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink-900">
                    {[account?.firstName, account?.lastName].filter(Boolean).join(' ') || 'Signed-in user'}
                  </p>
                  <p className="truncate text-sm text-ink-500">{account?.email || 'No email on record'}</p>
                </div>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="hf-caption">Role</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink-900">{account?.role || 'Not assigned'}</dd>
                </div>
                <div>
                  <dt className="hf-caption">Organization</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink-900">{account?.organization?.name || 'Not assigned'}</dd>
                </div>
                <div>
                  <dt className="hf-caption">Permissions</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink-900">
                    {Array.isArray(account?.permissions) ? account.permissions.length : 0} granted
                  </dd>
                </div>
              </dl>
              {Array.isArray(account?.permissions) && account.permissions.length > 0 ? (
                <div>
                  <p className="hf-overline mb-2">Granted permissions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {account.permissions.map((permission) => (
                      <span key={permission} className="rounded bg-ink-100 px-2 py-0.5 font-mono text-2xs text-ink-700">
                        {permission}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="rounded-md border border-line bg-surface-muted px-3 py-2.5 text-sm text-ink-600">
                Profile updates are managed by an organization administrator. Contact an administrator to change your
                role or access.
              </p>
            </CardBody>
          ) : tab === 'organization' ? (
            <CardBody>
              <CardHeader className="border-0 px-0 pt-0">
                <CardTitle description="Organization-wide configuration">Organization profile</CardTitle>
              </CardHeader>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="hf-caption">Name</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink-900">{organization?.name || 'Not configured'}</dd>
                </div>
                <div>
                  <dt className="hf-caption">Slug</dt>
                  <dd className="mt-0.5 font-mono text-sm text-ink-900">{organization?.slug || 'Not configured'}</dd>
                </div>
                <div>
                  <dt className="hf-caption">Status</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink-900">{organization?.status || 'Not configured'}</dd>
                </div>
                <div>
                  <dt className="hf-caption">Created</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink-900">{formatDate(organization?.createdAt)}</dd>
                </div>
              </dl>
              <p className="mt-5 rounded-md border border-line bg-surface-muted px-3 py-2.5 text-sm text-ink-600">
                Organization permissions and integrations apply to every property and outlet in this tenant.
              </p>
            </CardBody>
          ) : tab === 'properties' ? (
            properties.length === 0 ? (
              <EmptyState
                icon={<Building2 className="h-5 w-5" />}
                title="No properties configured"
                description="Add the first property to start managing rooms, reservations, and folios."
                action={
                  <Button size="sm" onClick={() => setPropertyOpen(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                    Add property
                  </Button>
                }
              />
            ) : (
              <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {properties.map((property) => (
                  <div key={property.id} className="rounded-lg border border-line p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">{property.name}</p>
                        <p className="mt-0.5 truncate font-mono text-xs text-ink-500">{property.code}</p>
                      </div>
                      <StatusBadge status={property.status} registry={ENTITY_STATUS} showDot={false} />
                    </div>
                    <p className="mt-2 truncate text-xs text-ink-500">
                      {[property.city, property.country].filter(Boolean).join(', ') || 'Location not set'}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      {property.currency || 'KES'} · Added {formatDate(property.createdAt)}
                    </p>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPropertyOpen(true)}
                  className="flex min-h-[6rem] items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm font-medium text-ink-500 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add property
                </button>
              </CardBody>
            )
          ) : tab === 'outlets' ? (
            outlets.length === 0 ? (
              <EmptyState
                icon={<Store className="h-5 w-5" />}
                title="No outlets configured"
                description="Add a restaurant, bar, or other outlet to start taking orders."
                action={
                  <Button size="sm" onClick={() => setOutletOpen(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                    Add outlet
                  </Button>
                }
              />
            ) : (
              <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {outlets.map((outlet) => (
                  <div key={outlet.id} className="rounded-lg border border-line p-4">
                    <p className="truncate text-sm font-semibold text-ink-900">{outlet.name}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-ink-500">{outlet.code}</p>
                    <p className="mt-2 text-xs text-ink-500">
                      {(outlet.type || '').replace(/_/g, ' ').toLowerCase()} · {properties.find((property) => property.id === outlet.propertyId)?.name || 'No property'}
                    </p>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setOutletOpen(true)}
                  className="flex min-h-[6rem] items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm font-medium text-ink-500 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add outlet
                </button>
              </CardBody>
            )
          ) : tab === 'terminals' ? (
            terminals.length === 0 ? (
              <EmptyState
                icon={<Monitor className="h-5 w-5" />}
                title="No terminals configured"
                description="Add point-of-sale terminals to bind devices to an outlet."
                action={
                  <Button size="sm" onClick={() => setTerminalOpen(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                    Add terminal
                  </Button>
                }
              />
            ) : (
              <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {terminals.map((terminal) => (
                  <div key={terminal.id} className="rounded-lg border border-line p-4">
                    <p className="truncate text-sm font-semibold text-ink-900">{terminal.name}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-ink-500">{terminal.code}</p>
                    <p className="mt-2 text-xs text-ink-500">
                      {outlets.find((outlet) => outlet.id === terminal.outletId)?.name || 'No outlet'} · {terminal.status || 'ACTIVE'}
                    </p>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setTerminalOpen(true)}
                  className="flex min-h-[6rem] items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm font-medium text-ink-500 transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add terminal
                </button>
              </CardBody>
            )
          ) : users.length === 0 ? (
            <EmptyState
              icon={<UserCog className="h-5 w-5" />}
              title="No users found"
              description="Add a user to grant access to this organization."
              action={
                <Button size="sm" onClick={() => setUserOpen(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                  Add user
                </Button>
              }
            />
          ) : (
            <>
              <TableWrapper>
                <Table>
                  <THead>
                    <tr>
                      <TH>Name</TH>
                      <TH>Email</TH>
                      <TH>Role</TH>
                      <TH>Created</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {users.map((user) => (
                      <TR key={user.id}>
                        <TD>
                          <div className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-2xs font-semibold text-ink-600"
                            >
                              {initials(user.firstName, user.lastName)}
                            </span>
                            <span className="font-medium text-ink-900">
                              {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                            </span>
                          </div>
                        </TD>
                        <TD className="text-ink-500">{user.email}</TD>
                        <TD className="text-ink-500">{user.role?.name || 'Not assigned'}</TD>
                        <TD className="text-ink-500">{formatDateTime(user.createdAt)}</TD>
                        <TD>
                          <StatusBadge status={user.isActive === false ? 'INACTIVE' : 'ACTIVE'} registry={ENTITY_STATUS} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
              <div className="flex justify-end border-t border-line px-4 py-3 sm:px-5">
                <Button size="sm" onClick={() => setUserOpen(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                  Add user
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Dialog
        open={propertyOpen}
        onClose={() => setPropertyOpen(false)}
        title="Add property"
        description="Properties group rooms, outlets, and folios."
        footer={
          <>
            <Button variant="outline" onClick={() => setPropertyOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="property-form" loading={saving} loadingLabel="Saving">
              Save property
            </Button>
          </>
        }
      >
        <form
          id="property-form"
          className="space-y-4"
          noValidate
          onSubmit={(event) =>
            void submit(event, '/api/properties', propertyForm, () => setPropertyForm(EMPTY_PROPERTY), () => setPropertyOpen(false), 'Property created.')
          }
        >
          {formError ? <ErrorState compact title="Unable to save property" message={formError} /> : null}
          <FormGrid>
            <Field label="Name" htmlFor="propertyName" required>
              <Input id="propertyName" required value={propertyForm.name} onChange={(event) => setPropertyForm({ ...propertyForm, name: event.target.value })} />
            </Field>
            <Field label="Code" htmlFor="propertyCode" required>
              <Input id="propertyCode" required value={propertyForm.code} onChange={(event) => setPropertyForm({ ...propertyForm, code: event.target.value })} />
            </Field>
            <Field label="City" htmlFor="propertyCity">
              <Input id="propertyCity" value={propertyForm.city} onChange={(event) => setPropertyForm({ ...propertyForm, city: event.target.value })} />
            </Field>
            <Field label="Country" htmlFor="propertyCountry">
              <Input id="propertyCountry" value={propertyForm.country} onChange={(event) => setPropertyForm({ ...propertyForm, country: event.target.value })} />
            </Field>
            <Field label="Currency" htmlFor="propertyCurrency">
              <Select id="propertyCurrency" value={propertyForm.currency} onChange={(event) => setPropertyForm({ ...propertyForm, currency: event.target.value })}>
                <option value="KES">KES</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </Select>
            </Field>
            <Field label="Timezone" htmlFor="propertyTimezone">
              <Input id="propertyTimezone" value={propertyForm.timezone} onChange={(event) => setPropertyForm({ ...propertyForm, timezone: event.target.value })} />
            </Field>
          </FormGrid>
        </form>
      </Dialog>

      <Dialog
        open={outletOpen}
        onClose={() => setOutletOpen(false)}
        title="Add outlet"
        description="Outlets host menus, tables, terminals, and orders."
        footer={
          <>
            <Button variant="outline" onClick={() => setOutletOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="outlet-form" loading={saving} loadingLabel="Saving">
              Save outlet
            </Button>
          </>
        }
      >
        <form
          id="outlet-form"
          className="space-y-4"
          noValidate
          onSubmit={(event) =>
            void submit(event, '/api/outlets', outletForm, () => setOutletForm({ ...EMPTY_OUTLET, propertyId: outletForm.propertyId }), () => setOutletOpen(false), 'Outlet created.')
          }
        >
          {formError ? <ErrorState compact title="Unable to save outlet" message={formError} /> : null}
          <FormGrid>
            <Field label="Property" htmlFor="outletProperty" required className="sm:col-span-2">
              <Select id="outletProperty" required value={outletForm.propertyId} onChange={(event) => setOutletForm({ ...outletForm, propertyId: event.target.value })}>
                <option value="">Select property</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name" htmlFor="outletName" required>
              <Input id="outletName" required value={outletForm.name} onChange={(event) => setOutletForm({ ...outletForm, name: event.target.value })} />
            </Field>
            <Field label="Code" htmlFor="outletCode" required>
              <Input id="outletCode" required value={outletForm.code} onChange={(event) => setOutletForm({ ...outletForm, code: event.target.value })} />
            </Field>
            <Field label="Type" htmlFor="outletType" required>
              <Select id="outletType" value={outletForm.type} onChange={(event) => setOutletForm({ ...outletForm, type: event.target.value })}>
                <option value="RESTAURANT">Restaurant</option>
                <option value="BAR">Bar</option>
                <option value="CAFE">Cafe</option>
                <option value="ROOM_SERVICE">Room service</option>
                <option value="POOL_BAR">Pool bar</option>
              </Select>
            </Field>
          </FormGrid>
        </form>
      </Dialog>

      <Dialog
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        title="Add terminal"
        description="Terminals represent point-of-sale devices."
        footer={
          <>
            <Button variant="outline" onClick={() => setTerminalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="terminal-form" loading={saving} loadingLabel="Saving">
              Save terminal
            </Button>
          </>
        }
      >
        <form
          id="terminal-form"
          className="space-y-4"
          noValidate
          onSubmit={(event) =>
            void submit(event, '/api/terminals', terminalForm, () => setTerminalForm({ ...EMPTY_TERMINAL, outletId: terminalForm.outletId }), () => setTerminalOpen(false), 'Terminal created.')
          }
        >
          {formError ? <ErrorState compact title="Unable to save terminal" message={formError} /> : null}
          <FormGrid>
            <Field label="Outlet" htmlFor="terminalOutlet" required className="sm:col-span-2">
              <Select id="terminalOutlet" required value={terminalForm.outletId} onChange={(event) => setTerminalForm({ ...terminalForm, outletId: event.target.value })}>
                <option value="">Select outlet</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name" htmlFor="terminalName" required>
              <Input id="terminalName" required value={terminalForm.name} onChange={(event) => setTerminalForm({ ...terminalForm, name: event.target.value })} />
            </Field>
            <Field label="Code" htmlFor="terminalCode" required>
              <Input id="terminalCode" required value={terminalForm.code} onChange={(event) => setTerminalForm({ ...terminalForm, code: event.target.value })} />
            </Field>
          </FormGrid>
        </form>
      </Dialog>

      <Dialog
        open={userOpen}
        onClose={() => setUserOpen(false)}
        title="Add user"
        description="Grant a user access to this organization with the selected role."
        footer={
          <>
            <Button variant="outline" onClick={() => setUserOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="user-form" loading={saving} loadingLabel="Saving">
              Save user
            </Button>
          </>
        }
      >
        <form
          id="user-form"
          className="space-y-4"
          noValidate
          onSubmit={(event) =>
            void submit(event, '/api/users', userForm, () => setUserForm({ ...EMPTY_USER, roleId: userForm.roleId }), () => setUserOpen(false), 'User created.')
          }
        >
          {formError ? <ErrorState compact title="Unable to save user" message={formError} /> : null}
          <FormGrid>
            <Field label="Role" htmlFor="userRole" required>
              <Select id="userRole" required value={userForm.roleId} onChange={(event) => setUserForm({ ...userForm, roleId: event.target.value })}>
                <option value="">Select role</option>
                {roles.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Email" htmlFor="userEmail" required>
              <Input id="userEmail" type="email" required value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} />
            </Field>
            <Field label="Password" htmlFor="userPassword" required>
              <Input
                id="userPassword"
                type="password"
                required
                autoComplete="new-password"
                value={userForm.password}
                onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
              />
            </Field>
            <Field label="First name" htmlFor="userFirstName" required>
              <Input id="userFirstName" required value={userForm.firstName} onChange={(event) => setUserForm({ ...userForm, firstName: event.target.value })} />
            </Field>
            <Field label="Last name" htmlFor="userLastName" required>
              <Input id="userLastName" required value={userForm.lastName} onChange={(event) => setUserForm({ ...userForm, lastName: event.target.value })} />
            </Field>
            <Field label="Phone" htmlFor="userPhone">
              <Input id="userPhone" value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} />
            </Field>
          </FormGrid>
        </form>
      </Dialog>
    </ModuleShell>
  )
}
