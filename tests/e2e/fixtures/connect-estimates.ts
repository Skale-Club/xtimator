/**
 * Phase 70 — Plan 70-05 Playwright fixture: seed two estimates (one from a
 * Stripe-connected company, one from an unconnected company) so the share-page
 * spec can assert both branches of the "100% optional" guarantee.
 *
 * Why a service-client seeder (vs the UI signup flow): we want byte-identical
 * deterministic shapes for the snapshot tests. Signing two new companies up
 * through the UI on every CI run would re-introduce non-determinism in
 * created_at / IDs and slow the suite by 30-60s.
 *
 * Cleanup strategy: every row this seeder writes has either share_token starting
 * with `phase70-e2e-` (for estimates) or a company name starting with
 * `phase70-e2e-`. The teardown is a single DELETE per table on that prefix —
 * safe even if multiple test files share the fixture or a previous run crashed
 * before cleanup.
 *
 * Required env vars (skip the suite if either is missing):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SeededTokens {
  connectedToken: string
  unconnectedToken: string
}

const E2E_PREFIX = 'phase70-e2e-'
const CONNECTED_TOKEN = `${E2E_PREFIX}connected-${Date.now()}`
const UNCONNECTED_TOKEN = `${E2E_PREFIX}unconnected-${Date.now()}`
const CONNECTED_COMPANY_NAME = `${E2E_PREFIX}connected-co`
const UNCONNECTED_COMPANY_NAME = `${E2E_PREFIX}unconnected-co`

function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function hasSeederCredentials(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export async function seedConnectEstimates(): Promise<SeededTokens> {
  const svc = getServiceClient()
  if (!svc) {
    throw new Error(
      'seedConnectEstimates: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  // Cleanup any leftovers from a prior failed run before seeding.
  await cleanupConnectEstimates()

  // 1. Two companies — one with stripe_account_id set, one without.
  const { data: companies, error: companiesErr } = await svc
    .from('companies')
    .insert([
      {
        name: CONNECTED_COMPANY_NAME,
        stripe_account_id: 'acct_test_seed',
        stripe_connect_status: 'active',
        stripe_account_email: 'connected@phase70-e2e.test',
        stripe_account_display_name: 'Connected Test Co',
      },
      {
        name: UNCONNECTED_COMPANY_NAME,
      },
    ])
    .select('id, name')

  if (companiesErr || !companies || companies.length !== 2) {
    throw new Error(`seedConnectEstimates: company insert failed: ${companiesErr?.message}`)
  }

  const connectedCo = companies.find((c) => c.name === CONNECTED_COMPANY_NAME)!
  const unconnectedCo = companies.find((c) => c.name === UNCONNECTED_COMPANY_NAME)!

  // 2. Two projects (one per company).
  const { data: projects, error: projectsErr } = await svc
    .from('projects')
    .insert([
      {
        company_id: connectedCo.id,
        name: `${E2E_PREFIX}connected-project`,
        status: 'sent',
        total: 250,
      },
      {
        company_id: unconnectedCo.id,
        name: `${E2E_PREFIX}unconnected-project`,
        status: 'sent',
        total: 250,
      },
    ])
    .select('id, company_id')

  if (projectsErr || !projects || projects.length !== 2) {
    throw new Error(`seedConnectEstimates: project insert failed: ${projectsErr?.message}`)
  }

  const connectedProject = projects.find((p) => p.company_id === connectedCo.id)!
  const unconnectedProject = projects.find((p) => p.company_id === unconnectedCo.id)!

  // 3. Two estimates with deterministic share tokens.
  const { error: estimatesErr } = await svc.from('estimates').insert([
    {
      company_id: connectedCo.id,
      project_id: connectedProject.id,
      share_token: CONNECTED_TOKEN,
      status: 'sent',
      is_current: true,
      total: 250,
      payment_status: 'unpaid',
    },
    {
      company_id: unconnectedCo.id,
      project_id: unconnectedProject.id,
      share_token: UNCONNECTED_TOKEN,
      status: 'sent',
      is_current: true,
      total: 250,
      payment_status: 'unpaid',
    },
  ])

  if (estimatesErr) {
    throw new Error(`seedConnectEstimates: estimate insert failed: ${estimatesErr.message}`)
  }

  return { connectedToken: CONNECTED_TOKEN, unconnectedToken: UNCONNECTED_TOKEN }
}

export async function cleanupConnectEstimates(): Promise<void> {
  const svc = getServiceClient()
  if (!svc) return

  // Order matters: estimates → projects → companies (FK dependencies).
  await svc.from('estimates').delete().like('share_token', `${E2E_PREFIX}%`)
  await svc.from('projects').delete().like('name', `${E2E_PREFIX}%`)
  await svc.from('companies').delete().like('name', `${E2E_PREFIX}%`)
}
