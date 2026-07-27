'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SettingsNav } from './settings-nav'

const STORAGE_KEY = 'xtimator:settings-nav-collapsed'

export function SettingsLayoutClient({ children, isDemo }: { children: ReactNode; isDemo?: boolean }) {
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

  // quick-260725: the settings sections render as a LEFT vertical collapsible
  // rail at EVERY breakpoint — phone, tablet, and desktop — replacing the
  // previous phone-only horizontal pill strip. The container is an in-flow
  // flex-row at all widths: a fixed-width rail on the left (w-52 expanded /
  // w-14 collapsed, default EXPANDED) and the page content filling the rest
  // (flex-1 min-w-0). The rail is a viewport-height, self-scrolling sticky
  // column — its own overflow-y-auto lets a tall nav + footer toggle scroll
  // within it while the page content scrolls independently.
  //
  // Desktop (md+) is byte-for-byte unchanged: every class that used to be
  // `md:`-gated here is now the unconditional base, so md+ resolves to exactly
  // the same computed styles it did before. The collapse toggle is now visible
  // and usable at all breakpoints (previously `hidden md:flex`).
  return (
    <div className="flex min-h-0 flex-1 flex-row items-start">
      <div
        className={cn(
          'sticky top-0 shrink-0 self-start h-[calc(100vh-4rem)] overflow-y-auto',
          'transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-14' : 'w-52',
        )}
      >
        <aside
          className={cn(
            'shrink-0 border-border bg-background h-full w-full flex flex-col',
            'overflow-y-auto scrollbar-none border-r pt-8 pb-0',
            collapsed ? 'px-1' : 'px-3',
          )}
        >
          <div className="flex-1">
            <SettingsNav collapsed={collapsed} isDemo={isDemo} />
          </div>

          {/* Collapse toggle — visible and usable at ALL breakpoints. Same
              footer alignment as the primary sidebar. */}
          <div className="mt-auto flex flex-col justify-center h-[var(--app-rail-footer-h)] shrink-0 border-t border-[var(--glass-border)] p-2">
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

      {/* Page content — fills the space beside the rail at all breakpoints. */}
      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  )
}
