import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'

export type PlatformStats = {
  totalCompanies: number
  totalUsers: number
  estimatesLast30d: number
}

function thirtyDaysAgo(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const svc = requireServiceClient()

  const [companiesRes, estimatesRes, userCountRes] = await Promise.all([
    svc.from('companies').select('*', { count: 'exact', head: true }),
    svc
      .from('estimates')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo()),
    svc.rpc('get_platform_user_count'),
  ])

  return {
    totalCompanies: companiesRes.count ?? 0,
    estimatesLast30d: estimatesRes.count ?? 0,
    totalUsers: (userCountRes.data as number) ?? 0,
  }
}
