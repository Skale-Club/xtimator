'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ShieldCheck } from 'lucide-react'
import { ThemeToggle } from '@/components/app-shell/theme-toggle'
import { LanguageToggle } from '@/components/app-shell/language-toggle'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { CreditChip } from '@/components/app-shell/credit-chip'
import { useTranslation } from '@/lib/i18n/use-translation'
import { ContextualTooltip, TOOLTIP_KEYS } from '@/components/tour/contextual-tooltip'
import { useCurrentBreadcrumbs } from '@/components/app-shell/breadcrumb-context'

interface TopbarProps {
  company: {
    id: string
  }
  userId: string
  isAdmin?: boolean
  creditBalance?: number
}

const TITLE_MAP: Record<string, string> = {
  '/projects/new':       'New Xtimate',
  '/notifications':      'Notifications',
}

// Top-level pages reached from the bottom bar render their own heading on the
// page (via <PageHeading>), so the navbar shows no title for them.
const PAGE_OWNS_TITLE = new Set(['/dashboard', '/projects', '/clients', '/price-book'])

function usePageTitle(pathname: string): string {
  if (PAGE_OWNS_TITLE.has(pathname)) return ''
  // Settings renders its own "Profile" heading across all its tabs.
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return ''
  if (TITLE_MAP[pathname]) return TITLE_MAP[pathname]
  if (pathname.startsWith('/projects/')) return 'Project'
  if (pathname.startsWith('/clients/'))  return 'Client'
  if (pathname.startsWith('/admin'))     return 'Admin'
  return ''
}

export function Topbar({ company, userId, isAdmin, creditBalance }: TopbarProps) {
  const pathname = usePathname()
  const { t } = useTranslation()
  const router = useRouter()
  const pageTitle = usePageTitle(pathname)
  const breadcrumbs = useCurrentBreadcrumbs()

  // Cmd+Shift+A (or Ctrl+Shift+A) → jump to /admin (admin-only)
  useEffect(() => {
    if (!isAdmin) return
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        router.push('/admin')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isAdmin, router])

  return (
    <header
      data-testid="app-topbar"
      className="hidden md:flex sticky top-0 z-40 items-center justify-between bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] [-webkit-backdrop-filter:blur(var(--glass-blur))] border-b border-[var(--glass-border)] px-6 h-16"
    >
      {/* Left: page title / breadcrumb */}
      {breadcrumbs.length > 0 ? (
        <nav className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground select-none">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground font-normal">/</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="text-muted-foreground font-normal hover:text-foreground transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="flex items-center gap-2">
                  <span>{crumb.label}</span>
                  {crumb.badge !== undefined && (
                    <span className="inline-flex items-center rounded-md bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                      {crumb.badge}
                    </span>
                  )}
                </span>
              )}
            </span>
          ))}
        </nav>
      ) : pageTitle ? (
        <h1 className="text-lg font-semibold tracking-tight text-foreground select-none">
          {t(pageTitle)}
        </h1>
      ) : (
        <div />
      )}

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        {isAdmin && (
          <Link
            href="/admin"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title={t('Admin Panel') + ' (⌘⇧A)'}
            aria-label={t('Open Super Admin Panel')}
          >
            <ShieldCheck className="h-4 w-4" />
          </Link>
        )}
        <ContextualTooltip
          tooltipKey={TOOLTIP_KEYS.languageToggle}
          text="Switch languages | estimates can be sent in EN, PT, or ES"
          side="bottom"
        >
          <span data-tour="language-toggle">
            <LanguageToggle />
          </span>
        </ContextualTooltip>
        {typeof creditBalance === 'number' && <CreditChip balance={creditBalance} />}
        <NotificationBell companyId={company.id} userId={userId} />
        <ThemeToggle />
      </div>
    </header>
  )
}
