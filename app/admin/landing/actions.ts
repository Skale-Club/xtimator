'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { createStorage } from '@/lib/storage'
import { invalidatePlatformConfig } from '@/lib/platform-config'
import {
  landingContentSchema,
  heroImageFileSchema,
  type LandingContentInput,
} from '@/lib/schemas/admin'

export type SaveLandingResult = { ok: true } | { ok: false; message: string }

const MANAGED_HERO_PREFIX = '/platform-brand/hero-images/'

/**
 * Sanitize an upload filename into a slug-safe storage key fragment.
 *   "Crew On Site!.JPG" → "crew-on-site"
 */
function sanitizeBase(name: string): string {
  const noExt = name.replace(/\.[^.]+$/, '')
  const slug = noExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'hero-image'
}

/**
 * Save landing content. Accepts FormData so the hero image file can be
 * uploaded in the same round-trip as the text fields. The `content` JSON
 * field carries the rest of the landingContentSchema payload.
 */
export async function saveLandingContent(formData: FormData): Promise<SaveLandingResult> {
  const ctx = await requireAdmin()

  const rawContent = formData.get('content')
  if (typeof rawContent !== 'string') {
    return { ok: false, message: 'Missing content payload.' }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawContent)
  } catch {
    return { ok: false, message: 'Invalid content payload.' }
  }

  const parsed = landingContentSchema.safeParse(parsedJson)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  }

  const rawFile = formData.get('heroImageFile')
  const heroImageFile = rawFile instanceof File && rawFile.size > 0 ? rawFile : null
  const heroImageRemoved = formData.get('heroImageRemoved') === 'true'

  const svc = requireServiceClient()
  const storage = createStorage(svc)

  // --- Upload branch ------------------------------------------------------
  let newHeroUrl: string | null = null
  if (heroImageFile) {
    const fileCheck = heroImageFileSchema.safeParse(heroImageFile)
    if (!fileCheck.success) {
      return { ok: false, message: fileCheck.error.issues[0]?.message ?? 'Invalid file' }
    }
    const ext = (heroImageFile.name.split('.').pop() || 'png').toLowerCase()
    const base = sanitizeBase(heroImageFile.name)
    const path = `hero-images/${Date.now()}-${base}.${ext}`
    const body = Buffer.from(await heroImageFile.arrayBuffer())
    try {
      const result = await storage.upload('platform-brand', path, body, {
        contentType: heroImageFile.type,
        upsert: true,
      })
      newHeroUrl = storage.getPublicUrl('platform-brand', result.path)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.'
      return { ok: false, message }
    }
  }

  // --- Remove branch (only when no new file) ------------------------------
  if (!heroImageFile && heroImageRemoved) {
    const { data: existing } = await svc
      .from('platform_branding')
      .select('landing_content')
      .eq('id', 1)
      .maybeSingle()
    const currentUrl: string | null =
      (existing?.landing_content as { heroImageUrl?: string | null } | null)?.heroImageUrl ?? null
    if (currentUrl && currentUrl.includes(MANAGED_HERO_PREFIX)) {
      const idx = currentUrl.indexOf(MANAGED_HERO_PREFIX)
      const extracted = currentUrl.slice(idx + '/platform-brand/'.length)
      try {
        await storage.delete('platform-brand', extracted)
      } catch (err) {
        console.warn('[saveLandingContent] hero image storage delete failed:', err)
      }
    }
  }

  // --- Compute final hero URL --------------------------------------------
  let finalHeroUrl: string | null = parsed.data.heroImageUrl ?? null
  if (newHeroUrl) finalHeroUrl = newHeroUrl
  else if (heroImageRemoved) finalHeroUrl = null

  const persisted: LandingContentInput = {
    ...parsed.data,
    heroImageUrl: finalHeroUrl,
  }

  // Preserve the required singleton app name so an upsert INSERT path never
  // violates the platform_branding.app_name NOT NULL constraint.
  const { data: existing } = await svc
    .from('platform_branding')
    .select('app_name')
    .eq('id', 1)
    .maybeSingle()

  const { error } = await svc.from('platform_branding').upsert({
    id: 1,
    app_name: existing?.app_name ?? 'Xtimator',
    landing_content: persisted,
    updated_at: new Date().toISOString(),
  })
  if (error) return { ok: false, message: error.message }
  invalidatePlatformConfig()
  revalidatePath('/')
  revalidatePath('/', 'layout')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'landing.save',
    metadata: {
      hero_image_set: !!finalHeroUrl,
      hero_image_uploaded: !!newHeroUrl,
      hero_image_removed: heroImageRemoved,
    },
  })

  return { ok: true }
}
