'use client'

import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Icon-over-label button of the editor docks (phones), a pill from md up.
 * Lives apart from EditorDock so other docks (change orders) reuse it without
 * pulling in the New Xtimate wizard.
 */
interface DockButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode
  tone?: 'default' | 'ai'
  children: ReactNode
}

export const DockButton = forwardRef<HTMLButtonElement, DockButtonProps>(function DockButton(
  { icon, tone = 'default', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex h-[52px] min-w-[54px] flex-none flex-col items-center justify-center gap-1 rounded-[14px] text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 md:h-[42px] md:flex-row md:gap-2 md:rounded-full md:bg-muted md:px-3.5 md:text-[13.5px] md:text-foreground',
        tone === 'ai' && 'text-primary md:bg-primary/10 md:text-primary',
        className,
      )}
      {...rest}
    >
      <span aria-hidden className="grid size-5 place-items-center">
        {icon}
      </span>
      <span className="leading-none">{children}</span>
    </button>
  )
})
