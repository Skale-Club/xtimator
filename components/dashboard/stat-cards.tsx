'use client'

'use client'

import { StatCard } from '@/components/dashboard/stat-card'
import type { DashboardStats } from '@/lib/queries/dashboard'
import { DEFAULT_CURRENCY_CODE, formatMoney } from '@/lib/money/currency'
import { FolderOpen, Clock, CheckCircle, DollarSign } from 'lucide-react'

interface StatCardsProps {
  stats: DashboardStats
  currencyCode?: string
}

export function StatCards({ stats, currencyCode = DEFAULT_CURRENCY_CODE }: StatCardsProps) {
  return (
    <section className="px-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={FolderOpen}
        label="Total Projects"
        value={stats.totalProjects}
        index={0}
      />
      <StatCard
        icon={Clock}
        label="Pending Estimates"
        value={stats.pendingEstimates}
        index={1}
      />
      <StatCard
        icon={CheckCircle}
        label="Accepted"
        value={stats.acceptedEstimates}
        index={2}
      />
      <StatCard
        icon={DollarSign}
        label="Total Revenue"
        value={formatMoney(stats.totalRevenue, currencyCode, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })}
        index={3}
      />
    </section>
  )
}
