/**
 * lib/services/persist-estimate-version.ts
 *
 * The ONE write path for a new estimate version, shared by generation
 * (generateEstimateForProject) and the Phase 4d patch-refine hook (persistPatchedEstimate):
 *
 *   1. insert the estimate row as NON-current (retrying without ai_meta when that column is
 *      missing, i.e. the migration is not applied yet);
 *   2. insert sections and items in two round-trips (items carry the per-line AI fields, retried
 *      without them in the pre-migration window); any failure deletes the new row (children
 *      cascade) and rethrows, so the previous version is untouched;
 *   3. atomically activate the staged version, carry photos forward and update
 *      project state. The database checks the previous current version under lock.
 *      A missing RPC fails closed; deploy the migration before this caller.
 *
 * Throws 'Failed to save estimate' / 'Failed to save estimate section' / 'Failed to save estimate
 * items' exactly as generation always did.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { computeEstimateTotals } from '@/lib/estimate/compute-totals'
import { isMissingColumnError, type AiMeta } from '@/lib/estimate/ai-meta'

/** estimate_items columns added by SEED-057 (see the estimator-intelligence migration). */
const ITEM_AI_COLUMNS = ['confidence', 'basis', 'optional'] as const

export type CalculatedSections = ReturnType<typeof computeEstimateTotals>['sections']

export interface PersistEstimateVersionArgs {
  companyId: string
  projectId: string
  /** The full estimate row to insert. `is_current` is forced false here; promotion is the swap's job. */
  estimateRow: Record<string, unknown>
  /** Written in the same insert when non-null. */
  aiMeta: AiMeta | null
  /** Output of computeEstimateTotals: sections already carry line and section totals. */
  calculatedSections: CalculatedSections
  /** The version being replaced; its photos are copied onto the new one. Null when there is none. */
  previousCurrentId: string | null
  /** Project fields committed in the SAME transaction as version activation. */
  projectUpdate?: {
    status?: string
    total?: number
    name?: string
    expected_name?: string
    project_type?: string | null
    client_id?: string
    detected_client_name?: string
  }
  /** Manual blank creation returns the existing version if another writer won. */
  keepExisting?: boolean
  /** Version numbers are allocated under the database lock, never by a stale read. */
  onCommitted?: (version: number) => void
  onActivated?: (result: { estimateId: string; clientId: string | null }) => void
  /** Called right after the estimate row exists (before children), e.g. to tag observability with the id. */
  onInserted?: (estimateId: string) => void
}

