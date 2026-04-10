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
        <Card key={key}>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-muted p-2.5">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats[key]}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
