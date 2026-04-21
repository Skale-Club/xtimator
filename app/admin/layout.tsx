import type { CSSProperties } from 'react'
import { requireAdmin } from '@/lib/auth/admin-context'
import { getBranding } from '@/lib/platform-config'
import { hexToHslTriplet } from '@/lib/color'
import { AdminNav } from '@/components/admin/admin-nav'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await requireAdmin()
  const branding = await getBranding()
  const triplet = branding.primaryColor
    ? hexToHslTriplet(branding.primaryColor)
    : null
  const style = {
    ['--platform-primary' as string]: triplet ?? '220 91% 60%',
  } as CSSProperties

  return (
    <div
      data-theme="admin-dark"
      style={style}
      className="min-h-screen bg-background text-foreground flex"
    >
      <AdminNav
        appName={branding.appName}
        logoUrl={branding.logoUrl}
        adminEmail={ctx.email}
      />
      <main className="flex-1 max-w-[720px] mx-auto px-8 pt-8 pb-12">
        {children}
      </main>
    </div>
  )
}
