import Link from 'next/link'
import { AppIcon } from '@/components/ui/app-icon'
import { Button } from '@/components/ui/button'

/**
 * Reusable site header — mirrors the landing TopNav visually but uses Links
 * for auth actions instead of a co-located AuthDialog. Render this on pages
 * that share the landing's dark shell (privacy policy, terms of service,
 * blog, marketing pages) so the chrome stays consistent.
 *
 * The "Start" button routes to `/?auth=signup` and the landing page's
 * `<LandingPage>` consumes `searchParams.auth` to auto-open the appropriate
 * modal (see components/landing/landing-page.tsx lines 30-46).
 *
 * Server component — no useState, no useRouter. Safe to import from any
 * server component shell.
 */
export interface SiteHeaderBranding {
  appName: string
  logoUrl: string | null
}

interface SiteHeaderProps {
  branding: SiteHeaderBranding
}

export function SiteHeader({ branding }: SiteHeaderProps) {
  return (
    // pt-[env(safe-area-inset-top)]: clears the translucent status bar / notch
    // when the site runs as an installed PWA (mirrors landing top-nav.tsx).
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top,_0px)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <AppIcon
            logoUrl={branding.logoUrl}
            appName={branding.appName}
            className="h-6 w-6"
          />
          <span className="text-lg font-bold tracking-tight text-foreground">
            {branding.appName}
          </span>
        </Link>
        <nav className="flex items-center gap-4">
          <Button asChild variant="primary" size="sm" className="min-w-24">
            <Link href="/?auth=signup">Start</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
