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
  /** Show icons only, hide labels (collapsed sidebar) */
  collapsed?: boolean
  /** Render a vertical list at ALL breakpoints (workspace sub-sidebar) instead of
   * the default mobile-horizontal / desktop-vertical responsive behavior. */
  alwaysVertical?: boolean
}

/**
 * SubNav — shared navigation primitive for settings and workspace.
 *
 * Default:        mobile horizontal pill row, desktop vertical list.
 * alwaysVertical: vertical list + collapse at every breakpoint (workspace).
 *
 * Usage:
 *   - Link mode:     provide `href` on each item  → renders <Link>
 *   - Callback mode: provide `onSelect` prop      → renders <button>
 */
export function SubNav({ items, activeValue, onSelect, className, collapsed, alwaysVertical }: SubNavProps) {
  return (
    <nav
      aria-label="Section navigation"
      className={cn(
        alwaysVertical
          ? 'flex flex-col gap-1'
          : 'flex flex-row gap-1 overflow-x-auto scrollbar-none md:flex-col md:overflow-x-visible',
        className,
      )}
    >
      {items.map(({ value, label, Icon, href }) => {
        const isActive = activeValue === value

        const itemClass = cn(
          'flex shrink-0 items-center rounded-[var(--radius-md)] font-medium transition-colors',
          alwaysVertical
            ? // Vertical list at all breakpoints; collapsed = icons only
              collapsed
              ? 'flex-row gap-0 px-2 py-2.5 text-sm min-w-0 justify-center w-full'
              : 'flex-row gap-3 px-3 py-2 text-sm min-w-0 justify-start'
            : cn(
                // Mobile: compact horizontal pill
                'flex-col gap-1 px-3 py-2 text-[11px] min-w-[60px] justify-center',
                // Desktop: horizontal row inside vertical stack
                collapsed
                  ? 'md:flex-row md:gap-0 md:px-2 md:py-2.5 md:text-sm md:min-w-0 md:justify-center md:w-full'
                  : 'md:flex-row md:gap-3 md:px-3 md:py-2 md:text-sm md:min-w-0 md:justify-start',
              ),
          isActive
            ? 'bg-[var(--glass-bg-light)] text-foreground'
            : 'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground',
        )

        const labelEl = (
          <span className={cn('leading-none', collapsed && (alwaysVertical ? 'hidden' : 'md:hidden'))}>{label}</span>
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
