import { requireAdmin } from '@/lib/auth/admin-context'
import { getPlatformStats } from '@/lib/queries/admin-stats'
import { Building2, Users, FileText } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const revalidate = 60

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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight"><T>Dashboard</T></h1>
        <p className="text-sm text-muted-foreground"><T>Platform-wide stats at a glance.</T></p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map(({ label, value, Icon, description }) => (
          <Card key={label} variant="stat" className="p-6 flex flex-col gap-3 min-h-[120px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground"><T text={label} /></span>
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-mono text-3xl font-semibold tracking-tight">{value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground"><T text={description} /></p>
          </Card>
        ))}
      </div>
    </div>
  )
}
