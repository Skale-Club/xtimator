// lib/change-orders/snapshot.ts
//
// Immutable snapshot of a change order, captured ONCE at signing time
// (app/api/change-orders/[id]/sign/route.ts) and stored in
// change_order_signatures.signed_content. Mirrors lib/estimate/signed-snapshot.ts:
// pure and dependency-free, `?? null` instead of `undefined` (it is stored as
// JSONB), items re-sorted by sort_order defensively, and a SHA-256 over the
// CANONICAL (sorted-key) serialization so a verifier can reproduce the digest
// from the stored jsonb regardless of how Postgres lays out the keys.
import { createHash } from 'node:crypto'
import { canonicalJsonStringify } from '@/lib/estimate/signed-snapshot'

export { canonicalJsonStringify }

/** Consent statement shown to the signer (recorded verbatim in the snapshot). */
export const CHANGE_ORDER_CONSENT_STATEMENT =
  'By signing, you approve this change order and agree that the contract total changes by its amount.'
export const CHANGE_ORDER_CONSENT_KEY = 'sign_change_order_consent_v1'

export interface ChangeOrderSnapshotItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
  taxable: boolean
  sort_order: number
}

export interface ChangeOrderSnapshot {
  version: 1
  change_order_id: string
  estimate_id: string
  number: number
  title: string
  reason: string | null
  extra_days: number | null
  tax_rate: number
  subtotal: number
  tax_amount: number
  total: number
  currency_code: string
  items: ChangeOrderSnapshotItem[]
  consent: { statement: string; key: string }
}

/** The fields of a change order the snapshot freezes (a ChangeOrder or a raw row satisfies it). */
export interface ChangeOrderSnapshotSource {
  id: string
  estimate_id: string
  number: number
  title: string
  reason?: string | null
  extra_days?: number | null
  tax_rate: number
  subtotal: number
  tax_amount: number
  total: number
  currency_code?: string | null
}

export interface ChangeOrderSnapshotSourceItem {
  id: string
  description: string
  quantity: number
  unit?: string | null
  unit_price: number
  total: number
  taxable?: boolean | null
  sort_order: number
}

export function buildChangeOrderSnapshot(
  changeOrder: ChangeOrderSnapshotSource,
  items: ChangeOrderSnapshotSourceItem[],
): ChangeOrderSnapshot {
  return {
    version: 1,
    change_order_id: changeOrder.id,
    estimate_id: changeOrder.estimate_id,
    number: changeOrder.number,
    title: changeOrder.title ?? '',
    reason: changeOrder.reason ?? null,
    extra_days: changeOrder.extra_days ?? null,
    tax_rate: Number(changeOrder.tax_rate) || 0,
    subtotal: Number(changeOrder.subtotal) || 0,
    tax_amount: Number(changeOrder.tax_amount) || 0,
    total: Number(changeOrder.total) || 0,
    currency_code: changeOrder.currency_code ?? 'USD',
    items: [...items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity) || 0,
        unit: item.unit ?? null,
        unit_price: Number(item.unit_price) || 0,
        total: Number(item.total) || 0,
        taxable: item.taxable ?? true,
        sort_order: item.sort_order,
      })),
    consent: { statement: CHANGE_ORDER_CONSENT_STATEMENT, key: CHANGE_ORDER_CONSENT_KEY },
  }
}

/** SHA-256 (hex) over the canonical serialization of the snapshot. */
export function hashChangeOrderSnapshot(snapshot: ChangeOrderSnapshot): string {
  return createHash('sha256').update(canonicalJsonStringify(snapshot)).digest('hex')
}
