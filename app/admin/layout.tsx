import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { getAdminContext } from '@/lib/auth/admin-context'
import { getCachedBranding } from '@/lib/platform-config'
import { hexToHslTriplet } from '@/lib/color'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { AdminNav } from '@/components/admin/admin-nav'
import { AdminTopbar } from '@/components/admin/admin-topbar'
import { PRIVATE_ROBOTS } from '@/lib/seo/route-policy'

export const metadata: Metadata = { robots: PRIVATE_ROBOTS }

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [adminCtx, branding] = await Promise.all([getAdminContext(), getCachedBranding()])
  // Not an admin — could be logged out, an expired session, or a leftover demo
  // session. Clear any session and send to the login dialog so an admin can sign
  // in, instead of a dead-end 404.
  if (!adminCtx) redirect('/api/logout')
  const ctx = adminCtx
  const triplet = branding.primaryColor
    ? hexToHslTriplet(branding.primaryColor)
    : null
  /**
   * The admin shell keeps a stable system accent so elevated controls do not
   * inherit tenant branding or warning-like colors. Tenant branding remains
   * available through --platform-primary for nested preview surfaces that
   * explicitly opt into it.
   */
  const style = {
    ['--platform-primary' as string]: triplet ?? SYSTEM_COLORS.primaryHsl,
    ['--primary' as string]: SYSTEM_COLORS.primaryHsl,
    ['--primary-foreground' as string]: '0 0% 100%',
    ['--ring' as string]: SYSTEM_COLORS.primaryHsl,
  } as CSSProperties

  return (
    <div
      data-theme="admin-dark"
      style={style}
      className="h-screen bg-background text-foreground flex flex-col overflow-hidden"
    >
      {/* Persistent "Super Admin Mode" banner - sticky reminder of elevated context */}
      <div className="flex items-center justify-center gap-2 bg-[hsl(var(--primary)/0.12)] border-b border-[hsl(var(--primary)/0.3)] px-4 py-1.5 text-xs font-medium text-[hsl(var(--primary))]">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>Super Admin Mode - {ctx.email}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <AdminNav
          appName={branding.appName}
          logoUrl={branding.logoUrl}
          adminEmail={ctx.email}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AdminTopbar adminEmail={ctx.email} />
          <main className="flex-1 overflow-y-auto px-8 py-8">
            <Suspense>{children}</Suspense>
          </main>
        </div>
      </div>
    </div>
  )
}
