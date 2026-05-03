import { requireAdmin } from '@/lib/auth/admin-context'
import { getBranding } from '@/lib/platform-config'
import { SeoEditor } from './seo-editor'

export const dynamic = 'force-dynamic'

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">SEO Settings</h1>
        <p className="text-sm text-muted-foreground">
          Control how Xtimator appears in search engines and link previews.
        </p>
      </div>
      <SeoEditor initial={initial} />
    </div>
  )
}
