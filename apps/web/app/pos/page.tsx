'use client'

import ModuleShell from '@/components/ModuleShell'
import OutletOrders from '@/components/OutletOrders'

export default function POSPage() {
  return (
    <ModuleShell title="POS" description="Manage tables, menus, and customer orders">
      <OutletOrders title="Point of sale" orderType="DINE_IN" sendToKitchen />
    </ModuleShell>
  )
}
