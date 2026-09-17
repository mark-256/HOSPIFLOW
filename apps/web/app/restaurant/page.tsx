'use client'

import ModuleShell from '@/components/ModuleShell'
import OutletOrders from '@/components/OutletOrders'

export default function RestaurantPage() {
  return (
    <ModuleShell title="Restaurant" description="Take and manage restaurant orders">
      <OutletOrders title="Restaurant orders" orderType="DINE_IN" outletType="RESTAURANT" />
    </ModuleShell>
  )
}
