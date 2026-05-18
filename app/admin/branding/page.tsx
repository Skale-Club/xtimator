import { requireAdmin } from '@/lib/auth/admin-context'
import { getBranding } from '@/lib/platform-config'
import { BrandingEditor, type EditorBranding } from './branding-editor'
import { Card } from '@/components/ui/card'

export const revalidate = 60

export default async function BrandingPage() {
  await requireAdmin()
  const branding = await getBranding()

  const initial: EditorBranding = {
    appName: branding.appName,
    logoUrl: branding.logoUrl,
    primaryColor: branding.primaryColor,
    emailFromName: branding.emailFromName,
    faviconUrl: branding.faviconUrl,
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">Branding</h1>
        <p className="text-sm text-muted-foreground">
          Platform identity shown on auth pages, admin tools, and platform-sent
          emails. Does not affect tenant or client-facing branding.
        </p>
      </div>

      <Card variant="glass" className="p-6 md:p-8">
        <BrandingEditor initial={initial} />
      </Card>
    </div>
  )
}
