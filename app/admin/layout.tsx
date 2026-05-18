import type { CSSProperties } from 'react'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
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
  const style = {
    ['--platform-primary' as string]: triplet ?? SYSTEM_COLORS.primaryHsl,
  } as CSSProperties

  return (
    <div
      data-theme="admin-dark"
      style={style}
      className="h-screen bg-background text-foreground flex overflow-hidden"
    >
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
  )
}
