'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { legalPageSchema, type LegalPageInput } from '@/lib/schemas/admin'

export type LegalActionResult = { ok: true } | { ok: false; message: string }

const LEGAL_PAGE_IDS = ['privacy_policy', 'terms_of_service'] as const
type LegalPageId = typeof LEGAL_PAGE_IDS[number]

function isValidId(id: string): id is LegalPageId {
  return (LEGAL_PAGE_IDS as readonly string[]).includes(id)
}

export async function saveLegalPage(id: string, data: LegalPageInput): Promise<LegalActionResult> {
  const ctx = await requireAdmin()

  if (!isValidId(id)) return { ok: false, message: 'Invalid page id.' }

  const parsed = legalPageSchema.safeParse(data)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Validation failed' }

  const svc = requireServiceClient()
  const { error } = await svc.from('legal_pages').update({
    title: parsed.data.title,
    content: parsed.data.content,
    effective_date: parsed.data.effectiveDate || null,
    updated_at: new Date().toISOString(),
    updated_by_email: ctx.email,
  }).eq('id', id)

  if (error) return { ok: false, message: error.message }

  revalidatePath('/admin/legal')
  revalidatePath(`/${id === 'privacy_policy' ? 'privacy-policy' : 'terms-of-service'}`)

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'legal.save',
    targetType: 'legal_page',
    targetId: id,
  })

  return { ok: true }
}