export async function persistEstimateVersion(
  supabase: SupabaseClient,
  args: PersistEstimateVersionArgs
): Promise<string> {
  const { companyId, projectId, calculatedSections, aiMeta } = args
  const estimateRow = {
    ...args.estimateRow, company_id: companyId, project_id: projectId,
    is_current: false, generation_staged: true,
  }

  let { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .insert(aiMeta ? { ...estimateRow, ai_meta: aiMeta } : estimateRow)
    .select('id')
    .single()

  if (estimateError && aiMeta && isMissingColumnError(estimateError, ['ai_meta'])) {
    ;({ data: estimate, error: estimateError } = await supabase
      .from('estimates')
      .insert(estimateRow)
      .select('id')
      .single())
  }

  if (estimateError || !estimate) {
    throw new Error('Failed to save estimate')
  }

  const estimateId = estimate.id as string
  args.onInserted?.(estimateId)

  // Only discard our non-current staging row. A lost RPC response may arrive
  // AFTER activation committed, so cleanup must never delete a current version.
  const cleanup = async () => {
    try {
      const { error } = await supabase.from('estimates').delete()
        .eq('id', estimateId).eq('company_id', companyId)
        .eq('project_id', projectId).eq('is_current', false).eq('generation_staged', true)
      if (error) console.error('[persist-estimate-version] staging cleanup failed:', error)
    } catch (err) {
      console.error('[persist-estimate-version] staging cleanup failed:', err)
    }
  }

  try {
    // Insert sections and items in exactly two round-trips (was 2×S sequential).
    // 1) Bulk-insert every section, RETURNING ids in insertion order.
    // 2) Bulk-insert every item across all sections in one call, mapping each item
    //    to its section id by position. sort_order fields are preserved exactly:
    //    sIdx for sections, iIdx for items within a section.
    const sectionInsertRows = calculatedSections.map((section, sIdx) => ({
      estimate_id: estimateId,
      company_id: companyId,
      title: section.title,
      sort_order: sIdx,
      subtotal: section.subtotal,
    }))

    let sectionIds: string[] = []
    if (sectionInsertRows.length > 0) {
      const { data: sectionRows, error: sectionsError } = await supabase
        .from('estimate_sections')
        .insert(sectionInsertRows)
        .select('id')

      // PostgREST returns the inserted rows in the SAME order as the payload for a
      // single INSERT, so index i ↔ calculatedSections[i]. Guard the length so a
      // partial/reordered result can never silently misattach items.
      if (sectionsError || !sectionRows || sectionRows.length !== sectionInsertRows.length) {
        throw new Error('Failed to save estimate section')
      }
      sectionIds = sectionRows.map((row) => row.id as string)
    }

    const itemInsertRows = calculatedSections.flatMap((section, sIdx) => {
      const sectionId = sectionIds[sIdx]
      return section.items.map((item, iIdx) => ({
        section_id: sectionId,
        company_id: companyId,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit ?? null,
        unit_price: item.unit_price,
        total: item.total,
        sort_order: iIdx,
        price_source: item.price_source,
        // TAX-03: persist the AI's per-item classification into the dormant Phase 129 columns.
        // These survive AI → anchoring → research → compute via the `...item` spreads. Defaults
        // (taxable=true, tax_category=null) keep retrocompat rows byte-identical.
        taxable: item.taxable ?? true,
        tax_category: item.tax_category ?? null,
        // DISC-01: persist the per-item line discount (AI INPUT, amount) — survives AI → anchoring →
        // research → compute via the ...item spreads. Default 0 keeps retrocompat rows byte-identical.
        discount: (item.discount as number | undefined) ?? 0,
        // MARK-01: persist the AI's cost + markup_pct (inputs) so the price book / editor can show how
        // the unit_price was derived. Survive AI → anchoring → research → compute via the ...item spreads.
        // null when absent (byte-identical retrocompat — the Phase-129 columns are nullable). The
        // persisted unit_price above already carries the server-resolved price from compute-totals (Task 2).
        cost: (item.cost as number | undefined) ?? null,
        markup_pct: (item.markup_pct as number | undefined) ?? null,
        // SEED-057: per-line AI metadata. Only present on the row when the model
        // supplied it, so rows (and tests) for legacy outputs are unchanged.
        // Every row carries the SAME keys: PostgREST unions the keys across a bulk insert and
        // sends NULL for a row that lacks one, and `optional` is NOT NULL DEFAULT false.
        confidence: item.confidence ?? null,
        basis: item.basis ?? null,
        optional: item.optional === true,
      }))
    })

    if (itemInsertRows.length > 0) {
      let { error: itemsError } = await supabase
        .from('estimate_items')
        .insert(itemInsertRows)

      // Pre-migration deploy window: drop the SEED-057 columns and retry.
      if (itemsError && isMissingColumnError(itemsError, ITEM_AI_COLUMNS)) {
        const stripped = itemInsertRows.map((row) => {
          const copy: Record<string, unknown> = { ...row }
          for (const column of ITEM_AI_COLUMNS) delete copy[column]
          return copy
        })
        ;({ error: itemsError } = await supabase.from('estimate_items').insert(stripped))
      }

      if (itemsError) {
        throw new Error('Failed to save estimate items')
      }
    }
  } catch (err) {
    await cleanup()
    throw err
  }

  const confirmCommit = async (): Promise<number | null> => {
    try {
      const { data: saved, error } = await supabase.from('estimates')
        .select('id, version, is_current, generation_staged')
        .eq('id', estimateId).eq('company_id', companyId).eq('project_id', projectId)
        .maybeSingle()
      return !error && saved?.id === estimateId && saved.is_current === true &&
        saved.generation_staged === false && typeof saved.version === 'number'
        ? saved.version : null
    } catch { return null }
  }

  try {
    const { data, error } = await supabase.rpc('activate_estimate_version', {
      p_company_id: companyId,
      p_project_id: projectId,
      p_estimate_id: estimateId,
      p_previous_estimate_id: args.previousCurrentId,
      p_project_update: args.projectUpdate ?? {},
      p_discard_estimate_id: null,
      p_restore: false,
      p_keep_existing: args.keepExisting ?? false,
    })
    const committed = data as { estimate_id?: string; version?: number; client_id?: string | null } | null
    if (error || !committed?.estimate_id || typeof committed.version !== 'number') {
      throw new Error('Failed to activate estimate version', { cause: error })
    }
    if (committed.estimate_id !== estimateId) await cleanup()
    args.onCommitted?.(committed.version)
    args.onActivated?.({ estimateId: committed.estimate_id, clientId: committed.client_id ?? null })
    return committed.estimate_id
  } catch (err) {
    // A response can be lost after commit. Cleanup may itself wait for an
    // in-flight transaction, so confirm both before and after conditional cleanup.
    let committedVersion = await confirmCommit()
    if (committedVersion === null) {
      await cleanup()
      committedVersion = await confirmCommit()
    }
    if (committedVersion !== null) {
      args.onCommitted?.(committedVersion)
      return estimateId
    }
    throw err
  }
}
