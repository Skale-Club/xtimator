import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { BrowserContext } from '@playwright/test'
import { requireQaDevelopment } from './development'

const HOUR_MS = 60 * 60 * 1000
const OWNED_COOKIE = 'xtimator_session'
const COMPANY_COOKIE = 'active_company_id'
const CAPTURE_BUCKETS = {
  audio: /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.(webm|mp4|ogg)$/i,
  photos: /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.webp$/i,
}
const STORAGE_PAGE_SIZE = 100
type BrowserCookies = Parameters<BrowserContext['addCookies']>[0]
type TenantTable = 'clients' | 'projects' | 'estimates' | 'estimate_sections' | 'estimate_items'

function check(operation: string, error: { code?: string } | null) {
  if (!error) return
  const code = error.code && /^[A-Z0-9_]{1,24}$/i.test(error.code) ? ` (${error.code})` : ''
  throw new Error(`QA fixture could not ${operation}${code}`)
}

/** Per-run data only. Pair every call to seed() with cleanup() in a finally block. */
export function createQaFixture(baseURL: string, { captureStorage = false } = {}) {
  const { localApp, supabaseOrigin, serviceKey } = requireQaDevelopment(baseURL)
  const db = createClient(supabaseOrigin, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, options) => fetch(input, { ...options, redirect: 'error' }) },
  })

  const runId = randomUUID()
  const userId = randomUUID()
  const companyId = randomUUID()
  const clientId = randomUUID()
  const projectId = randomUUID()
  const estimateId = randomUUID()
  const sectionId = randomUUID()
  const itemId = randomUUID()
  const shareToken = randomUUID()
  const sessionId = randomUUID()
  const sessionToken = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(sessionToken).digest('hex')

  const prefix = `qa-${runId} `
  const email = `qa-${runId}@example.invalid`
  const companyName = `${prefix}Company`
  const clientName = `${prefix}Client`
  const projectName = `${prefix}Project`
  const summary = 'Replace and paint the porch railing.'
  const sectionTitle = 'Porch restoration'
  const lineDescription = 'Install painted cedar railing'
  const total = 1000
  let seedWork: Promise<void> | undefined
  let cleanupWork: Promise<void> | undefined
  let cookieExpiry = 0
  let closing = false

  async function insertRows(status: 'draft' | 'sent') {
    const now = Date.now()
    const timestamp = new Date(now).toISOString()
    // Owned identity migrates public auth.users foreign keys to xtimator_accounts.
    // Creating the account in that table mirrors current Google account creation.
    check('insert the owned account. Apply the owned identity migrations to the development database if its schema is stale', (
      await db.from('xtimator_accounts').insert({
        id: userId,
        email,
        email_confirmed_at: timestamp,
        raw_user_meta_data: { full_name: 'QA Owner', language: 'en', qa_run_id: runId },
      })
    ).error)
    check('insert the tenant. Check that its user foreign key references xtimator_accounts', (
      await db.from('companies').insert({
        id: companyId, user_id: userId, name: companyName, currency_code: 'USD',
        estimate_template_style: 'classic', digital_signature_allowed: true, digital_signature_enabled: true,
        online_payments_allowed: false, online_payments_enabled: false,
        email_delivery_enabled: false, sms_delivery_enabled: false,
        notify_on_view: false, notify_on_accept: false, notify_on_decline: false,
      })
    ).error)
    check('insert the tenant membership', (await db.from('company_members').insert({
      user_id: userId, company_id: companyId, role: 'owner',
    })).error)
    check('insert the client', (await db.from('clients').insert({
      id: clientId, company_id: companyId, name: clientName,
      address: '10 Test Avenue', city: 'Boston', state: 'MA', zip: '02108',
    })).error)
    check('insert the project', (await db.from('projects').insert({
      id: projectId, company_id: companyId, client_id: clientId, name: projectName,
      input_mode: 'text', status, total,
    })).error)
    check('insert the estimate', (await db.from('estimates').insert({
      id: estimateId, company_id: companyId, project_id: projectId, share_token: shareToken,
      language: 'en', currency_code: 'USD', status, summary, subtotal: total, total,
      sent_at: status === 'sent' ? timestamp : null,
    })).error)
    check('insert the estimate section', (await db.from('estimate_sections').insert({
      id: sectionId, estimate_id: estimateId, company_id: companyId, title: sectionTitle, subtotal: total,
    })).error)
    check('insert the estimate line', (await db.from('estimate_items').insert({
      id: itemId, section_id: sectionId, company_id: companyId, description: lineDescription,
      quantity: 2, unit: 'ea', unit_price: total / 2, total, taxable: false,
    })).error)
    check('insert the owned session', (await db.from('xtimator_sessions').insert({
      id: sessionId, user_id: userId, token_hash: tokenHash, auth_time: timestamp,
      // The owned proxy renews sessions below seven days. Stay above that during QA.
      expires_at: new Date(now + 8 * 24 * HOUR_MS).toISOString(),
    })).error)
    cookieExpiry = Math.floor((now + 2 * HOUR_MS) / 1000)
  }

  function seed({ status = 'sent' }: { status?: 'draft' | 'sent' } = {}) {
    if (closing) throw new Error('QA fixture is closing')
    seedWork ??= insertRows(status)
    return seedWork
  }

  function cookies(): BrowserCookies {
    if (!cookieExpiry || closing) throw new Error('Seed the QA fixture before using its cookies')
    const common = { url: localApp.origin + '/', expires: cookieExpiry, httpOnly: true, sameSite: 'Lax' as const }
    return [
      { ...common, name: OWNED_COOKIE, value: sessionToken, secure: localApp.protocol === 'https:' },
      { ...common, name: COMPANY_COOKIE, value: companyId, secure: false },
    ]
  }

  async function readOwn(table: TenantTable, id: string) {
    if (!cookieExpiry || closing) throw new Error('Seed the QA fixture before reading its rows')
    const row = await db.from(table).select('*').eq('company_id', companyId).eq('id', id).maybeSingle()
    check(`read the fixture ${table} row`, row.error)
    return row.data
  }

  async function readCompany() {
    if (!cookieExpiry || closing) throw new Error('Seed the QA fixture before reading its rows')
    const row = await db.from('companies').select('id, name, address, city, state, zip')
      .eq('id', companyId).eq('user_id', userId).maybeSingle()
    check('read the fixture company settings', row.error)
    return row.data
  }

  async function readPriceBook(kind: 'item' | 'category', match: { id: string } | { name: string }) {
    if (!cookieExpiry || closing) throw new Error('Seed the QA fixture before reading its rows')
    const query = kind === 'item'
      ? db.from('company_price_book').select('id, name, folder_id, unit_price')
      : db.from('price_book_folders').select('id, name')
    const row = await query.eq('company_id', companyId)
      .eq('id' in match ? 'id' : 'name', 'id' in match ? match.id : match.name).maybeSingle()
    check(`read the fixture price book ${kind}`, row.error)
    return row.data
  }

  async function reviseOwnEstimateLine(description: string) {
    if (!cookieExpiry || closing) throw new Error('Seed the QA fixture before revising its line item')
    const result = await db.from('estimate_items').update({ description })
      .eq('id', itemId).eq('section_id', sectionId).eq('company_id', companyId)
      .eq('description', lineDescription).select('id').single()
    check('apply a concurrent revision to the generated line item', result.error)
    if (result.data?.id !== itemId) throw new Error('QA fixture did not revise its generated estimate line')
  }

  async function readGenerationEvidence() {
    if (!cookieExpiry || closing) throw new Error('Seed the QA fixture before reading its generation evidence')
    const [estimates, events] = await Promise.all([
      db.from('estimates').select('id, version, is_current, summary, total').eq('company_id', companyId).eq('project_id', projectId),
      db.from('pipeline_events').select('attempt_id, input_type, step, status, error_message')
        .eq('company_id', companyId).eq('project_id', projectId),
    ])
    check('read the fixture estimate versions', estimates.error)
    check('read the fixture pipeline journal', events.error)
    return { estimates: estimates.data ?? [], events: events.data ?? [] }
  }

  async function readCapture() {
    if (!cookieExpiry || closing) throw new Error('Seed the QA fixture before reading its rows')
    const [recordings, photos] = await Promise.all([
      db.from('recordings').select('id, storage_path, duration_seconds, transcript').eq('company_id', companyId).eq('project_id', projectId),
      db.from('photos').select('id, storage_path, ai_description').eq('company_id', companyId).eq('project_id', projectId),
    ])
    check('read the fixture recordings', recordings.error)
    check('read the fixture photos', photos.error)
    return { recordings: recordings.data ?? [], photos: photos.data ?? [] }
  }

  async function eraseCaptureObjects() {
    // List before deleting so page offsets remain stable. The generated tenant
    // and project scope also catches uploads which never produced a database row.
    const directory = `${companyId}/${projectId}`
    for (const [bucket, expectedName] of Object.entries(CAPTURE_BUCKETS)) {
      const storage = db.storage.from(bucket)
      const paths: string[] = []
      for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
        const result = await storage.list(directory, {
          limit: STORAGE_PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' },
        })
        if (result.error || !result.data) throw new Error(`QA fixture could not list ${bucket} objects`)
        for (const item of result.data) {
          if (!item.id || !expectedName.test(item.name)) throw new Error(`QA fixture refused to remove an unrecognized ${bucket} object`)
          paths.push(`${directory}/${item.name}`)
        }
        if (result.data.length < STORAGE_PAGE_SIZE) break
      }
      for (let offset = 0; offset < paths.length; offset += STORAGE_PAGE_SIZE) {
        const result = await storage.remove(paths.slice(offset, offset + STORAGE_PAGE_SIZE))
        if (result.error) throw new Error(`QA fixture could not remove ${bucket} objects`)
      }
    }
  }

  async function eraseRows() {
    if (!seedWork) return
    await seedWork.catch(() => undefined)

    check('remove the owned session', (await db.from('xtimator_sessions').delete()
      .eq('id', sessionId).eq('user_id', userId).eq('token_hash', tokenHash)).error)

    const company = await db.from('companies').select('name, user_id').eq('id', companyId).maybeSingle()
    check('verify the isolated company', company.error)
    if (company.data) {
      if (company.data.user_id !== userId || !company.data.name.startsWith(prefix)) {
        throw new Error('QA fixture refused to erase an unmarked company')
      }
      if (captureStorage) await eraseCaptureObjects()
      check('erase the isolated company', (await db.rpc('erase_company_for_compliance', { p_company_id: companyId })).error)
    }

    // The account delete would cascade into companies. Refuse if another row owns
    // this account, even though every identity is generated for this fixture.
    const companies = await db.from('companies').select('id').eq('user_id', userId).limit(1)
    check('verify that the fixture owner owns no remaining companies', companies.error)
    if (companies.data?.length) throw new Error('QA fixture refused to erase an owner of another company')
    const account = await db.from('xtimator_accounts').select('email, raw_user_meta_data').eq('id', userId).maybeSingle()
    check('verify the isolated owned account', account.error)
    if (!account.data) return
    if (account.data.email !== email || account.data.raw_user_meta_data?.qa_run_id !== runId) {
      throw new Error('QA fixture refused to erase an unmarked owned account')
    }
    check('erase the isolated owned account', (await db.from('xtimator_accounts').delete()
      .eq('id', userId).eq('email', email).eq('raw_user_meta_data->>qa_run_id', runId)).error)
  }

  async function cleanup() {
    closing = true
    cleanupWork ??= eraseRows()
    try {
      await cleanupWork
    } finally {
      cleanupWork = undefined
    }
  }

  return {
    companyId, clientId, projectId, estimateId, userId, sectionId, itemId, shareToken,
    companyName, clientName, projectName, summary, sectionTitle, lineDescription, total,
    seed, cookies, readOwn, readCapture, readCompany, readPriceBook, reviseOwnEstimateLine,
    readGenerationEvidence, cleanup,
    readClient: (id = clientId) => readOwn('clients', id),
    readProject: (id = projectId) => readOwn('projects', id),
    readEstimate: (id: string = estimateId) => readOwn('estimates', id),
    readSignature: async () => {
      const row = await db.from('estimate_signatures').select('signer_name,signed_at,signed_content,snapshot_sha256')
        .eq('company_id', companyId).eq('estimate_id', estimateId).maybeSingle()
      check('read the fixture signature', row.error)
      return row.data
    },
  }
}
