'use client'

import Link from 'next/link'
import { type ElementType } from 'react'
import { cn } from '@/lib/utils'

export interface SubNavItem {
  value: string
  label: string
  Icon: ElementType
  /** For link-based nav (settings). If omitted, uses onSelect callback mode. */
  href?: string
}

interface SubNavProps {
  items: SubNavItem[]
  activeValue: string
  /** Used in callback mode (workspace tabs) */
  onSelect?: (value: string) => void
  /** Extra class for the wrapping <nav> */
  className?: string
  /** Desktop-only: show icons only, hide labels */
  collapsed?: boolean
}

/**
 * SubNav — shared navigation primitive for settings and workspace.
 *
 * Mobile  (< md): horizontal scrollable pill row — always fully visible.
 * Desktop (md+):  vertical list — rendered inside the parent's <aside>.
 *
 * Usage:
 *   - Link mode:     provide `href` on each item  → renders <Link>
 *   - Callback mode: provide `onSelect` prop      → renders <button>
 */
export function SubNav({ items, activeValue, onSelect, className, collapsed }: SubNavProps) {
  return (
    <nav
      aria-label="Section navigation"
      className={cn(
        // Mobile: horizontal scrollable row
        'flex flex-row gap-1 overflow-x-auto scrollbar-none',
        // Desktop: vertical column
        'md:flex-col md:overflow-x-visible',
        className,
      )}
    >
      {items.map(({ value, label, Icon, href }) => {
        const isActive = activeValue === value

        const itemClass = cn(
          'flex shrink-0 items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors',
          // Mobile: compact horizontal pill
          'flex-col gap-1 px-3 py-2 text-[11px] min-w-[60px] justify-center',
          // Desktop: horizontal row inside vertical stack
          collapsed
            ? 'md:flex-row md:gap-0 md:px-2 md:py-2.5 md:text-sm md:min-w-0 md:justify-center md:w-full'
            : 'md:flex-row md:gap-3 md:px-3 md:py-2 md:text-sm md:min-w-0 md:justify-start',
          isActive
            ? 'bg-[var(--glass-bg-light)] text-foreground'
            : 'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground',
        )

        const labelEl = (
          <span className={cn('leading-none', collapsed && 'md:hidden')}>{label}</span>
        )

        if (href) {
          return (
            <Link
              key={value}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={itemClass}
              title={collapsed ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {labelEl}
            </Link>
          )
        }

        return (
          <button
            key={value}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect?.(value)}
            className={itemClass}
            title={collapsed ? label : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {labelEl}
          </button>
        )
      })}
    </nav>
  )
}
