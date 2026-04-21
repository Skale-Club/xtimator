import { requireAdmin } from '@/lib/auth/admin-context'
import { getBranding } from '@/lib/platform-config'
import { BrandingEditor, type EditorBranding } from './branding-editor'

export const dynamic = 'force-dynamic'

export default async function BrandingPage() {
  await requireAdmin()
  const branding = await getBranding()

  const initial: EditorBranding = {
    appName: branding.appName,
    logoUrl: branding.logoUrl,
    primaryColor: branding.primaryColor,
    emailFromName: branding.emailFromName,
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Branding</h1>
        <p className="text-sm text-muted-foreground">
          Platform identity shown on auth pages, admin tools, and platform-sent
          emails. Does not affect tenant or client-facing branding.
        </p>
      </div>

      <BrandingEditor initial={initial} />
    </div>
  )
}
