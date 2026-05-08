'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { invalidatePlatformConfig } from '@/lib/platform-config'
import { landingContentSchema, type LandingContentInput } from '@/lib/schemas/admin'

export type SaveLandingResult = { ok: true } | { ok: false; message: string }

export async function saveLandingContent(data: LandingContentInput): Promise<SaveLandingResult> {
  await requireAdmin()
  const parsed = landingContentSchema.safeParse(data)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }
  const svc = requireServiceClient()
  const { error } = await svc.from('platform_branding').upsert({
    id: 1,
    landing_content: parsed.data,
    updated_at: new Date().toISOString(),
  })
  if (error) return { ok: false, message: error.message }
  invalidatePlatformConfig()
  revalidatePath('/')
  revalidatePath('/', 'layout')
  return { ok: true }
}
