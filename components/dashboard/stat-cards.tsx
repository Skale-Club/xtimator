import { StatCard } from '@/components/dashboard/stat-card'
import type { DashboardStats } from '@/lib/queries/dashboard'
import { FolderOpen, Clock, CheckCircle, DollarSign } from 'lucide-react'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
})

interface StatCardsProps {
  stats: DashboardStats
}

export function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <StatCard
        icon={FolderOpen}
        label="Total Projects"
        value={stats.totalProjects}
      />
      <StatCard
        icon={Clock}
        label="Pending Estimates"
        value={stats.pendingEstimates}
      />
      <StatCard
        icon={CheckCircle}
        label="Accepted"
        value={stats.acceptedEstimates}
      />
      <StatCard
        icon={DollarSign}
        label="Total Revenue"
        value={currencyFormatter.format(stats.totalRevenue)}
      />
    </div>
  )
}
