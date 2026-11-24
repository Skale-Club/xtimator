import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const COMPANY_PREFIX = 'Signature Launch Smoke '
const DEMO_COMPANY_FALLBACK = '0000de00-0000-0000-0000-000000000001'

export function hasSignatureTestCredentials() {
  return process.env.SIGNATURE_E2E_DEV === '1' &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function developmentClient() {
  if (!hasSignatureTestCredentials()) throw new Error('Signature development fixture is disabled')

  const databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL
  let api: URL
  let database: URL | null
  try {
    api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
    database = databaseUrl ? new URL(databaseUrl) : null
  } catch {
    throw new Error('Invalid Supabase development connection URL')
  }
  const project = api.hostname.split('.')[0]
  const matchesPool = database?.hostname.endsWith('.supabase.com') &&
    decodeURIComponent(database.username).endsWith(`.${project}`)
  const matchesDirect = database?.hostname === `db.${project}.supabase.co`
  const matchesExplicit = api.hostname === process.env.SIGNATURE_E2E_SUPABASE_HOST

  if (api.protocol !== 'https:' || !api.hostname.endsWith('.supabase.co') ||
      !(matchesPool || matchesDirect || matchesExplicit)) {
    throw new Error('Signature fixture requires the explicitly identified Supabase development project')
  }

  return createClient(api.origin, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function verifyWrite(operation: string, error: { code?: string } | null) {
  if (error) throw new Error(`${operation} failed (${error.code ?? 'unknown code'})`)
}

export function createSignatureFixture() {
  const db = developmentClient()
  const companyId = randomUUID()
  const clientId = randomUUID()
  const projectId = randomUUID()
  const estimateId = randomUUID()
  const token = randomUUID()
  const companyName = `${COMPANY_PREFIX}${companyId.slice(0, 8)}`
  const editedCompanyName = `${companyName} Renamed`
  const clientName = 'Signature Smoke Client'
  const editedClientName = 'Renamed Signature Client'
  const projectName = 'Signature Smoke Project'
  const editedProjectName = 'Renamed Signature Project'
  const scope = 'Replace the porch rail with painted cedar'
  const demoCompany = process.env.DEMO_COMPANY_ID ?? DEMO_COMPANY_FALLBACK

  async function seedEstimate() {
    const mapping = await db.from('demo_config').select('user_id').eq('company_id', demoCompany).maybeSingle()
    const owner = mapping.data?.user_id ?? (await db.from('companies').select('user_id').eq('id', demoCompany).maybeSingle()).data?.user_id
    if (!owner) throw new Error('The Supabase development project needs a seeded demo owner')

    const company = await db.from('companies').insert({
      id: companyId, user_id: owner, name: companyName, email: null, currency_code: 'USD',
      estimate_template_style: 'classic', digital_signature_allowed: true, digital_signature_enabled: true,
      notify_on_view: false, notify_on_accept: false, notify_on_decline: false,
    })
    verifyWrite('Insert isolated signature company', company.error)
    const client = await db.from('clients').insert({
      id: clientId, company_id: companyId, name: clientName, email: 'signature-smoke@example.invalid',
      address: '10 Test Avenue', city: 'Boston', state: 'MA', zip: '02108',
    })
    verifyWrite('Insert signature client', client.error)
    const project = await db.from('projects').insert({
      id: projectId, company_id: companyId, client_id: clientId, name: projectName,
      input_mode: 'text', status: 'sent', total: 1000,
    })
    verifyWrite('Insert signature project', project.error)
    const estimate = await db.from('estimates').insert({
      id: estimateId, company_id: companyId, project_id: projectId, share_token: token,
      language: 'en', currency_code: 'USD', status: 'sent', summary: scope,
      subtotal: 1000, total: 1000, sent_at: new Date().toISOString(),
    })
    verifyWrite('Insert signature estimate', estimate.error)
  }

  async function editParties() {
    const company = await db.from('companies').update({ name: editedCompanyName }).eq('id', companyId).eq('name', companyName)
    verifyWrite('Rename signature company', company.error)
    const client = await db.from('clients').update({ name: editedClientName }).eq('id', clientId).eq('company_id', companyId)
    verifyWrite('Rename signature client', client.error)
    const project = await db.from('projects').update({ name: editedProjectName }).eq('id', projectId).eq('company_id', companyId)
    verifyWrite('Rename signature project', project.error)
  }

  async function seedOrder(number: number, total: number) {
    const id = randomUUID()
    const orderToken = randomUUID()
    const title = `Signature Smoke Change ${number}`
    const order = await db.from('change_orders').insert({
      id, company_id: companyId, project_id: projectId, estimate_id: estimateId,
      number, title, status: 'sent', share_token: orderToken, sent_at: new Date().toISOString(),
      subtotal: total, total, currency_code: 'USD',
    })
    verifyWrite('Insert signature change order', order.error)
    const item = await db.from('change_order_items').insert({
      company_id: companyId, change_order_id: id, description: title,
      quantity: 1, unit_price: total, total, taxable: false,
    })
    verifyWrite('Insert signature change-order line', item.error)
    return { id, token: orderToken, path: `/change-order/${orderToken}` }
  }

  async function signature(kind: 'estimate' | 'change_order', id: string) {
    const table = kind === 'estimate' ? 'estimate_signatures' : 'change_order_signatures'
    const foreignKey = kind === 'estimate' ? 'estimate_id' : 'change_order_id'
    const result = await db.from(table).select('signer_name, signed_at, signature_data, signed_content')
      .eq('company_id', companyId).eq(foreignKey, id).single()
    verifyWrite('Read committed signature evidence', result.error)
    if (!result.data) throw new Error('Committed signature evidence is missing')
    return result.data
  }

  async function cleanup() {
    // ID is generated by this invocation. A failed insert may leave no row.
    const company = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
    verifyWrite('Read isolated signature company for cleanup', company.error)
    if (!company.data) return
    if (company.data.name !== companyName && company.data.name !== editedCompanyName) {
      throw new Error('Refusing to erase a company outside the signature fixture')
    }
    const result = await db.rpc('erase_company_for_compliance', { p_company_id: companyId })
    verifyWrite('Erase isolated signature fixture', result.error)
  }

  return {
    estimateId, token, companyName, editedCompanyName, clientName, editedClientName,
    projectName, editedProjectName, scope, seedEstimate, editParties, seedOrder, signature, cleanup,
  }
}
