'use client'
import { StretchHorizontal, FileStack } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { EstimateViewMode } from '@/components/workspace/estimate/estimate-floating-actions'

interface ViewModeToggleProps {
  mode?: EstimateViewMode
  onModeChange?: (mode: EstimateViewMode) => void
}

export function ViewModeToggle({ mode, onModeChange }: ViewModeToggleProps) {
  if (mode === undefined) return null
  return (
    <TooltipProvider delayDuration={300}>
      <div role="group" aria-label="Document view mode"
        className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-pressed={mode === 'width'} aria-label="Full width view"
              onClick={() => onModeChange?.('width')}
              className={cn('rounded-full', mode === 'width'
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50')}>
              <StretchHorizontal className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Full width</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-pressed={mode === 'page'} aria-label="Paginated view"
              onClick={() => onModeChange?.('page')}
              className={cn('rounded-full', mode === 'page'
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50')}>
              <FileStack className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Paginated (PDF preview)</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
