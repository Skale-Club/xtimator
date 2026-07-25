'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SettingsNav } from './settings-nav'

const STORAGE_KEY = 'xtimator:settings-nav-collapsed'

export function SettingsLayoutClient({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === 'true')
    } catch {}
  }, [])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, String(next)) } catch {}
      return next
    })
  }

  // quick-260724 (SEED-051): reworked from a viewport-fixed left rail + margin
  // offset to an in-flow flex-row that mirrors the settings skeleton. Phone
  // (<md): the sub-nav is a full-width sticky horizontal pill row at the top and
  // the page content spans the FULL width below it (immersive — no cramped side
  // rail). Desktop (md+): the sub-nav is a sticky vertical rail on the left and
  // the content fills the remaining space (flex-1 → no margin math, and it grows
  // automatically when the rail collapses). Desktop is visually unchanged.
  return (
    <div className="flex flex-1 min-h-0 flex-col md:flex-row md:gap-0 md:items-start">
      <div
        className={cn(
          'relative sticky top-0 z-20 shrink-0',
          'md:top-16 md:z-auto md:h-[calc(100vh-4rem)] md:overflow-y-auto md:self-start',
          'transition-[width] duration-200 ease-in-out',
          collapsed ? 'md:w-14' : 'md:w-52',
        )}
      >
        {/* Right-edge fade hinting the horizontal scroll on phone only. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent md:hidden"
        />
        <aside
          className={cn(
            'shrink-0 border-border bg-background h-full w-full flex flex-col',
            'border-b px-2 py-2 overflow-x-auto scrollbar-none',
            'md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:pt-8 md:pb-0',
            collapsed ? 'md:px-1' : 'md:px-3',
          )}
        >
          <div className="flex-1">
            <SettingsNav collapsed={collapsed} />
          </div>

          {/* Collapse toggle — desktop rail only; the phone horizontal strip has
              no collapse. Same footer alignment as the primary sidebar. */}
          <div className="mt-auto hidden md:flex md:flex-col md:justify-center md:h-[var(--app-rail-footer-h)] md:shrink-0 border-t border-[var(--glass-border)] p-2">
            {collapsed ? (
              <button
                type="button"
                onClick={toggle}
                title="Expand"
                className="w-9 h-7 flex items-center justify-center rounded-[var(--radius-md)] text-muted-foreground/40 hover:text-muted-foreground hover:bg-[var(--glass-bg-light)] transition-colors"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={toggle}
                  title="Collapse"
                  className="p-1 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Page content — full width on phone, fills the remaining space on desktop. */}
      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  )
}
