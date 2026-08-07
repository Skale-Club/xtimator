'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { serverStorage } from '@/lib/storage/server'
import { storageProxyPath } from '@/lib/storage/asset-url'
import { invalidatePlatformConfig } from '@/lib/platform-config'
import { seoSchema } from '@/lib/schemas/admin'

// NOT converted to WebP, unlike other uploads in this app: og:image is read
// by external social crawlers (Facebook/LinkedIn/Slack/X), not rendered
// in-app. LinkedIn historically doesn't support WebP og:image and Facebook
// has known edge-case parse failures — a broken share-link preview is a
// silent, hard-to-detect regression not worth the modest size savings.

export type SaveSeoResult = { ok: true } | { ok: false; message: string }

const MANAGED_OG_PREFIX = '/platform-brand/og-images/'

/**
 * Sanitize an upload filename into a slug-safe storage key fragment.
 *   "My Cover (final)!.PNG" → "my-cover-final"
 */
function sanitizeBase(name: string): string {
  const noExt = name.replace(/\.[^.]+$/, '')
  const slug = noExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'og-image'
}

export async function saveSeo(formData: FormData): Promise<SaveSeoResult> {
  const ctx = await requireAdmin()

  const rawOgFile = formData.get('ogImageFile')
  const ogImageFile = rawOgFile instanceof File && rawOgFile.size > 0 ? rawOgFile : null
  const ogImageRemoved = formData.get('ogImageRemoved') === 'true'

  const raw = {
    siteTitle: formData.get('siteTitle') || null,
    metaDescription: formData.get('metaDescription') || null,
    ogImageUrl: formData.get('ogImageUrl') || '',
    canonicalBaseUrl: formData.get('canonicalBaseUrl') || '',
    ogImageFile,
    ogImageRemoved,
  }

  const parsed = seoSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  const svc = requireServiceClient()
  const storage = serverStorage(svc)

  // --- Upload branch ------------------------------------------------------
  let newOgUrl: string | null = null
  const file = parsed.data.ogImageFile
  if (file) {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const base = sanitizeBase(file.name)
    const path = `og-images/${Date.now()}-${base}.${ext}`
    const body = Buffer.from(await file.arrayBuffer())
    let uploadedPath: string
    try {
      const result = await storage.upload('platform-brand', path, body, {
        contentType: file.type,
        upsert: true,
      })
      uploadedPath = result.path
      // Phase 190 (URL-01): persist a same-origin path. The key is built from
      // sanitizeBase(file.name) + an extension, so storageProxyPath()'s key
      // validation is a guard rather than a live branch; it sits inside the same
      // try that already returns { ok: false, message }.
      newOgUrl = storageProxyPath('platform-brand', uploadedPath)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.'
      return { ok: false, message }
    }
  }

  // --- Remove branch (only if no new file) --------------------------------
  if (!file && parsed.data.ogImageRemoved) {
    const { data: existing } = await svc
      .from('platform_branding')
      .select('og_image_url')
      .eq('id', 1)
      .maybeSingle()
    const currentUrl: string | null = existing?.og_image_url ?? null
    if (currentUrl && currentUrl.includes(MANAGED_OG_PREFIX)) {
      const idx = currentUrl.indexOf(MANAGED_OG_PREFIX)
      // Strip the leading `/platform-brand/` to get the bucket-relative path.
      const extracted = currentUrl.slice(idx + '/platform-brand/'.length)
      try {
        await storage.delete('platform-brand', extracted)
      } catch (err) {
        // Best-effort cleanup: log + continue. The DB write below still happens.
        console.warn('[saveSeo] OG image storage delete failed:', err)
      }
    }
  }

  // --- Compute final URL value to persist ---------------------------------
  let finalOgUrl: string | null = parsed.data.ogImageUrl
  if (newOgUrl) finalOgUrl = newOgUrl
  else if (parsed.data.ogImageRemoved) finalOgUrl = null

  // Read existing app_name so the upsert INSERT path never sends null for
  // the NOT NULL column (only happens on first-ever save before row exists).
  const { data: existing } = await svc
    .from('platform_branding')
    .select('app_name')
    .eq('id', 1)
    .maybeSingle()

  const { error } = await svc.from('platform_branding').upsert({
    id: 1,
    app_name: existing?.app_name ?? 'Xtimator',
    site_title: parsed.data.siteTitle,
    meta_description: parsed.data.metaDescription,
    og_image_url: finalOgUrl,
    canonical_base_url: parsed.data.canonicalBaseUrl,
    updated_at: new Date().toISOString(),
  })

  if (error) return { ok: false, message: error.message }

  invalidatePlatformConfig()
  revalidatePath('/admin/seo')
  revalidatePath('/', 'layout')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'seo.save',
    metadata: {
      site_title_set: !!parsed.data.siteTitle,
      meta_description_set: !!parsed.data.metaDescription,
      og_image_set: !!finalOgUrl,
      og_image_uploaded: !!newOgUrl,
      og_image_removed: parsed.data.ogImageRemoved,
      canonical_set: !!parsed.data.canonicalBaseUrl,
    },
  })

  return { ok: true }
}
