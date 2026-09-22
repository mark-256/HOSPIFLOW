import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HOSPIFLOW - Hospitality Management Platform',
  description:
    'Unified Hotel, Restaurant, POS, Inventory & Hospitality Management Platform',
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
