import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { BrowserContext } from '@playwright/test'
import { createQaCleanupStore } from '../../../scripts/qa/cleanup.mjs'
import {
  executeOnboardingCleanup, expectedOnboardingCompanyName, ONBOARDING_FIXTURE_KIND, prepareOnboardingCleanup,
  validateOnboardingAccount,
} from '../../../scripts/qa/onboarding-cleanup.mjs'
import { requireQaDevelopment } from './development'

const HOUR_MS = 3_600_000
// Mirrors the product's default when DEV has no explicit signupCreditGrant.
const DEFAULT_SIGNUP_CREDIT_GRANT = 350

function checked<T>(operation: string, result: { data: T; error: unknown }): T {
  if (result.error) throw new Error(`QA onboarding fixture could not ${operation}`)
  return result.data
}

/** Starts immediately after owned identity verification, before a company exists. */
export function createQaOnboardingFixture(baseURL: string) {
  const connection = requireQaDevelopment(baseURL)
  const ciCampaign = process.env.GITHUB_RUN_ID
  const ciAttempt = process.env.GITHUB_RUN_ATTEMPT
  if ((ciCampaign === undefined) !== (ciAttempt === undefined)) throw new Error('QA onboarding requires a campaign and its attempt together')
  const campaign = ciCampaign ?? String(Date.now())
  const attempt = ciAttempt ?? '1'
  const db = createClient(connection.supabaseOrigin, connection.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }) },
  })
  const userId = randomUUID()
  const runId = randomUUID()
  const sessionId = randomUUID()
  const sessionToken = randomBytes(32).toString('base64url')
  const email = `qa-${runId}@example.invalid`
  const companyName = expectedOnboardingCompanyName(runId)
  const ownerName = 'QA First Company Owner'
  const account = {
    id: userId, email,
    raw_user_meta_data: { full_name: ownerName, language: 'en', qa_kind: ONBOARDING_FIXTURE_KIND,
      qa_run_id: runId, qa_campaign_id: campaign, qa_campaign_attempt: attempt, qa_expected_company_name: companyName },
  }
  validateOnboardingAccount(account, campaign, attempt)
  let seedWork: Promise<void> | undefined
  let cookieExpiry = 0
  let closing = false

  function seed() {
    if (closing) throw new Error('QA onboarding fixture is closing')
    return seedWork ??= (async () => {
      const now = Date.now()
      const timestamp = new Date(now).toISOString()
      checked('seed the owned identity', await db.from('xtimator_accounts').insert({ ...account, email_confirmed_at: timestamp }))
      checked('seed the owned session', await db.from('xtimator_sessions').insert({
        id: sessionId, user_id: userId, token_hash: createHash('sha256').update(sessionToken).digest('hex'),
        auth_time: timestamp, expires_at: new Date(now + 8 * 24 * HOUR_MS).toISOString(),
      }))
      cookieExpiry = Math.floor((now + 2 * HOUR_MS) / 1_000)
    })()
  }

  function cookies(): Parameters<BrowserContext['addCookies']>[0] {
    if (!cookieExpiry || closing) throw new Error('Seed the QA onboarding fixture before using its session')
    return [{ url: connection.localApp.origin + '/', name: 'xtimator_session', value: sessionToken,
      expires: cookieExpiry, httpOnly: true, sameSite: 'Lax', secure: connection.localApp.protocol === 'https:' }]
  }

  async function readState() {
    if (!cookieExpiry || closing) throw new Error('Seed the QA onboarding fixture before reading it')
    const [companies, memberships, drafts] = await Promise.all([
      db.from('companies').select('id, user_id, name, owner_name, email, phone, industry, city, tier, credit_balance, logo_url')
        .eq('user_id', userId).order('id'),
      db.from('company_members').select('company_id, user_id, role').eq('user_id', userId).order('company_id'),
      db.from('onboarding_drafts').select('id, mode, step, values, revision, completed_at, completed_company_id')
        .eq('user_id', userId).order('id'),
    ])
    return { companies: checked('read companies', companies) ?? [], memberships: checked('read memberships', memberships) ?? [],
      drafts: checked('read onboarding drafts', drafts) ?? [] }
  }

  async function expectedSignupCredits() {
    const result = checked('read the configured signup allowance', await db.from('platform_integrations').select('metadata')
      .eq('provider', 'billing_config').maybeSingle())
    const amount = result?.metadata?.signupCreditGrant ?? DEFAULT_SIGNUP_CREDIT_GRANT
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      throw new Error('QA onboarding requires a positive configured signup allowance')
    }
    return amount
  }

  async function readCredits(companyId: string) {
    const { companies } = await readState()
    if (companies.length !== 1 || companies[0].id !== companyId || companies[0].name !== companyName) {
      throw new Error('QA onboarding fixture refused to read credits outside its company')
    }
    const [ledger, lots] = await Promise.all([
      db.from('credit_ledger').select('id, idempotency_key, delta_credits, reason, lot_id').eq('company_id', companyId).order('id'),
      db.from('credit_lots').select('id, source, granted, remaining, expires_at').eq('company_id', companyId).order('id'),
    ])
    return { ledger: checked('read the signup ledger', ledger) ?? [], lots: checked('read the signup lots', lots) ?? [] }
  }

  async function cleanup() {
    if (!seedWork) return
    closing = true
    await seedWork.catch(() => undefined)
    const store = await createQaCleanupStore(connection)
    const row = await store.readAccount(userId)
    if (!row) return
    const marked = validateOnboardingAccount(row, campaign, attempt)
    if (marked.id !== userId || marked.runId !== runId) throw new Error('QA onboarding fixture marker changed')
    const plan = await prepareOnboardingCleanup(store, marked)
    if (plan.sessionIds.some((id: string) => id !== sessionId)) throw new Error('QA onboarding fixture refused an unrecognized session')
    await executeOnboardingCleanup(store, plan)
  }

  return { userId, email, ownerName, companyName, seed, cookies, readState, expectedSignupCredits, readCredits, cleanup }
}
