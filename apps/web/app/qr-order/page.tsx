'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Minus, Plus, QrCode, ShoppingBag, Trash2, UtensilsCrossed } from 'lucide-react'
import { ToastProvider, useToast } from '@/components/feedback/Toast'
import Button from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/States'
import { Skeleton } from '@/components/ui/Skeleton'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { formatCurrency } from '@/lib/format'

type Product = { id: string; name: string; code: string; price: number | string }
type Menu = { id: string; outletId: string; name?: string; categories?: { id: string; name: string; products?: Product[] }[] }
type QrTable = { outletId: string; outletName?: string; tableName?: string }
type CartLine = { product: Product; quantity: number }

function QROrderExperience() {
  const toast = useToast()
  const [token, setToken] = useState('')
  const [table, setTable] = useState<QrTable | null>(null)
  const [menus, setMenus] = useState<Menu[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadTable = useCallback(async () => {
    const queryToken = new URLSearchParams(window.location.search).get('token') || ''
    setToken(queryToken)
    if (!queryToken) {
      setError('A QR order token is required. Scan the code on your table to continue.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<QrTable>(`/api/qr/lookup/${encodeURIComponent(queryToken)}`, {}, { auth: false })
      setTable(response.data)
      const menuResponse = await apiRequest<Menu[]>(
        `/api/menus?outletId=${encodeURIComponent(response.data.outletId)}`,
        {},
        { auth: false },
      )
      setMenus(responseData(menuResponse))
    } catch (reason) {
      setError(getErrorMessage(reason, 'Invalid or expired QR code'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTable()
  }, [loadTable])

  const grouped = useMemo(
    () =>
      menus
        .flatMap((menu) => menu.categories || [])
        .map((category) => ({
          id: category.id,
          name: category.name,
          products: category.products || [],
        }))
        .filter((category) => category.products.length > 0),
    [menus],
  )

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id)
      return existing
        ? current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line))
        : [...current, { product, quantity: 1 }]
    })
  }

  const changeQuantity = (productId: string, quantity: number) => {
    setCart((current) =>
      quantity <= 0
        ? current.filter((line) => line.product.id !== productId)
        : current.map((line) => (line.product.id === productId ? { ...line, quantity } : line)),
    )
  }

  const total = cart.reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0)
  const covers = cart.reduce((sum, line) => sum + line.quantity, 0)

  const submitOrder = async () => {
    if (!table || cart.length === 0) return
    setSaving(true)
    setError('')
    try {
      await apiRequest(
        '/api/qr/orders',
        { method: 'POST', body: JSON.stringify({ token, items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })) }) },
        { auth: false },
      )
      setCart([])
      toast.success('Order placed', 'The kitchen has received your order.')
    } catch (reason) {
      const message = getErrorMessage(reason, 'Unable to place QR order')
      setError(message)
      toast.error('Order not placed', message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-content items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white">
              <UtensilsCrossed className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-[0.02em] text-ink-900">HOSPIFLOW</span>
              <span className="block text-2xs text-ink-500">Guest ordering</span>
            </span>
          </Link>
          {table ? (
            <span className="rounded-md border border-line bg-surface-muted px-2.5 py-1.5 text-xs font-medium text-ink-700">
              {table.outletName || 'Table service'} · {table.tableName || 'Table'}
            </span>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-content space-y-4 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div>
          <h1 className="hf-display">QR Ordering</h1>
          <p className="mt-1 text-sm text-ink-500">Browse the menu and send your order straight to the kitchen.</p>
        </div>

        {error ? <Alert tone="danger" title="Ordering is unavailable">{error}</Alert> : null}

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-3" role="status" aria-label="Loading menu">
            <Skeleton className="h-96 rounded-lg lg:col-span-2" />
            <Skeleton className="h-96 rounded-lg" />
          </div>
        ) : !table ? (
          <Card>
            <EmptyState
              icon={<QrCode className="h-5 w-5" />}
              title="Scan the QR code on your table"
              description="Each table has a unique code that opens its menu. Scan it to start your order."
            />
          </Card>
        ) : grouped.length === 0 ? (
          <Card>
            <EmptyState
              icon={<UtensilsCrossed className="h-5 w-5" />}
              title="No menu items are available"
              description="This outlet has not published any products yet. Please contact your server."
            />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle description={`${table.outletName || 'Menu'} · Table ${table.tableName || ''}`}>Menu</CardTitle>
              </CardHeader>
              <CardBody className="space-y-5">
                {grouped.map((category) => (
                  <section key={category.id} aria-labelledby={`qr-${category.id}`}>
                    <h2 id={`qr-${category.id}`} className="hf-overline mb-2">
                      {category.name}
                    </h2>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {category.products.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addToCart(product)}
                          className="flex items-center justify-between gap-3 rounded-md border border-line px-3.5 py-3 text-left transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink-900">{product.name}</span>
                            <span className="block text-xs text-ink-500">{product.code}</span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-700">
                            {formatCurrency(product.price)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </CardBody>
            </Card>

            <Card className="flex h-fit flex-col lg:sticky lg:top-6">
              <CardHeader>
                <CardTitle description={cart.length ? `${covers} items` : 'No items selected'}>Your order</CardTitle>
                {cart.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setCart([])} leadingIcon={<Trash2 aria-hidden="true" className="h-4 w-4" />}>
                    Clear
                  </Button>
                ) : null}
              </CardHeader>
              <CardBody className="flex-1">
                {cart.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-500">Select items from the menu to begin.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {cart.map((line) => (
                      <li key={line.product.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">{line.product.name}</p>
                          <p className="text-xs tabular-nums text-ink-500">{formatCurrency(line.product.price)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Remove one ${line.product.name}`}
                            onClick={() => changeQuantity(line.product.id, line.quantity - 1)}
                          >
                            <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                          </Button>
                          <span className="w-6 text-center text-sm font-medium tabular-nums">{line.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Add one ${line.product.name}`}
                            onClick={() => changeQuantity(line.product.id, line.quantity + 1)}
                          >
                            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
              <div className="space-y-3 border-t border-line px-4 py-3.5 sm:px-5">
                <div className="flex items-center justify-between text-base font-semibold text-ink-900">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(total)}</span>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  loading={saving}
                  loadingLabel="Placing"
                  disabled={cart.length === 0}
                  onClick={() => void submitOrder()}
                  leadingIcon={<ShoppingBag aria-hidden="true" className="h-4 w-4" />}
                >
                  Place order
                </Button>
                <p className="text-center text-xs text-ink-500">Ask your server if you need anything else.</p>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}

export default function QROrderPage() {
  return (
    <ToastProvider>
      <QROrderExperience />
    </ToastProvider>
  )
}
