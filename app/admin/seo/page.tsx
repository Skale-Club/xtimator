import { requireAdmin } from '@/lib/auth/admin-context'
import { getBranding } from '@/lib/platform-config'
import { SeoEditor } from './seo-editor'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const revalidate = 60

export default async function SeoPage() {
  await requireAdmin()
  const branding = await getBranding()

  const initial = {
    siteTitle: branding.siteTitle ?? '',
    metaDescription: branding.metaDescription ?? '',
    ogImageUrl: branding.ogImageUrl ?? '',
    canonicalBaseUrl: branding.canonicalBaseUrl ?? '',
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight"><T>SEO Settings</T></h1>
        <p className="text-sm text-muted-foreground">
          <T>Control how Xtimator appears in search engines and link previews.</T>
        </p>
      </div>
      <Card variant="glass" className="p-6 md:p-8">
        <SeoEditor initial={initial} />
      </Card>
    </div>
  )
}
