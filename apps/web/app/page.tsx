import Link from 'next/link'
import { BarChart3, BedDouble, ShieldCheck, UtensilsCrossed, Warehouse } from 'lucide-react'

const CAPABILITIES = [
  {
    icon: BedDouble,
    title: 'Front office',
    detail: 'Reservations, room status, guest profiles, and folio balances in one view.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Restaurant and POS',
    detail: 'Counter, table, bar, online, and QR ordering with a shared kitchen queue.',
  },
  {
    icon: Warehouse,
    title: 'Operations',
    detail: 'Housekeeping, maintenance, inventory, procurement, and suppliers.',
  },
  {
    icon: BarChart3,
    title: 'Finance and reporting',
    detail: 'Payments, outstanding balances, sales, and occupancy reporting.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based access',
    detail: 'Every module and request is protected by the existing permission model.',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-content items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-white">
              <UtensilsCrossed width={18} height={18} />
            </span>
            <span>
              <span className="block text-base font-semibold tracking-[0.02em] text-ink-900">HOSPIFLOW</span>
              <span className="block text-2xs text-ink-500">Hospitality Management Platform</span>
            </span>
          </div>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-md bg-brand-600 px-3.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-content px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="max-w-2xl">
          <p className="hf-overline">Hospitality operations</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink-900 sm:text-4xl">
            Run the property, the restaurant, and the back office from one workspace.
          </h1>
          <p className="mt-4 text-base leading-7 text-ink-600">
            HOSPIFLOW unifies front office, food and beverage, stock, maintenance, and finance for multi-property
            hospitality groups.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Sign in to HOSPIFLOW
            </Link>
            <Link
              href="/qr-order"
              className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink-700 transition-colors duration-150 hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Open QR ordering
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((capability) => {
            const Icon = capability.icon
            return (
              <div key={capability.title} className="hf-card p-4">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                  <Icon className="h-4 w-4" />
                </span>
                <h2 className="mt-3 text-sm font-semibold text-ink-900">{capability.title}</h2>
                <p className="mt-1 text-sm leading-6 text-ink-500">{capability.detail}</p>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
