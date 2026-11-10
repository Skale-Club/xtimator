/**
 * Phase 2b - hourly debit of messaging costs (WhatsApp / SMS / email) in credits.
 *
 * Every message sent on a customer's behalf is recorded in `messaging_cost_events`
 * (see lib/billing/messaging-events.ts). This job turns the billable, priced,
 * not-yet-debited rows of each company into ONE credit debit per company per run
 * (operation 'messaging', shown to the customer as a single "Messages" line), via
 * recordMessagingDebit (lib/billing/credit-ledger.ts): credits =
 * round(sum(cost_usd) x markup / creditUnitUsd), rounded ONCE over the whole batch
 * so many sub-credit messages are never lost to per-message rounding.
 *
 * Which rows are debitable:
 *   - billable = true (welcome sequence, unknown-sender replies, OTP and ops alerts
 *     are platform costs: never debited);
 *   - cost_usd > 0 (NULL = not priced yet; 0 = free or failed);
 *   - WhatsApp only once Meta reported 'delivered' (Meta bills per delivered
 *     message), SMS/email as soon as they were recorded. A WhatsApp row still 'sent'
 *     after 48h is simply left alone: it is never priced, so never billed.
 *
 * Claim protocol (safe against two concurrent runs and against a crash):
 *   1. CLAIM: a conditional UPDATE sets debit_batch_id on the company's unclaimed
 *      rows and returns exactly the rows it claimed (the WHERE re-checks under the
 *      row lock, so a concurrent run claims a disjoint set).
 *   2. DEBIT once, with ledger idempotency key derived from
 *      `messaging:<companyId>:<batchId>` (a retry of the same batch is a no-op).
 *   3. SETTLE: set debited_at on the batch. If the debit rounds to 0 credits the
 *      claim is RELEASED so the cost keeps accumulating toward the next run. If the
 *      ledger write fails the claim is KEPT, and the next run's recovery pass
 *      retries the SAME batch id (idempotent), so nothing is double-charged or lost.
 *
 * BYOK: recordCreditDebit skips companies on their own OpenRouter key because that
 * only covers the AI bill. Messaging is not AI, so recordMessagingDebit ignores the
 * BYOK flag: a BYOK company still pays for the messages we send for it.
 */
import { randomUUID } from 'node:crypto'
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { recordMessagingDebit } from '@/lib/billing/credit-ledger'

export interface DebitMessagingCostsResult {
  /** Companies whose batch was debited (or confirmed already debited) this run. */
  debited: number
  /** Batches released because the total rounded to 0 credits (cost keeps accumulating). */
  carriedOver: number
  /** Batches whose ledger write failed; kept and retried next run. */
  failed: number
  /** Rows marked debited_at this run. */
  rowsSettled: number
}

type ServiceClient = ReturnType<typeof requireServiceClient>

type CostRow = { id: string; company_id?: string; debit_batch_id?: string; cost_usd: number | string | null }

const COMPANY_PAGE = 1000

function sumUsd(rows: CostRow[]): number {
  let total = 0
  for (const r of rows) {
    const n = Number(r.cost_usd)
    if (Number.isFinite(n) && n > 0) total += n
  }
  return total
}

/** Debit one claimed batch and settle its rows. */
async function settleBatch(
  svc: ServiceClient,
  companyId: string,
  batchId: string,
  rows: CostRow[],
  result: DebitMessagingCostsResult
): Promise<void> {
  const outcome = await recordMessagingDebit({
    companyId,
    realCostUsd: sumUsd(rows),
    batchId,
  })

  if (outcome === 'failed') {
    result.failed += 1 // keep the claim; the recovery pass retries this same batch id
    return
  }

  if (outcome === 'below_minimum') {
    // Rounds to 0 credits: release so the cost accumulates into a later batch.
    await svc
      .from('messaging_cost_events')
      .update({ debit_batch_id: null })
      .eq('debit_batch_id', batchId)
      .is('debited_at', null)
    result.carriedOver += 1
    return
  }

  // 'debited' | 'already_applied' | 'not_metered' (absorbed by config) | 'no_cost' | 'byok'
  await svc
    .from('messaging_cost_events')
    .update({ debited_at: new Date().toISOString() })
    .eq('debit_batch_id', batchId)
    .is('debited_at', null)
  result.debited += 1
  result.rowsSettled += rows.length
}

export async function runDebitMessagingCosts(): Promise<DebitMessagingCostsResult> {
  const svc = requireServiceClient()
  const result: DebitMessagingCostsResult = { debited: 0, carriedOver: 0, failed: 0, rowsSettled: 0 }

  // 1. Recovery: batches claimed by an earlier run that never got settled.
  const { data: stale } = await svc
    .from('messaging_cost_events')
    .select('id, company_id, debit_batch_id, cost_usd')
    .not('debit_batch_id', 'is', null)
    .is('debited_at', null)
    .limit(COMPANY_PAGE * 5)
  const byBatch = new Map<string, { companyId: string; rows: CostRow[] }>()
  for (const r of (stale ?? []) as CostRow[]) {
    if (!r.debit_batch_id || !r.company_id) continue
    const entry = byBatch.get(r.debit_batch_id) ?? { companyId: r.company_id, rows: [] }
    entry.rows.push(r)
    byBatch.set(r.debit_batch_id, entry)
  }
  for (const [batchId, { companyId, rows }] of byBatch) {
    await settleBatch(svc, companyId, batchId, rows, result)
  }

  // 2. Companies with debitable rows.
  const { data: candidates } = await svc
    .from('messaging_cost_events')
    .select('company_id')
    .eq('billable', true)
    .is('debited_at', null)
    .is('debit_batch_id', null)
    .gt('cost_usd', 0)
    .or('channel.neq.whatsapp,status.eq.delivered')
    .not('company_id', 'is', null)
    .limit(COMPANY_PAGE * 5)
  const companyIds = [
    ...new Set(((candidates ?? []) as Array<{ company_id: string | null }>).map((r) => r.company_id).filter((c): c is string => !!c)),
  ]

  for (const companyId of companyIds) {
    const batchId = randomUUID()
    // 3. Claim (conditional UPDATE returning exactly what it claimed).
    const { data: claimed, error } = await svc
      .from('messaging_cost_events')
      .update({ debit_batch_id: batchId })
      .eq('company_id', companyId)
      .eq('billable', true)
      .is('debited_at', null)
      .is('debit_batch_id', null)
      .gt('cost_usd', 0)
      .or('channel.neq.whatsapp,status.eq.delivered')
      .select('id, cost_usd')
    if (error) {
      console.warn('[debit-messaging-costs] claim failed:', companyId, error.message)
      continue
    }
    const rows = (claimed ?? []) as CostRow[]
    if (rows.length === 0) continue // a concurrent run took them
    await settleBatch(svc, companyId, batchId, rows, result)
  }

  return result
}

export const debitMessagingCostsJob = inngest.createFunction(
  {
    id: 'debit-messaging-costs',
    // Hourly, offset from the credit-lot expiry sweep (minute 0).
    triggers: [{ cron: '10 * * * *' }],
    retries: 3,
  },
  async ({ step }) => {
    return step.run('debit-messaging-costs', async () => runDebitMessagingCosts())
  },
)
