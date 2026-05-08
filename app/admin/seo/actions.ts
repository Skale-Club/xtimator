'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { invalidatePlatformConfig } from '@/lib/platform-config'
import { seoSchema } from '@/lib/schemas/admin'

export type SaveSeoResult = { ok: true } | { ok: false; message: string }

export async function saveSeo(formData: FormData): Promise<SaveSeoResult> {
  await requireAdmin()

  const raw = {
    siteTitle: formData.get('siteTitle') || null,
    metaDescription: formData.get('metaDescription') || null,
    ogImageUrl: formData.get('ogImageUrl') || '',
    canonicalBaseUrl: formData.get('canonicalBaseUrl') || '',
  }

  const parsed = seoSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  const svc = requireServiceClient()
  const { error } = await svc.from('platform_branding').upsert({
    id: 1,
    site_title: parsed.data.siteTitle,
    meta_description: parsed.data.metaDescription,
    og_image_url: parsed.data.ogImageUrl,
    canonical_base_url: parsed.data.canonicalBaseUrl,
    updated_at: new Date().toISOString(),
  })

  if (error) return { ok: false, message: error.message }

  invalidatePlatformConfig()
  revalidatePath('/admin/seo')
  revalidatePath('/', 'layout')
  return { ok: true }
}
