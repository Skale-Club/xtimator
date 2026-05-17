'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Mic, Camera, FileText } from 'lucide-react'
import type { ProjectQuickStats } from '@/lib/queries/project'

interface QuickStatsProps {
  stats: ProjectQuickStats
}

const STAT_ITEMS = [
  { key: 'recordingCount' as const, label: 'Recordings', icon: Mic },
  { key: 'photoCount' as const, label: 'Photos', icon: Camera },
  { key: 'estimateCount' as const, label: 'Estimates', icon: FileText },
]

export function QuickStats({ stats }: QuickStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {STAT_ITEMS.map(({ key, label, icon: Icon }) => (
        <Card key={key} variant="stat" className="p-6 min-h-[120px] overflow-hidden">
          <CardContent className="flex items-center gap-4 p-0">
            <div className="rounded-full bg-[var(--glass-bg-light)] p-2.5">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-mono text-3xl tabular-nums leading-none">{stats[key]}</p>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
