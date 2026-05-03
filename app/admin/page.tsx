import { requireAdmin } from '@/lib/auth/admin-context'
import { getPlatformStats } from '@/lib/queries/admin-stats'
import { Building2, Users, FileText } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  await requireAdmin()
  const stats = await getPlatformStats()

  const cards = [
    {
      label: 'Registered companies',
      value: stats.totalCompanies,
      Icon: Building2,
      description: 'Total tenants',
    },
    {
      label: 'Total users',
      value: stats.totalUsers,
      Icon: Users,
      description: 'Across all companies',
    },
    {
      label: 'Estimates (30 days)',
      value: stats.estimatesLast30d,
      Icon: FileText,
      description: 'Generated in last 30 days',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Platform-wide stats at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map(({ label, value, Icon, description }) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-card p-6 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{label}</span>
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="text-3xl font-bold tracking-tight">{value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
