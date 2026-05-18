'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { createStorage } from '@/lib/storage'
import { invalidatePlatformConfig } from '@/lib/platform-config'
import { brandingSchema } from '@/lib/schemas/admin'

export type SaveBrandingResult =
  | { ok: true }
  | { ok: false; errors: ReturnType<typeof flattenErr> }
  | { ok: false; message: string }

// Local helper kept inline to avoid leaking zod types in the public surface.
function flattenErr(): unknown {
  return null
}

export async function saveBranding(formData: FormData): Promise<SaveBrandingResult> {
  const ctx = await requireAdmin()

  const rawLogo = formData.get('logoFile')
  const raw = {
    appName: formData.get('appName'),
    primaryColor: formData.get('primaryColor') || null,
    emailFromName: formData.get('emailFromName') || null,
    // FormData returns a File when one is uploaded; an empty input becomes a 0-byte File
    // in some browsers and `null` in others. Normalise both to null so the schema's
    // .nullable().optional() accepts the missing case.
    logoFile: rawLogo instanceof File && rawLogo.size > 0 ? rawLogo : null,
  }

  const parsed = brandingSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten() as never }
  }

  const svc = requireServiceClient()
  const storage = createStorage(svc)

  let logoUrl: string | undefined = undefined
  const logoFile = parsed.data.logoFile
  if (logoFile && logoFile.size > 0) {
    const ext = (logoFile.name.split('.').pop() || 'png').toLowerCase()
    const path = `logo-${Date.now()}.${ext}`
    const body = Buffer.from(await logoFile.arrayBuffer())
    let uploadedPath: string
    try {
      const result = await storage.upload('platform-brand', path, body, {
        contentType: logoFile.type,
        upsert: true,
      })
      uploadedPath = result.path
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.'
      return { ok: false, message }
    }
    logoUrl = storage.getPublicUrl('platform-brand', uploadedPath)
  }

  // Favicon upload — same pattern as logo upload.
  let faviconUrl: string | undefined = undefined
  const rawFavicon = formData.get('faviconFile')
  const faviconFile = rawFavicon instanceof File && rawFavicon.size > 0 ? rawFavicon : null
  if (faviconFile) {
    const ext = (faviconFile.name.split('.').pop() || 'ico').toLowerCase()
    const path = `favicon-${Date.now()}.${ext}`
    const body = Buffer.from(await faviconFile.arrayBuffer())
    let uploadedPath: string
    try {
      const result = await storage.upload('platform-brand', path, body, {
        contentType: faviconFile.type,
        upsert: true,
      })
      uploadedPath = result.path
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Favicon upload failed.'
      return { ok: false, message }
    }
    faviconUrl = storage.getPublicUrl('platform-brand', uploadedPath)
  }

  const upsertPayload: Record<string, unknown> = {
    id: 1,
    app_name: parsed.data.appName,
    primary_color: parsed.data.primaryColor,
    email_from_name: parsed.data.emailFromName,
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  }
  if (logoUrl !== undefined) {
    upsertPayload.logo_url = logoUrl
  }
  if (faviconUrl !== undefined) {
    upsertPayload.favicon_url = faviconUrl
  }

  const { error: dbErr } = await svc.from('platform_branding').upsert(upsertPayload)
  if (dbErr) {
    return { ok: false, message: dbErr.message }
  }

  invalidatePlatformConfig()
  revalidatePath('/admin/branding')
  revalidatePath('/', 'layout')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'branding.save',
    metadata: {
      app_name_set: !!parsed.data.appName,
      primary_color_set: !!parsed.data.primaryColor,
      email_from_name_set: !!parsed.data.emailFromName,
      logo_uploaded: logoUrl !== undefined,
      favicon_uploaded: faviconUrl !== undefined,
    },
  })

  return { ok: true }
}
