'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Package, Plus, Search, Wallet } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import MetricCard from '@/components/dashboard/MetricCard'
import Button from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/Card'
import { EmptyState, ErrorState, NoResultsState } from '@/components/ui/States'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { Pagination } from '@/components/ui/Pagination'
import { Dialog } from '@/components/ui/Modal'
import { Checkbox, Field, FormGrid, Input, Textarea } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { formatCurrency, formatNumber } from '@/lib/format'

type InventoryItem = {
  id: string
  name: string
  sku: string
  description?: string | null
  category?: string | null
  unit: string
  unitCost: number | string
  reorderLevel: number | string
  minStockLevel: number | string
  maxStockLevel?: number | string | null
  expiryTracking?: boolean
  isActive?: boolean
}

const EMPTY_FORM = {
  name: '',
  sku: '',
  description: '',
  category: '',
  unit: '',
  unitCost: '',
  reorderLevel: '',
  minStockLevel: '',
  maxStockLevel: '',
  expiryTracking: false,
}

const NUMERIC_FIELDS = ['unitCost', 'reorderLevel', 'minStockLevel', 'maxStockLevel']

export default function InventoryPage() {
  const toast = useToast()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [meta, setMeta] = useState<{ total?: number; totalPages?: number }>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'all' | 'review'>('all')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<InventoryItem[]>(`/api/inventory?limit=${limit}&page=${page}`)
      setItems(responseData(response))
      setMeta({ total: response.meta?.total as number | undefined, totalPages: response.meta?.totalPages as number | undefined })
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load inventory'))
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
      await apiRequest('/api/inventory', { method: 'POST', body: JSON.stringify(form) })
      setForm(EMPTY_FORM)
      setShowForm(false)
      toast.success('Inventory item saved', `${form.name} is now tracked in the catalog.`)
      await load()
    } catch (reason) {
      setFormError(getErrorMessage(reason, 'Unable to save inventory item'))
    } finally {
      setSaving(false)
    }
  }

  const needsReview = useCallback(
    (item: InventoryItem) => Number(item.reorderLevel || 0) > 0 && Number(item.minStockLevel || 0) <= Number(item.reorderLevel || 0),
    [],
  )

  const visibleItems = useMemo(() => {
    const term = query.trim().toLowerCase()
    return items.filter((item) => {
      const matchesView = view === 'all' || needsReview(item)
      const matchesQuery =
        !term ||
        item.name.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term) ||
        (item.category || '').toLowerCase().includes(term)
      return matchesView && matchesQuery
    })
  }, [items, query, view, needsReview])

  const summary = useMemo(() => {
    const categories = new Set(items.map((item) => item.category).filter(Boolean))
    const reviewCount = items.filter(needsReview).length
    const stockValue = items.reduce((sum, item) => sum + Number(item.unitCost || 0), 0)
    return { categories: categories.size, reviewCount, stockValue }
  }, [items, needsReview])

  return (
    <ModuleShell
      title="Inventory"
      description="Stock catalog, thresholds, and unit costs"
      actions={
        <Button size="sm" onClick={() => setShowForm(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
          <span className="hidden sm:inline">Add item</span>
          <span className="sm:hidden">Add</span>
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <ErrorState title="Unable to load inventory" message={error} onRetry={() => void load()} /> : null}

        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Items tracked" value={formatNumber(meta.total ?? items.length)} icon={Package} tone="brand" loading={loading} />
          <MetricCard label="Categories" value={summary.categories} icon={Package} tone="info" loading={loading} />
          <MetricCard
            label="Reorder review"
            value={summary.reviewCount}
            icon={AlertTriangle}
            tone={summary.reviewCount > 0 ? 'warning' : 'neutral'}
            hint="Minimum at or below reorder point"
            loading={loading}
          />
          <MetricCard
            label="Unit cost value"
            value={formatCurrency(summary.stockValue)}
            icon={Wallet}
            tone="accent"
            hint="Sum of unit costs on this page"
            loading={loading}
          />
        </div>

        <Card>
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="relative w-full sm:max-w-sm">
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search item, SKU, or category"
                aria-label="Search inventory"
                leadingSlot={<Search aria-hidden="true" className="h-4 w-4" />}
              />
            </div>
            <p className="hf-caption tabular-nums">
              {visibleItems.length} shown · {meta.total ? `${meta.total} total` : 'current page'}
            </p>
          </div>
          <div className="px-2 sm:px-3">
            <Tabs
              ariaLabel="Filter inventory"
              items={[
                { id: 'all', label: 'All items' },
                { id: 'review', label: 'Reorder review' },
              ]}
              value={view}
              onChange={(value) => setView(value as 'all' | 'review')}
            />
          </div>
        </Card>

        {loading ? (
          <SkeletonTable rows={6} columns={6} />
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title="No inventory items"
              description="Add the products and supplies your property tracks to support purchasing and costing."
              action={
                <Button size="sm" onClick={() => setShowForm(true)} leadingIcon={<Plus aria-hidden="true" className="h-4 w-4" />}>
                  Add item
                </Button>
              }
            />
          </Card>
        ) : visibleItems.length === 0 ? (
          <Card>
            <NoResultsState
              query={query || (view === 'review' ? 'reorder review' : undefined)}
              onClear={() => {
                setQuery('')
                setView('all')
              }}
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <TableWrapper>
              <Table>
                <THead>
                  <tr>
                    <TH>Item</TH>
                    <TH>SKU</TH>
                    <TH>Category</TH>
                    <TH>Unit</TH>
                    <TH className="text-right">Unit cost</TH>
                    <TH className="text-right">Min</TH>
                    <TH className="text-right">Reorder</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {visibleItems.map((item) => (
                    <TR key={item.id}>
                      <TD>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900">{item.name}</p>
                          {item.description ? <p className="truncate text-xs text-ink-500">{item.description}</p> : null}
                        </div>
                      </TD>
                      <TD className="font-mono text-xs text-ink-600">{item.sku}</TD>
                      <TD className="text-ink-500">{item.category || 'Uncategorised'}</TD>
                      <TD className="text-ink-500">{item.unit}</TD>
                      <TD className="text-right font-medium tabular-nums">{formatCurrency(item.unitCost || 0)}</TD>
                      <TD className="text-right tabular-nums text-ink-500">{formatNumber(item.minStockLevel || 0)}</TD>
                      <TD className="text-right tabular-nums text-ink-500">{formatNumber(item.reorderLevel || 0)}</TD>
                      <TD>
                        {needsReview(item) ? (
                          <Badge tone="warning">Reorder review</Badge>
                        ) : item.expiryTracking ? (
                          <Badge tone="info">Expiry tracked</Badge>
                        ) : (
                          <span className="text-xs text-ink-400">Standard</span>
                        )}
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
              itemLabel="items"
            />
          </Card>
        )}
      </div>

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add inventory item"
        description="Define the item, its unit, and the thresholds that trigger reordering."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" form="inventory-form" loading={saving} loadingLabel="Saving">
              Save item
            </Button>
          </>
        }
      >
        <form id="inventory-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError ? <ErrorState compact title="Unable to save item" message={formError} /> : null}
          <FormGrid>
            <Field label="Name" htmlFor="itemName" required>
              <Input
                id="itemName"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="SKU" htmlFor="itemSku" required>
              <Input id="itemSku" required value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} />
            </Field>
            <Field label="Category" htmlFor="itemCategory">
              <Input
                id="itemCategory"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              />
            </Field>
            <Field label="Unit" htmlFor="itemUnit" required hint="For example kg, L, or each.">
              <Input id="itemUnit" required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
            </Field>
            {NUMERIC_FIELDS.map((field) => (
              <Field
                key={field}
                label={
                  field === 'unitCost'
                    ? 'Unit cost'
                    : field === 'reorderLevel'
                      ? 'Reorder level'
                      : field === 'minStockLevel'
                        ? 'Minimum stock'
                        : 'Maximum stock'
                }
                htmlFor={field}
              >
                <Input
                  id={field}
                  type="number"
                  min={0}
                  step="0.01"
                  value={(form as unknown as Record<string, string>)[field]}
                  onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                />
              </Field>
            ))}
          </FormGrid>
          <Field label="Description" htmlFor="itemDescription">
            <Textarea
              id="itemDescription"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
          <Checkbox
            id="expiryTracking"
            label="Track expiry dates"
            description="Enable expiry handling for perishable stock."
            checked={form.expiryTracking}
            onChange={(event) => setForm({ ...form, expiryTracking: event.target.checked })}
          />
        </form>
      </Dialog>
    </ModuleShell>
  )
}
