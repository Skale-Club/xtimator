import type { CSSProperties } from 'react'
import { getBranding } from '@/lib/platform-config'
import { hexToHslTriplet } from '@/lib/color'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import Link from 'next/link'

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
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 text-foreground selection:bg-primary/30"
    >
      {/* Top back link */}
      <div className="absolute left-6 top-6 sm:left-8 sm:top-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back to home
        </Link>
      </div>

      {children}
    </div>
  )
}
