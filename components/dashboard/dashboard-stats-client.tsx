'use client'

import { StatCards } from '@/components/dashboard/stat-cards'
import type { DashboardStats } from '@/lib/queries/dashboard'

interface DashboardStatsClientProps {
  stats: DashboardStats
  currencyCode: string
}

export function DashboardStatsClient({ stats, currencyCode }: DashboardStatsClientProps) {
  return <StatCards stats={stats} currencyCode={currencyCode} />
}