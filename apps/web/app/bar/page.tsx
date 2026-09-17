'use client'

import ModuleShell from '@/components/ModuleShell'
import OutletOrders from '@/components/OutletOrders'

export default function BarPage() {
  return (
    <ModuleShell title="Bar" description="Take and manage bar orders">
      <OutletOrders title="Bar orders" orderType="BAR" outletType="BAR" />
    </ModuleShell>
  )
}
