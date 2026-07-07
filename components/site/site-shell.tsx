import type { ReactNode } from 'react'
import { SiteHeader, type SiteHeaderBranding } from './site-header'
import { SiteFooter } from './site-footer'

/**
 * Reusable dark-themed marketing/legal shell. Mirrors the landing page's
 * visual layer (dark isolate + radial gradient hero glow) and wraps children
 * with the SiteHeader on top and SiteFooter on bottom.
 *
 * Use on non-landing pages that need the same chrome: privacy policy, terms
 * of service, blog, marketing micro-sites, etc.
 *
 *   <SiteShell branding={branding}>
 *     <main className="mx-auto max-w-3xl px-6 py-[clamp(48px,10vw,96px)]">
 *       …page content…
 *     </main>
 *   </SiteShell>
 *
 * The landing page itself does NOT use SiteShell — it owns its own
 * `<LandingPage>` component with co-located AuthDialog state. SiteShell is
 * for static / lightly-interactive pages that just want the visual chrome.
 *
 * Server component — children may be server or client.
 */
interface SiteShellProps {
  branding: SiteHeaderBranding
  children: ReactNode
}

export function SiteShell({ branding, children }: SiteShellProps) {
  return (
    <div
      data-testid="site-shell"
      className="dark isolate min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary/30"
    >
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,hsl(var(--primary)/0.15),hsl(var(--foreground)/0))]"
      />
      <SiteHeader branding={branding} />
      {/* 4rem header + the PWA status-bar inset SiteHeader absorbs */}
      <div className="pt-[calc(4rem_+_env(safe-area-inset-top,_0px))]">{children}</div>
      <SiteFooter branding={branding} />
    </div>
  )
}
