/**
 * Playwright fixture for the public share links and their client payments
 * (XTM-D-20261121-feature-switches).
 *
 * Seeds one company + project + estimate per scenario directly with the
 * service-role key, so every scenario has its own switch values and invoice
 * rows. The change order scenarios add one change order (and its own invoice)
 * to the same shape. Nothing here talks to Stripe: invoice rows carry a
 * harmless placeholder hosted URL and the specs never click through to it.
 *
 * Cleanup: every row is reachable from a company whose name starts with
 * E2E_PREFIX (estimates also carry a share_token with that prefix), so teardown
 * removes the prefix and is safe after a crashed run.
 *
 * Required env vars (the suite skips cleanly when they are missing):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Required migrations on the target database (probed, the suite skips if absent):
 *   20261121140000_company_feature_switches.sql
 *   20261121150000_invoice_stripe_account.sql
 *   20261121160000_invoice_refunds.sql
 */
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const E2E_PREFIX = 'feature-switches-e2e-'

/** Harmless placeholder: never a real Stripe invoice, never navigated to. */
export const PLACEHOLDER_INVOICE_URL = 'https://invoice.stripe.com/i/test_placeholder'

export interface InvoiceSeed {
  /** Defaults to 'deposit' (estimate scenarios) or 'change_order' (change order scenarios). */
  kind?: 'deposit' | 'balance' | 'full'
  status: 'draft' | 'open' | 'paid' | 'void'
  amountCents: number
  refundedCents?: number
  /** Defaults to the placeholder URL for open invoices, null otherwise. */
  hostedUrl?: string | null
}

export interface ScenarioSeed {
  digitalSignatureAllowed: boolean
  digitalSignatureEnabled: boolean
  onlinePaymentsAllowed?: boolean
  onlinePaymentsEnabled?: boolean
  /** When true the invoices belong to a change order and the scenario is served on /change-order/<token>. */
  changeOrder?: boolean
  invoices: InvoiceSeed[]
}

const ONE_HUNDRED = 10000 // $100.00 in cents

/** Scenario definitions, keyed by the name the spec uses. */
export const SCENARIOS = {
  // Estimate link states.
  viewOnly: {
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    invoices: [],
  },
  platformOff: {
    digitalSignatureAllowed: false,
    digitalSignatureEnabled: true,
    invoices: [],
  },
  signOnly: {
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: true,
    invoices: [],
  },
  payOnly: {
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: true,
    onlinePaymentsEnabled: true,
    invoices: [{ status: 'open', amountCents: ONE_HUNDRED }],
  },
  signAndPay: {
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: true,
    onlinePaymentsAllowed: true,
    onlinePaymentsEnabled: true,
    invoices: [{ status: 'open', amountCents: ONE_HUNDRED }],
  },
  paid: {
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: true,
    onlinePaymentsEnabled: true,
    invoices: [{ status: 'paid', amountCents: ONE_HUNDRED }],
  },
  refundedFull: {
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: true,
    onlinePaymentsEnabled: true,
    invoices: [{ status: 'paid', amountCents: ONE_HUNDRED, refundedCents: ONE_HUNDRED }],
  },
  refundedPartial: {
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: true,
    onlinePaymentsEnabled: true,
    invoices: [{ status: 'paid', amountCents: ONE_HUNDRED, refundedCents: 4000 }],
  },
  // Payments switched off AFTER the invoice was issued: it must stay payable.
  paymentsOffIssued: {
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: false,
    onlinePaymentsEnabled: true,
    invoices: [{ status: 'open', amountCents: ONE_HUNDRED }],
  },
  hiddenOnly: {
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: true,
    onlinePaymentsEnabled: true,
    invoices: [
      { status: 'draft', amountCents: 11111, hostedUrl: PLACEHOLDER_INVOICE_URL },
      { status: 'void', amountCents: 22222, hostedUrl: PLACEHOLDER_INVOICE_URL },
    ],
  },
  hiddenMixed: {
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: true,
    onlinePaymentsEnabled: true,
    invoices: [
      { status: 'open', amountCents: ONE_HUNDRED },
      { status: 'draft', amountCents: 11111, hostedUrl: PLACEHOLDER_INVOICE_URL },
      { status: 'void', amountCents: 22222, hostedUrl: PLACEHOLDER_INVOICE_URL },
    ],
  },
  // Change order link states (one change order with at most one live invoice each).
  coOpen: {
    changeOrder: true,
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: true,
    onlinePaymentsEnabled: true,
    invoices: [{ status: 'open', amountCents: ONE_HUNDRED }],
  },
  coPaid: {
    changeOrder: true,
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: true,
    onlinePaymentsEnabled: true,
    invoices: [{ status: 'paid', amountCents: ONE_HUNDRED }],
  },
  coRefundedFull: {
    changeOrder: true,
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: true,
    onlinePaymentsEnabled: true,
    invoices: [{ status: 'paid', amountCents: ONE_HUNDRED, refundedCents: ONE_HUNDRED }],
  },
  coRefundedPartial: {
    changeOrder: true,
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: true,
    onlinePaymentsEnabled: true,
    invoices: [{ status: 'paid', amountCents: ONE_HUNDRED, refundedCents: 4000 }],
  },
  coPaymentsOffIssued: {
    changeOrder: true,
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: false,
    onlinePaymentsAllowed: false,
    onlinePaymentsEnabled: true,
    invoices: [{ status: 'open', amountCents: ONE_HUNDRED }],
  },
  coSignOnly: {
    changeOrder: true,
    digitalSignatureAllowed: true,
    digitalSignatureEnabled: true,
    invoices: [],
  },
} as const satisfies Record<string, ScenarioSeed>

