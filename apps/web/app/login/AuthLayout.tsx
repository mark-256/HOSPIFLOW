'use client'

import type { ReactNode } from 'react'
import { BarChart3, BedDouble, ShieldCheck, UtensilsCrossed } from 'lucide-react'

type AuthLayoutProps = {
  title: string
  description: string
  children: ReactNode
}

/** Shared frame for the sign-in and public ordering experiences. */
export default function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-white">
              <UtensilsCrossed className="h-4.5 w-4.5" width={18} height={18} />
            </span>
            <span>
              <span className="block text-base font-semibold tracking-[0.02em] text-ink-900">HOSPIFLOW</span>
              <span className="block text-2xs text-ink-500">Hospitality Management Platform</span>
            </span>
          </div>
          <div>
            <h1 className="hf-display">{title}</h1>
            <p className="mt-1 text-sm text-ink-500">{description}</p>
          </div>
          {children}
        </div>
      </div>

      <aside className="hidden bg-ink-950 px-10 py-12 lg:flex lg:flex-col lg:justify-center" aria-hidden="true">
        <div className="max-w-md space-y-8">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-brand-300">Unified operations</p>
            <p className="mt-3 text-2xl font-semibold leading-8 text-white">
              Front office, food and beverage, inventory, and finance in one workspace.
            </p>
            <p className="mt-3 text-sm leading-6 text-ink-400">
              HOSPIFLOW keeps reservations, room status, orders, kitchen fulfilment, stock, and payments in step with
              each other.
            </p>
          </div>
          <ul className="space-y-4">
            {[
              { icon: BedDouble, title: 'Front office', detail: 'Reservations, rooms, guests, and folios' },
              { icon: UtensilsCrossed, title: 'Restaurant and POS', detail: 'Orders from counter to kitchen' },
              { icon: BarChart3, title: 'Reporting', detail: 'Revenue, occupancy, and operational insight' },
              { icon: ShieldCheck, title: 'Role-based access', detail: 'Permissions enforced on every request' },
            ].map((item) => {
              const Icon = item.icon
              return (
                <li key={item.title} className="flex gap-3">
                  <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5 text-brand-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-white">{item.title}</span>
                    <span className="block text-xs text-ink-400">{item.detail}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </aside>
    </div>
  )
}
