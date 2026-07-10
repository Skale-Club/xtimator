/**
 * Integration test (Phase 160, PUBURL-03 — highest-severity constraint):
 * proves the anon/publishable Supabase client can NEVER read an estimates
 * row via public_slug_token. The friendly-URL lookup
 * (getEstimateByPublicToken, lib/queries/share.ts) uses the SERVICE-ROLE
 * client exclusively -- this is the permanent regression guard against
 * reintroducing the bug class fixed by
 * 20260606000002_drop_estimates_anon_select_policy.sql, via the NEW column.
 *
 * Skip condition: env vars NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * / NEXT_PUBLIC_SUPABASE_ANON_KEY absent (mirrors tests/integration/price-book-rls.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const hasEnv = Boolean(SUPABASE_URL && SERVICE_ROLE && ANON_KEY)
const d = hasEnv ? describe : describe.skip

const E2E_PREFIX = 'phase160-rls-test-'

d('estimates.public_slug_token — RLS (Phase 160, PUBURL-03)', () => {
  const serviceClient: SupabaseClient = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const anonClient: SupabaseClient = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let seededToken: string
  let seededCompanyId: string
  // companies.user_id is NOT NULL and FK → auth.users(id) (initial_schema).
  // Seed a throwaway auth user so the company insert satisfies both; deleted
  // in afterAll (ON DELETE CASCADE also drops the company/project/estimate).
  let seededUserId: string

  beforeAll(async () => {
    const { data: created, error: userErr } = await serviceClient.auth.admin.createUser({
      email: `${E2E_PREFIX}${Date.now()}@test.xtimator.local`,
      password: `pw-${Date.now()}`,
      email_confirm: true,
    })
    expect(userErr).toBeNull()
    seededUserId = created.user!.id
  }, 30_000)

  it('setup: seed one company + estimate with a known public_slug_token', async () => {
    seededToken = `${E2E_PREFIX}${Date.now()}`

    const { data: company, error: companyErr } = await serviceClient
      .from('companies')
      .insert({ name: `${E2E_PREFIX}co-${Date.now()}`, user_id: seededUserId })
      .select('id')
      .single()
    expect(companyErr).toBeNull()
    seededCompanyId = company!.id as string

    const { data: project, error: projectErr } = await serviceClient
      .from('projects')
      .insert({ company_id: seededCompanyId, name: `${E2E_PREFIX}project`, status: 'sent' })
      .select('id')
      .single()
    expect(projectErr).toBeNull()

    const { error: estimateErr } = await serviceClient.from('estimates').insert({
      company_id: seededCompanyId,
      project_id: project!.id,
      public_slug_token: seededToken,
      status: 'sent',
      is_current: true,
      total: 100,
      payment_status: 'unpaid',
    })
    expect(estimateErr).toBeNull()
  })

  it('SC-1: public_slug_token column exists (service-role column smoke)', async () => {
    const { error } = await serviceClient.from('estimates').select('public_slug_token').limit(0)
    expect(error).toBeNull()
  })

  it('SC-2: anon client SELECT by public_slug_token returns EMPTY (RLS denies -- no new anon policy)', async () => {
    const { data, error } = await anonClient
      .from('estimates')
      .select('*')
      .eq('public_slug_token', seededToken)
    expect(data ?? []).toHaveLength(0)
    // If there IS an error it must be a policy/permission error, never
    // "column does not exist" (which would mean the column silently
    // didn't get created by the migration).
    if (error) {
      expect(error.message).not.toMatch(/does not exist|undefined/i)
    }
  })

  afterAll(async () => {
    if (seededCompanyId) {
      await serviceClient.from('estimates').delete().eq('company_id', seededCompanyId)
      await serviceClient.from('projects').delete().eq('company_id', seededCompanyId)
      await serviceClient.from('companies').delete().eq('id', seededCompanyId)
    }
    // Drop the throwaway auth user (cascades to any rows we missed above).
    if (seededUserId) {
      try { await serviceClient.auth.admin.deleteUser(seededUserId) } catch { /* best-effort */ }
    }
  })
})
