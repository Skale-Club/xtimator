'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, LogOut } from 'lucide-react'
import { AppIcon } from '@/components/ui/app-icon'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { openModalParam } from '@/lib/utils/modal-url'
import { NAV_ITEMS } from './nav-items'
import { useTranslation } from '@/lib/i18n/use-translation'
import { signOut } from '@/lib/actions/auth'

interface MobileNavDrawerProps {
  branding?: { appName: string; logoUrl: string | null }
  navUser?: { email: string; avatarUrl: string | null } | null
  isDemo?: boolean
}

/**
 * Tablet/phone hamburger menu. Replaces the top-right profile avatar on the
 * mobile header (md:hidden) with a "sandwich" button that toggles a slide-out
 * sidebar. The drawer mirrors the desktop <Sidebar>: brand at the top, the main
 * nav in the middle, and the profile/account block pinned to the bottom. The
 * primary bottom bar keeps the main navigation — this is the secondary menu.
 */
export function MobileNavDrawer({ branding, navUser, isDemo }: MobileNavDrawerProps) {
  const pathname = usePathname()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const appName = branding?.appName ?? 'Xtimator'

  // Main nav (top) — same set the desktop sidebar shows; account items (Settings,
  // Trash) are pulled out and rendered with the profile at the bottom instead.
  const navItems = NAV_ITEMS.filter((item) => !item.userMenu && !(isDemo && item.demoHidden))
  const accountItems = NAV_ITEMS.filter((item) => item.userMenu && !(isDemo && item.demoHidden))

  function handleModal(modalValue: string) {
    setOpen(false)
    openModalParam(modalValue)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t('Menu')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>

      <SheetContent side="left" className="w-[260px] gap-0 p-0">
        <SheetTitle className="sr-only">{t('Menu')}</SheetTitle>
        <div className="flex h-full flex-col">
          {/* Brand — mirrors the desktop sidebar header */}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex h-16 shrink-0 items-center gap-2.5 border-b border-[var(--glass-border)] px-4 transition-opacity hover:opacity-80"
          >
            <AppIcon logoUrl={branding?.logoUrl} appName={appName} className="h-7 w-7" />
            <span className="truncate text-lg font-bold tracking-tight text-foreground">
              {appName}
            </span>
          </Link>

          {/* Main navigation */}
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + '/')

              const linkClass = cn(
                'group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors',
                item.primary
                  ? 'gradient-brand text-white shadow-xs'
                  : cn(
                      'text-muted-foreground hover:bg-[var(--glass-bg-light)] hover:text-foreground',
                      isActive && 'bg-primary/10 text-primary',
                    ),
              )

              if (item.modal) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    className={linkClass}
                    onClick={() => handleModal(item.modal!)}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="truncate">{t(item.label)}</span>
                  </button>
                )
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={linkClass}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{t(item.label)}</span>
                </Link>
              )
            })}
          </nav>

          {/* Bottom: profile + account actions (pinned) */}
          <div className="flex shrink-0 flex-col gap-1 border-t border-[var(--glass-border)] p-2">
            {navUser && (
              <div className="flex items-center gap-2.5 px-2 py-2">
                <Avatar className="h-8 w-8 shrink-0">
                  {navUser.avatarUrl && <AvatarImage src={navUser.avatarUrl} alt={navUser.email} />}
                  <AvatarFallback className="bg-primary text-sm font-semibold text-white">
                    {navUser.email.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-xs text-muted-foreground">{navUser.email}</span>
              </div>
            )}

            {accountItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--glass-bg-light)] hover:text-foreground"
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{t(item.label)}</span>
                </Link>
              )
            })}

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                signOut()
              }}
              className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-[var(--glass-bg-light)] focus:text-red-400"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <span className="truncate">{t('Sign Out')}</span>
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
