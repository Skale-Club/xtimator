/**
 * Integration tests (Phase 19): company_price_book RLS + price_source column smoke
 *
 * Covers:
 *   SC-1: company_price_book table exists and is accessible via service role
 *   SC-2: anon client SELECT returns empty (RLS isolates by company — no session = no rows)
 *   SC-3: price_source column exists on estimate_items
 *
 * Run: bun run test (vitest run)
 * Skip condition: env vars NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY absent
 */
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const hasEnv = Boolean(SUPABASE_URL && SERVICE_ROLE && ANON_KEY)
const d = hasEnv ? describe : describe.skip

d('company_price_book — schema + RLS (Phase 19)', () => {
  const serviceClient = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const anonClient = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  it('SC-1: service-role can SELECT from company_price_book (table exists smoke)', async () => {
    const { error } = await serviceClient
      .from('company_price_book')
      .select('id')
      .limit(0)
    expect(error).toBeNull()
  })

  it('SC-2: anon client SELECT returns empty array (RLS — no auth session = no rows)', async () => {
    const { data, error } = await anonClient
      .from('company_price_book')
      .select('*')
    // RLS with no session: either empty data or an error — never another company's rows
    const rows = data ?? []
    expect(rows).toHaveLength(0)
    // If there is an error it must reference policy/security, not a missing table
    if (error) {
      expect(error.message).not.toMatch(/does not exist|undefined/i)
    }
  })

  it('SC-3: price_source column exists on estimate_items (column smoke)', async () => {
    const { error } = await serviceClient
      .from('estimate_items')
      .select('price_source')
      .limit(0)
    expect(error).toBeNull()
  })

  it.todo('anon INSERT into company_price_book is rejected by RLS')
  it.todo('cross-company SELECT returns empty (requires two-company fixture)')
})