export type ScenarioKey = keyof typeof SCENARIOS

/** Public path to visit for each seeded scenario. */
export type SeededPaths = Record<ScenarioKey, string>

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

/**
 * Checks that the columns this feature needs exist on the target database
 * (zero-row selects, nothing is read or written). Never throws: a failure
 * means the suite should skip, with the message to show.
 */
export async function probeFeatureSwitchColumns(): Promise<{ ok: true } | { ok: false; message: string }> {
  const svc = getServiceClient()
  if (!svc) return { ok: false, message: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }
  const hint =
    'Migrations 20261121140000 / 20261121150000 / 20261121160000 are not applied on this database (or it is unreachable)'
  try {
    const companies = await svc
      .from('companies')
      .select('digital_signature_allowed, digital_signature_enabled, online_payments_allowed, online_payments_enabled')
      .limit(0)
    if (companies.error) return { ok: false, message: `${hint}: ${companies.error.message}` }
    const invoices = await svc
      .from('invoices')
      .select('stripe_account_id, refunded_cents, refunded_at, change_order_id')
      .limit(0)
    if (invoices.error) return { ok: false, message: `${hint}: ${invoices.error.message}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, message: `${hint}: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function seedConnectEstimates(): Promise<SeededPaths> {
  const svc = getServiceClient()
  if (!svc) {
    throw new Error('seedConnectEstimates: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  // Remove leftovers from a prior failed run before seeding.
  await cleanupConnectEstimates()

  const stamp = Date.now()
  const keys = Object.keys(SCENARIOS) as ScenarioKey[]
  const paths = {} as SeededPaths

  for (const key of keys) {
    const scenario: ScenarioSeed = SCENARIOS[key]
    const shareToken = `${E2E_PREFIX}${key}-${stamp}`

    const { data: company, error: companyErr } = await svc
      .from('companies')
      .insert({
        name: `${E2E_PREFIX}${key}-co`,
        digital_signature_allowed: scenario.digitalSignatureAllowed,
        digital_signature_enabled: scenario.digitalSignatureEnabled,
        online_payments_allowed: scenario.onlinePaymentsAllowed ?? false,
        online_payments_enabled: scenario.onlinePaymentsEnabled ?? false,
      })
      .select('id')
      .single()
    if (companyErr || !company) throw new Error(`seed ${key}: company insert failed: ${companyErr?.message}`)

    const { data: project, error: projectErr } = await svc
      .from('projects')
      .insert({ company_id: company.id, name: `${E2E_PREFIX}${key}-project`, status: 'sent', total: 250 })
      .select('id')
      .single()
    if (projectErr || !project) throw new Error(`seed ${key}: project insert failed: ${projectErr?.message}`)

    const { data: estimate, error: estimateErr } = await svc
      .from('estimates')
      .insert({
        company_id: company.id,
        project_id: project.id,
        share_token: shareToken,
        status: 'sent',
        is_current: true,
        total: 250,
      })
      .select('id')
      .single()
    if (estimateErr || !estimate) throw new Error(`seed ${key}: estimate insert failed: ${estimateErr?.message}`)

    let changeOrderId: string | null = null
    let changeOrderToken: string | null = null
    if (scenario.changeOrder) {
      changeOrderToken = randomUUID()
      const { data: co, error: coErr } = await svc
        .from('change_orders')
        .insert({
          company_id: company.id,
          project_id: project.id,
          estimate_id: estimate.id,
          number: 1,
          title: `${E2E_PREFIX}change`,
          status: 'sent',
          share_token: changeOrderToken,
          subtotal: 100,
          total: 100,
        })
        .select('id')
        .single()
      if (coErr || !co) throw new Error(`seed ${key}: change order insert failed: ${coErr?.message}`)
      changeOrderId = co.id as string
    }

    if (scenario.invoices.length > 0) {
      const rows = scenario.invoices.map((inv) => ({
        estimate_id: estimate.id,
        company_id: company.id,
        kind: scenario.changeOrder ? 'change_order' : (inv.kind ?? 'deposit'),
        change_order_id: scenario.changeOrder ? changeOrderId : null,
        amount_cents: inv.amountCents,
        currency_code: 'USD',
        status: inv.status,
        hosted_invoice_url:
          inv.hostedUrl !== undefined ? inv.hostedUrl : inv.status === 'open' ? PLACEHOLDER_INVOICE_URL : null,
        refunded_cents: inv.refundedCents ?? 0,
        paid_at: inv.status === 'paid' ? new Date().toISOString() : null,
      }))
      const { error: invoiceErr } = await svc.from('invoices').insert(rows)
      if (invoiceErr) throw new Error(`seed ${key}: invoice insert failed: ${invoiceErr.message}`)
    }

    paths[key] = scenario.changeOrder ? `/change-order/${changeOrderToken}` : `/estimate/${shareToken}`
  }

  return paths
}

export async function cleanupConnectEstimates(): Promise<void> {
  const svc = getServiceClient()
  if (!svc) return

  const { data: companies } = await svc.from('companies').select('id').like('name', `${E2E_PREFIX}%`)
  const companyIds = (companies ?? []).map((c) => c.id as string)

  // Children first (FK dependencies): invoices, change orders, estimates, projects, companies.
  if (companyIds.length > 0) {
    await svc.from('invoices').delete().in('company_id', companyIds)
    await svc.from('change_orders').delete().in('company_id', companyIds)
  }
  await svc.from('estimates').delete().like('share_token', `${E2E_PREFIX}%`)
  await svc.from('projects').delete().like('name', `${E2E_PREFIX}%`)
  await svc.from('companies').delete().like('name', `${E2E_PREFIX}%`)
}
