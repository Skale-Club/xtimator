'use client'

import { Construction } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface PlaceholderTabProps {
  title: string
  phase: number
}

export function PlaceholderTab({ title, phase }: PlaceholderTabProps) {
  return (
    <Card className="flex flex-col items-center justify-center py-16 text-center">
      <Construction className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Coming in Phase {phase}
      </p>
    </Card>
  )
}
