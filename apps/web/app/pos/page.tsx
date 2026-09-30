'use client'

import ModuleShell from '@/components/ModuleShell'
import OutletOrders from '@/components/OutletOrders'

export default function POSPage() {
  return (
    <ModuleShell title="Point of Sale" description="Tables, menus, and live orders for service">
      <OutletOrders title="Point of sale" orderType="DINE_IN" sendToKitchen />
    </ModuleShell>
  )
}
