import type { CSSProperties } from 'react'
import { getBranding } from '@/lib/platform-config'
import { hexToHslTriplet } from '@/lib/color'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import Link from 'next/link'
import { AuthBrandShowcase } from '@/components/auth/auth-brand-showcase'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const branding = await getBranding()
  const triplet = branding.primaryColor
    ? hexToHslTriplet(branding.primaryColor)
    : null
  const style = {
    ['--platform-primary' as string]: triplet ?? SYSTEM_COLORS.primaryHsl,
  } as CSSProperties

  return (
    <div
      data-theme="dark-auth"
      style={style}
      className="relative isolate min-h-screen overflow-hidden bg-background text-foreground selection:bg-primary/30"
    >
      {/* Phase 71 gradient-hero radial backdrop (cascades tenant brand via --primary). */}
      <div aria-hidden className="absolute inset-0 -z-10 gradient-hero" />
      {/* Polish: animated mesh layer beneath the form column for premium first impression. */}
      <div aria-hidden className="hero-mesh" />

      {/* Top back link */}
      <div className="absolute left-6 top-6 z-20 sm:left-8 sm:top-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back to home
        </Link>
      </div>

      {/* Two-column layout — form left, brand showcase right on desktop.
          Mobile: single column, form centered, showcase hidden. */}
      <div className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_minmax(0,520px)]">
        <main className="flex items-center justify-center px-4 py-16 sm:py-20 lg:py-12">
          {children}
        </main>
        <aside className="relative hidden overflow-hidden lg:block">
          <AuthBrandShowcase appName={branding.appName} />
        </aside>
      </div>
    </div>
  )
}
