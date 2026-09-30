import type { LucideIcon } from 'lucide-react'
import {
  Award,
  BarChart3,
  BedDouble,
  Building2,
  CalendarCheck,
  ChefHat,
  ClipboardList,
  CreditCard,
  Globe2,
  LayoutDashboard,
  Martini,
  Package,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react'

/**
 * A permission is only used to decide whether a module is shown in navigation.
 * The server-side permission model is untouched - this is presentation only.
 */
export type NavPermission =
  | 'orders_view'
  | 'rooms_view'
  | 'rooms_edit'
  | 'reservations_edit'
  | 'guests_view'
  | 'folios_view'
  | 'inventory_view'
  | 'procurement_view'
  | 'housekeeping_view'
  | 'maintenance_view'
  | 'finance_view'
  | 'reports_view'
  | 'users_manage'

export type NavItem = {
  href: string
  label: string
  description: string
  icon: LucideIcon
  permission?: NavPermission
  keywords?: string[]
}

export type NavGroup = {
  id: string
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        description: 'Property, revenue, and operations at a glance',
        icon: LayoutDashboard,
        keywords: ['home', 'kpi', 'overview', 'metrics'],
      },
    ],
  },
  {
    id: 'front-office',
    label: 'Front Office',
    items: [
      {
        href: '/hotel',
        label: 'Hotel',
        description: 'Property overview, availability, folios, and guests',
        icon: Building2,
        permission: 'rooms_view',
        keywords: ['property', 'properties', 'building', 'stay'],
      },
      {
        href: '/rooms',
        label: 'Rooms',
        description: 'Room inventory, status, and readiness',
        icon: BedDouble,
        permission: 'rooms_view',
        keywords: ['room', 'inventory', 'housekeeping', 'status'],
      },
      {
        href: '/reservations',
        label: 'Reservations',
        description: 'Bookings, arrivals, and departures',
        icon: CalendarCheck,
        permission: 'reservations_edit',
        keywords: ['booking', 'arrival', 'departure', 'check-in', 'stay'],
      },
      {
        href: '/guests',
        label: 'Guests',
        description: 'Guest profiles and contact details',
        icon: Users,
        permission: 'guests_view',
        keywords: ['client', 'customer', 'profile', 'vip'],
      },
    ],
  },
  {
    id: 'food-and-beverage',
    label: 'Restaurant',
    items: [
      {
        href: '/pos',
        label: 'Point of Sale',
        description: 'Tables, menus, and live orders',
        icon: ShoppingCart,
        permission: 'orders_view',
        keywords: ['pos', 'order', 'table', 'checkout', 'bill'],
      },
      {
        href: '/restaurant',
        label: 'Restaurant',
        description: 'Restaurant ordering workspace',
        icon: UtensilsCrossed,
        permission: 'orders_view',
        keywords: ['dining', 'food', 'restaurant'],
      },
      {
        href: '/bar',
        label: 'Bar',
        description: 'Bar ordering workspace',
        icon: Martini,
        permission: 'orders_view',
        keywords: ['drinks', 'beverage', 'bar'],
      },
      {
        href: '/kitchen',
        label: 'Kitchen',
        description: 'Preparation queue and fulfilment',
        icon: ChefHat,
        permission: 'orders_view',
        keywords: ['kds', 'cooking', 'prepare', 'serve'],
      },
      {
        href: '/online-ordering',
        label: 'Online Orders',
        description: 'Delivery and pickup orders',
        icon: Truck,
        permission: 'orders_view',
        keywords: ['delivery', 'takeaway', 'pickup'],
      },
      {
        href: '/qr-order',
        label: 'QR Ordering',
        description: 'Guest self-service ordering',
        icon: ClipboardList,
        permission: 'orders_view',
        keywords: ['qr', 'self service', 'table service'],
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        href: '/housekeeping',
        label: 'Housekeeping',
        description: 'Cleaning and room readiness tasks',
        icon: Sparkles,
        permission: 'housekeeping_view',
        keywords: ['cleaning', 'turndown', 'room service'],
      },
      {
        href: '/maintenance',
        label: 'Maintenance',
        description: 'Repairs and technical tickets',
        icon: Wrench,
        permission: 'maintenance_view',
        keywords: ['repair', 'ticket', 'engineering'],
      },
      {
        href: '/inventory',
        label: 'Inventory',
        description: 'Stock levels, thresholds, and cost',
        icon: Package,
        permission: 'inventory_view',
        keywords: ['stock', 'items', 'reorder', 'sku'],
      },
      {
        href: '/procurement',
        label: 'Procurement',
        description: 'Suppliers and purchase orders',
        icon: Truck,
        permission: 'procurement_view',
        keywords: ['supplier', 'purchase order', 'po', 'vendor'],
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      {
        href: '/finance',
        label: 'Finance',
        description: 'Folios, payments, and balances',
        icon: CreditCard,
        permission: 'finance_view',
        keywords: ['folio', 'payment', 'balance', 'revenue', 'refund'],
      },
      {
        href: '/reports',
        label: 'Reports',
        description: 'Sales and occupancy performance',
        icon: BarChart3,
        permission: 'reports_view',
        keywords: ['analytics', 'sales', 'occupancy', 'chart'],
      },
    ],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    items: [
      {
        href: '/loyalty',
        label: 'Loyalty',
        description: 'Points, tiers, and guest rewards',
        icon: Award,
        permission: 'guests_view',
        keywords: ['rewards', 'points', 'tier', 'membership'],
      },
      {
        href: '/guest-portal',
        label: 'Guest Portal',
        description: 'Guest reservations and folios',
        icon: Globe2,
        permission: 'folios_view',
        keywords: ['portal', 'guest view', 'self service'],
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      {
        href: '/settings',
        label: 'Settings',
        description: 'Organization, properties, outlets, and users',
        icon: Settings,
        permission: 'users_manage',
        keywords: ['organization', 'users', 'outlets', 'terminals', 'access'],
      },
      {
        href: '/ai',
        label: 'AI Assistant',
        description: 'Data-backed operational guidance',
        icon: Sparkles,
        permission: 'reports_view',
        keywords: ['ai', 'assistant', 'insight', 'recommendation'],
      },
    ],
  },
]

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

/**
 * Filter navigation by the permissions returned from /api/auth/me.
 * If the API returns no permission list the full navigation is shown, so a
 * role without a permission array never loses access to a working module.
 */
export function visibleNavGroups(permissions?: string[] | null): NavGroup[] {
  if (!Array.isArray(permissions) || permissions.length === 0) return NAV_GROUPS
  const granted = new Set(permissions)
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || granted.has(item.permission)),
  })).filter((group) => group.items.length > 0)
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function searchNavItems(query: string, groups: NavGroup[] = NAV_GROUPS): Array<NavItem & { group: string }> {
  const term = query.trim().toLowerCase()
  if (!term) return []
  const results: Array<NavItem & { group: string }> = []
  for (const group of groups) {
    for (const item of group.items) {
      const haystack = [item.label, item.description, item.href, ...(item.keywords || [])].join(' ').toLowerCase()
      if (haystack.includes(term)) results.push({ ...item, group: group.label })
    }
  }
  return results.slice(0, 8)
}
