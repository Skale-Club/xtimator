/**
 * Phase 160 — Playwright fixture: seed one company (WITH a slug) + one
 * estimate (WITH both share_token AND public_slug_token) so the
 * friendly-URL e2e spec can assert PUBURL-01/02/05 parity.
 *
 * Required env vars (skip the suite if either is missing):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SeededFriendlyEstimate {
  companySlug: string
  estimateSlug: string
  shortToken: string
  shareToken: string
  friendlyPath: string
}

const E2E_PREFIX = 'phase160-e2e-'

function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function hasSeederCredentials(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function seedFriendlyUrlEstimate(): Promise<SeededFriendlyEstimate> {
  const svc = getServiceClient()
  if (!svc) {
    throw new Error('seedFriendlyUrlEstimate: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  await cleanupFriendlyUrlEstimate()

  const companySlug = `${E2E_PREFIX}co-${Date.now()}`
  const shareToken = `${E2E_PREFIX}share-${Date.now()}`
  // Exactly PUBLIC_SLUG_TOKEN_LENGTH (12) chars — the real route parses a
  // FIXED-length trailing suffix (lib/estimate/public-url.ts).
  const shortToken = Date.now().toString(36).padStart(12, '0').slice(-12)
  const estimateSlug = 'kitchen-remodel'

  const { data: company, error: companyErr } = await svc
    .from('companies')
    .insert({ name: `${E2E_PREFIX}company`, slug: companySlug })
    .select('id')
    .single()
  if (companyErr || !company) throw new Error(`company insert failed: ${companyErr?.message}`)

  const { data: project, error: projectErr } = await svc
    .from('projects')
    .insert({ company_id: company.id, name: `${E2E_PREFIX}${estimateSlug}`, status: 'sent' })
    .select('id')
    .single()
  if (projectErr || !project) throw new Error(`project insert failed: ${projectErr?.message}`)

  const { error: estimateErr } = await svc.from('estimates').insert({
    company_id: company.id,
    project_id: project.id,
    share_token: shareToken,
    public_slug_token: shortToken,
    status: 'sent',
    is_current: true,
    total: 250,
    payment_status: 'unpaid',
  })
  if (estimateErr) throw new Error(`estimate insert failed: ${estimateErr.message}`)

  return {
    companySlug,
    estimateSlug,
    shortToken,
    shareToken,
    friendlyPath: `/estimate/${companySlug}/${estimateSlug}-${shortToken}`,
  }
}

export async function cleanupFriendlyUrlEstimate(): Promise<void> {
  const svc = getServiceClient()
  if (!svc) return
  await svc.from('estimates').delete().like('share_token', `${E2E_PREFIX}%`)
  await svc.from('projects').delete().like('name', `${E2E_PREFIX}%`)
  await svc.from('companies').delete().like('name', `${E2E_PREFIX}%`)
}
