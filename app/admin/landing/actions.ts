'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { createStorage } from '@/lib/storage'
import { convertImageToWebp } from '@/lib/image/webp'
import { invalidatePlatformConfig } from '@/lib/platform-config'
import {
  landingContentSchema,
  heroImageFileSchema,
  heroBackgroundImageFileSchema,
  heroBackgroundVideoFileSchema,
  stepImageFileSchema,
  featureImageFileSchema,
  type LandingContentInput,
} from '@/lib/schemas/admin'

export type SaveLandingResult =
  | { ok: true; stepImageUrls: Array<string | null>; featureImageUrls: Array<string | null> }
  | { ok: false; message: string }

const MANAGED_HERO_PREFIX = '/platform-brand/hero-images/'
const MANAGED_BG_IMAGE_PREFIX = '/platform-brand/hero-bg-images/'
const MANAGED_BG_VIDEO_PREFIX = '/platform-brand/hero-bg-videos/'
const MANAGED_STEP_PREFIX = '/platform-brand/step-images/'
const MANAGED_FEATURE_PREFIX = '/platform-brand/feature-images/'

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
    const base = sanitizeBase(heroImageFile.name)
    const path = `hero-images/${Date.now()}-${base}.webp`
    try {
      const webpBuffer = await convertImageToWebp(heroImageFile)
      const result = await storage.upload('platform-brand', path, webpBuffer, {
        contentType: 'image/webp',
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

  // --- Background image (full-bleed section backdrop, distinct from the
  // foreground heroImageFile above): convert to WebP, upload, or remove ---
  const rawBgImageFile = formData.get('heroBackgroundImageFile')
  const bgImageFile = rawBgImageFile instanceof File && rawBgImageFile.size > 0 ? rawBgImageFile : null
  const bgImageRemoved = formData.get('heroBackgroundImageRemoved') === 'true'

  let newBgImageUrl: string | null = null
  if (bgImageFile) {
    const fileCheck = heroBackgroundImageFileSchema.safeParse(bgImageFile)
    if (!fileCheck.success) {
      return { ok: false, message: fileCheck.error.issues[0]?.message ?? 'Invalid file' }
    }
    const base = sanitizeBase(bgImageFile.name)
    const path = `hero-bg-images/${Date.now()}-${base}.webp`
    try {
      const webpBuffer = await convertImageToWebp(bgImageFile)
      const result = await storage.upload('platform-brand', path, webpBuffer, {
        contentType: 'image/webp',
        upsert: true,
      })
      newBgImageUrl = storage.getPublicUrl('platform-brand', result.path)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Background image upload failed.'
      return { ok: false, message }
    }
  }
  if (!bgImageFile && bgImageRemoved) {
    const { data: existing } = await svc
      .from('platform_branding')
      .select('landing_content')
      .eq('id', 1)
      .maybeSingle()
    const currentUrl: string | null =
      (existing?.landing_content as { heroBackgroundImageUrl?: string | null } | null)?.heroBackgroundImageUrl ?? null
    if (currentUrl && currentUrl.includes(MANAGED_BG_IMAGE_PREFIX)) {
      const idx = currentUrl.indexOf(MANAGED_BG_IMAGE_PREFIX)
      const extracted = currentUrl.slice(idx + '/platform-brand/'.length)
      try {
        await storage.delete('platform-brand', extracted)
      } catch (err) {
        console.warn('[saveLandingContent] background image storage delete failed:', err)
      }
    }
  }
  let finalBgImageUrl: string | null = parsed.data.heroBackgroundImageUrl ?? null
  if (newBgImageUrl) finalBgImageUrl = newBgImageUrl
  else if (bgImageRemoved) finalBgImageUrl = null

  // --- Background video: NOT converted (no video transcoding step in this
  // stack — would need ffmpeg), stored as-is. Upload, or remove. ----------
  const rawBgVideoFile = formData.get('heroBackgroundVideoFile')
  const bgVideoFile = rawBgVideoFile instanceof File && rawBgVideoFile.size > 0 ? rawBgVideoFile : null
  const bgVideoRemoved = formData.get('heroBackgroundVideoRemoved') === 'true'

  let newBgVideoUrl: string | null = null
  if (bgVideoFile) {
    const fileCheck = heroBackgroundVideoFileSchema.safeParse(bgVideoFile)
    if (!fileCheck.success) {
      return { ok: false, message: fileCheck.error.issues[0]?.message ?? 'Invalid file' }
    }
    const ext = bgVideoFile.type === 'video/webm' ? 'webm' : 'mp4'
    const base = sanitizeBase(bgVideoFile.name)
    const path = `hero-bg-videos/${Date.now()}-${base}.${ext}`
    try {
      const body = Buffer.from(await bgVideoFile.arrayBuffer())
      const result = await storage.upload('platform-brand', path, body, {
        contentType: bgVideoFile.type,
        upsert: true,
      })
      newBgVideoUrl = storage.getPublicUrl('platform-brand', result.path)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Background video upload failed.'
      return { ok: false, message }
    }
  }
  if (!bgVideoFile && bgVideoRemoved) {
    const { data: existing } = await svc
      .from('platform_branding')
      .select('landing_content')
      .eq('id', 1)
      .maybeSingle()
    const currentUrl: string | null =
      (existing?.landing_content as { heroBackgroundVideoUrl?: string | null } | null)?.heroBackgroundVideoUrl ?? null
    if (currentUrl && currentUrl.includes(MANAGED_BG_VIDEO_PREFIX)) {
      const idx = currentUrl.indexOf(MANAGED_BG_VIDEO_PREFIX)
      const extracted = currentUrl.slice(idx + '/platform-brand/'.length)
      try {
        await storage.delete('platform-brand', extracted)
      } catch (err) {
        console.warn('[saveLandingContent] background video storage delete failed:', err)
      }
    }
  }
  let finalBgVideoUrl: string | null = parsed.data.heroBackgroundVideoUrl ?? null
  if (newBgVideoUrl) finalBgVideoUrl = newBgVideoUrl
  else if (bgVideoRemoved) finalBgVideoUrl = null

  // --- Step images (0-2): convert to WebP, upload, or remove ------------
  const stepImageUrls: Array<string | null | undefined> = []
  for (let i = 0; i < (parsed.data.howItWorksSteps?.length ?? 0); i++) {
    const rawStepFile = formData.get(`stepImageFile_${i}`)
    const stepFile = rawStepFile instanceof File && rawStepFile.size > 0 ? rawStepFile : null
    const stepRemoved = formData.get(`stepImageRemoved_${i}`) === 'true'

    if (stepFile) {
      const fileCheck = stepImageFileSchema.safeParse(stepFile)
      if (!fileCheck.success) {
        return { ok: false, message: `Step ${i + 1} image: ${fileCheck.error.issues[0]?.message ?? 'Invalid file'}` }
      }
      const webpBuffer = await convertImageToWebp(stepFile)
      const path = `step-images/${Date.now()}-step-${i}.webp`
      try {
        const result = await storage.upload('platform-brand', path, webpBuffer, {
          contentType: 'image/webp',
          upsert: true,
        })
        stepImageUrls.push(storage.getPublicUrl('platform-brand', result.path))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Step image upload failed.'
        return { ok: false, message }
      }
    } else if (stepRemoved) {
      // Delete existing image from storage if it's one we manage
      const existingStep = (parsed.data.howItWorksSteps ?? [])[i]
      const existingUrl = existingStep?.imageUrl ?? null
      if (existingUrl && existingUrl.includes(MANAGED_STEP_PREFIX)) {
        const idx = existingUrl.indexOf(MANAGED_STEP_PREFIX)
        const extracted = existingUrl.slice(idx + '/platform-brand/'.length)
        try {
          await storage.delete('platform-brand', extracted)
        } catch (err) {
          console.warn(`[saveLandingContent] step ${i} image storage delete failed:`, err)
        }
      }
      stepImageUrls.push(null)
    } else {
      // No change — preserve existing URL from the submitted content
      stepImageUrls.push(undefined)
    }
  }

  // Merge step image URLs back into steps
  const mergedSteps = (parsed.data.howItWorksSteps ?? []).map((step, i) => {
    const urlResult = stepImageUrls[i]
    return {
      ...step,
      imageUrl: urlResult !== undefined ? urlResult : (step.imageUrl ?? null),
    }
  })

  // --- Feature images (one per feature card): convert to WebP, upload, or remove ---
  const featureImageUrls: Array<string | null | undefined> = []
  for (let i = 0; i < (parsed.data.features?.length ?? 0); i++) {
    const rawFeatureFile = formData.get(`featureImageFile_${i}`)
    const featureFile = rawFeatureFile instanceof File && rawFeatureFile.size > 0 ? rawFeatureFile : null
    const featureRemoved = formData.get(`featureImageRemoved_${i}`) === 'true'

    if (featureFile) {
      const fileCheck = featureImageFileSchema.safeParse(featureFile)
      if (!fileCheck.success) {
        return { ok: false, message: `Feature ${i + 1} image: ${fileCheck.error.issues[0]?.message ?? 'Invalid file'}` }
      }
      const webpBuffer = await convertImageToWebp(featureFile)
      const path = `feature-images/${Date.now()}-feature-${i}.webp`
      try {
        const result = await storage.upload('platform-brand', path, webpBuffer, {
          contentType: 'image/webp',
          upsert: true,
        })
        featureImageUrls.push(storage.getPublicUrl('platform-brand', result.path))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Feature image upload failed.'
        return { ok: false, message }
      }
    } else if (featureRemoved) {
      const existingFeature = (parsed.data.features ?? [])[i]
      const existingUrl = existingFeature?.imageUrl ?? null
      if (existingUrl && existingUrl.includes(MANAGED_FEATURE_PREFIX)) {
        const idx = existingUrl.indexOf(MANAGED_FEATURE_PREFIX)
        const extracted = existingUrl.slice(idx + '/platform-brand/'.length)
        try {
          await storage.delete('platform-brand', extracted)
        } catch (err) {
          console.warn(`[saveLandingContent] feature ${i} image storage delete failed:`, err)
        }
      }
      featureImageUrls.push(null)
    } else {
      featureImageUrls.push(undefined)
    }
  }

  const mergedFeatures = (parsed.data.features ?? []).map((f, i) => ({
    ...f,
    imageUrl: featureImageUrls[i] !== undefined ? featureImageUrls[i] : (f.imageUrl ?? null),
  }))

  const persisted: LandingContentInput = {
    ...parsed.data,
    heroImageUrl: finalHeroUrl,
    heroBackgroundImageUrl: finalBgImageUrl,
    heroBackgroundVideoUrl: finalBgVideoUrl,
    howItWorksSteps: mergedSteps as LandingContentInput['howItWorksSteps'],
    features: mergedFeatures as LandingContentInput['features'],
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
      hero_background_type: parsed.data.heroBackgroundType ?? 'none',
      hero_background_image_uploaded: !!newBgImageUrl,
      hero_background_video_uploaded: !!newBgVideoUrl,
    },
  })

  return {
    ok: true,
    stepImageUrls: mergedSteps.map(s => s.imageUrl ?? null),
    featureImageUrls: mergedFeatures.map(f => f.imageUrl ?? null),
  }
}
