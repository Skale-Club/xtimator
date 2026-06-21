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

  return (
    <div className="relative flex flex-1 flex-col min-h-0 md:flex-row md:gap-0">
      {/* Sub-sidebar */}
      <div
        className={cn(
          'relative sticky top-0 z-20 shrink-0',
          'md:fixed md:left-[var(--app-sidebar-width)] md:top-16 md:z-30 md:h-[calc(100vh-4rem)]',
          'transition-[width] duration-200 ease-in-out',
          collapsed ? 'md:w-14' : 'md:w-52',
        )}
      >
        {/* Mobile fade mask */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent md:hidden"
        />

        <aside
          className={cn(
            'shrink-0 border-border bg-background h-full flex flex-col',
            'w-full border-b px-2 py-2 overflow-x-auto scrollbar-none',
            'md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-8',
          )}
        >
          <SettingsNav collapsed={collapsed} />

          {/* Collapse toggle — desktop only, mirrors main sidebar bottom button.
              Same min-h + vertical centering as the main sidebar footer
              (--app-rail-footer-h) so the two rail footers line up exactly. */}
          <div className="mt-auto hidden md:flex md:flex-col md:justify-center md:min-h-[var(--app-rail-footer-h)] border-t border-[var(--glass-border)] p-2">
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

      {/* Page content — offset matches sidebar width */}
      <div
        className={cn(
          'min-w-0 flex-1',
          'transition-[margin] duration-200 ease-in-out',
          collapsed ? 'md:ml-14' : 'md:ml-52',
        )}
      >
        {children}
      </div>
    </div>
  )
}
