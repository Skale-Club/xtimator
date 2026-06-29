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
    <div className="relative flex flex-1 flex-row min-h-0 gap-0 items-start">
      {/* Sub-sidebar — fixed rail at ALL breakpoints. On mobile sits at left-0
          below the mobile header; on desktop offset by the primary sidebar. */}
      <div
        className={cn(
          'fixed left-0 top-[56px] z-20 h-[calc(100dvh-56px-5rem-env(safe-area-inset-bottom,_0px))]',
          'md:left-[var(--app-sidebar-width)] md:top-16 md:z-30 md:h-[calc(100vh-4rem)]',
          'transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-14 md:w-14' : 'w-40 md:w-52',
        )}
      >
        <aside
          className={cn(
            'shrink-0 border-border bg-background h-full flex flex-col',
            'border-r overflow-y-auto pt-3 pb-0 md:pt-8',
            collapsed ? 'px-1' : 'px-2 md:px-3',
          )}
        >
          <SettingsNav collapsed={collapsed} />

          {/* Collapse toggle — visible at all breakpoints. Same min-h + vertical
              centering as the main sidebar footer (--app-rail-footer-h) so the
              two rail footers line up on desktop. */}
          <div className="mt-auto flex flex-col justify-center shrink-0 md:h-[var(--app-rail-footer-h)] border-t border-[var(--glass-border)] p-2">
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
          collapsed ? 'ml-14 md:ml-14' : 'ml-40 md:ml-52',
        )}
      >
        {children}
      </div>
    </div>
  )
}
