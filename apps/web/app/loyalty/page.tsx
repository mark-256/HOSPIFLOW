'use client'

import { useCallback, useEffect, useState } from 'react'
import { Award, Sparkles, Users } from 'lucide-react'
import ModuleShell from '@/components/ModuleShell'
import MetricCard from '@/components/dashboard/MetricCard'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { Skeleton } from '@/components/ui/Skeleton'
import { Field, Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/feedback/Toast'
import { apiRequest, getErrorMessage, responseData } from '@/lib/api'
import { LOYALTY_TIER, resolveStatus } from '@/lib/status'
import { formatNumber } from '@/lib/format'

type LoyaltyAccount = {
  guestId?: string
  points?: number
  lifetimePoints?: number
  tier?: string
  lastActivityAt?: string | null
}

type Guest = { id: string; firstName?: string; lastName?: string; email?: string; phone?: string; isVip?: boolean }

export default function LoyaltyPage() {
  const toast = useToast()
  const [guests, setGuests] = useState<Guest[]>([])
  const [guestId, setGuestId] = useState('')
  const [account, setAccount] = useState<LoyaltyAccount | null>(null)
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [accountLoading, setAccountLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [accountError, setAccountError] = useState('')

  useEffect(() => {
    const loadGuests = async () => {
      try {
        const response = await apiRequest<Guest[]>('/api/guests?limit=100')
        setGuests(responseData(response))
      } catch (reason) {
        setError(getErrorMessage(reason, 'Unable to load guests'))
      } finally {
        setLoading(false)
      }
    }
    void loadGuests()
  }, [])

  const loadAccount = useCallback(async (selectedGuestId: string) => {
    setAccount(null)
    setAccountError('')
    if (!selectedGuestId) return
    setAccountLoading(true)
    try {
      const response = await apiRequest<LoyaltyAccount>(`/api/loyalty/account?guestId=${encodeURIComponent(selectedGuestId)}`)
      setAccount(response.data)
    } catch (reason) {
      setAccountError(getErrorMessage(reason, 'No loyalty account found for this guest'))
    } finally {
      setAccountLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccount(guestId)
  }, [guestId, loadAccount])

  const addPoints = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!guestId || !points) return
    setSaving(true)
    setError('')
    try {
      await apiRequest('/api/loyalty/points', { method: 'POST', body: JSON.stringify({ guestId, points: Number(points), reason }) })
      setPoints('')
      setReason('')
      toast.success('Points added', 'The loyalty balance has been updated.')
      await loadAccount(guestId)
    } catch (reason) {
      const message = getErrorMessage(reason, 'Unable to add points')
      setError(message)
      toast.error('Update failed', message)
    } finally {
      setSaving(false)
    }
  }

  const tier = account?.tier ? resolveStatus(account.tier, LOYALTY_TIER) : null

  return (
    <ModuleShell title="Loyalty" description="Reward guests and track loyalty tiers">
      <div className="space-y-4">
        {error ? <ErrorState title="Loyalty" message={error} onRetry={() => void loadAccount(guestId)} compact /> : null}

        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Guests with profiles" value={formatNumber(guests.length)} icon={Users} tone="brand" loading={loading} />
          <MetricCard label="Selected balance" value={account ? formatNumber(account.points) : '--'} icon={Award} tone="accent" unavailable={!account && !accountLoading} loading={accountLoading} />
          <MetricCard label="Lifetime points" value={account ? formatNumber(account.lifetimePoints) : '--'} icon={Sparkles} tone="info" unavailable={!account && !accountLoading} loading={accountLoading} />
          <MetricCard label="Tier" value={tier ? tier.label : '--'} icon={Award} tone="success" unavailable={!account && !accountLoading} loading={accountLoading} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle description="Loyalty balances are stored per guest profile">Select guest</CardTitle>
          </CardHeader>
          <CardBody>
            <Field label="Guest" htmlFor="loyaltyGuest">
              <Select id="loyaltyGuest" value={guestId} onChange={(event) => setGuestId(event.target.value)}>
                <option value="">Select a guest</option>
                {guests.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {[guest.firstName, guest.lastName].filter(Boolean).join(' ')} · {guest.email || guest.phone || 'No contact'}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        {accountLoading ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : account ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle description="Current loyalty standing">Account</CardTitle>
                {tier ? <Badge tone={tier.tone}>{tier.label}</Badge> : null}
              </CardHeader>
              <CardBody className="space-y-4">
                <div>
                  <p className="hf-overline">Points balance</p>
                  <p className="hf-metric mt-1">{formatNumber(account.points)}</p>
                </div>
                <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4">
                  <div>
                    <dt className="hf-caption">Lifetime points</dt>
                    <dd className="mt-0.5 text-sm font-medium tabular-nums text-ink-900">{formatNumber(account.lifetimePoints)}</dd>
                  </div>
                  <div>
                    <dt className="hf-caption">Tier</dt>
                    <dd className="mt-0.5 text-sm font-medium text-ink-900">{tier?.label || 'Unassigned'}</dd>
                  </div>
                </dl>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle description="Points are recorded against the guest account">Award points</CardTitle>
              </CardHeader>
              <CardBody>
                <form onSubmit={addPoints} className="space-y-4" noValidate>
                  <Field label="Points" htmlFor="loyaltyPoints" required hint="Must be a positive whole number.">
                    <Input
                      id="loyaltyPoints"
                      type="number"
                      min={1}
                      step={1}
                      required
                      value={points}
                      onChange={(event) => setPoints(event.target.value)}
                    />
                  </Field>
                  <Field label="Reason" htmlFor="loyaltyReason" hint="Recorded for auditing and guest service.">
                    <Input id="loyaltyReason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Service recovery, campaign, spend bonus" />
                  </Field>
                  <Button type="submit" loading={saving} loadingLabel="Saving" disabled={!points}>
                    Add points
                  </Button>
                </form>
              </CardBody>
            </Card>
          </div>
        ) : guestId ? (
          <Card>
            <EmptyState
              icon={<Award className="h-5 w-5" />}
              title="No loyalty account yet"
              description="This guest has no loyalty account. Awarding points creates one automatically."
            />
          </Card>
        ) : (
          <Card>
            <EmptyState
              size="icon"
              icon={<Users className="h-5 w-5" />}
              title="Select a guest"
              description="Choose a guest above to review their loyalty balance and award points."
            />
          </Card>
        )}
      </div>
    </ModuleShell>
  )
}
