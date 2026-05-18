import type { CSSProperties } from 'react'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { getAdminContext } from '@/lib/auth/admin-context'
import { getCachedBranding } from '@/lib/platform-config'
import { hexToHslTriplet } from '@/lib/color'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { AdminNav } from '@/components/admin/admin-nav'
import { AdminTopbar } from '@/components/admin/admin-topbar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [adminCtx, branding] = await Promise.all([getAdminContext(), getCachedBranding()])
  if (!adminCtx) notFound()
  const ctx = adminCtx
  const triplet = branding.primaryColor
    ? hexToHslTriplet(branding.primaryColor)
    : null
  /**
   * Inside the admin shell we override --primary to a distinct AMBER hue
   * (38 92% 50% = #F59E0B). Every interactive element — buttons, links, focus
   * rings, gradient-brand, active nav bar — switches accent so it's instantly
   * clear you're operating in an elevated context. Tenant brand cascade
   * (--platform-primary) is still set in case any nested surface explicitly
   * references it, but --primary takes precedence everywhere it matters.
   */
  const style = {
    ['--platform-primary' as string]: triplet ?? SYSTEM_COLORS.primaryHsl,
    ['--primary' as string]: '38 92% 50%',
    ['--primary-foreground' as string]: '0 0% 100%',
    ['--ring' as string]: '38 92% 50%',
  } as CSSProperties

  return (
    <div
      data-theme="admin-dark"
      style={style}
      className="h-screen bg-background text-foreground flex flex-col overflow-hidden"
    >
      {/* Persistent "Super Admin Mode" banner — sticky reminder of elevated context */}
      <div className="flex items-center justify-center gap-2 bg-[hsl(var(--primary)/0.12)] border-b border-[hsl(var(--primary)/0.3)] px-4 py-1.5 text-xs font-medium text-[hsl(var(--primary))]">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>Super Admin Mode · {ctx.email}</span>
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
