// lib/estimate/signed-snapshot.ts
// TRUST-01 (Phase 164 Plan 01): close audit finding A1/A2 -- "a signed
// estimate remains fully editable, and a post-sign edit silently changes what
// every client-facing surface renders" -- by capturing an IMMUTABLE snapshot
// of everything the signed document rendered, at the moment of signing, and
// replaying it forever after on every client-facing surface.
//
// Two pure functions live here, both dependency-free (no DB calls):
//   - buildSignedContentSnapshot: serializes a live estimate + sections into
//     the frozen SignedContentSnapshot shape, called ONCE at sign time
//     (app/api/estimates/[id]/sign/route.ts).
//   - applySignedSnapshot: the ONE shared overlay used by BOTH share lookups
//     (lib/queries/share.ts) AND the PDF route (app/api/estimates/[id]/pdf/route.ts)
//     to REPLACE (never merge) the live payload's rendered fields with the
//     signed snapshot once a signature with a non-null snapshot exists.
//
// Field set mirrors EXACTLY what the client-facing renderers show today
// (share query lib/queries/share.ts:117-138, estimate-document-modern.tsx,
// estimate-view.tsx, deriveDepositDisplay) -- every rendered + user-editable
// field must be captured/overlaid or post-sign drift survives via the
// omission. Company branding, share metadata, photo URLs, and signature
// display fields are intentionally NOT part of this set -- they stay live
// (see applySignedSnapshot's doc comment for the known photo-URL limitation).

/** Schema version 1 fields — see module doc comment for provenance of each. */
export interface SignedContentSnapshotItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
  sort_order: number
  taxable: boolean | null
  tax_category: string | null
  discount: number | null
}

export interface SignedContentSnapshotSection {
  id: string
  title: string
  sort_order: number
  /** MUST freeze — GUARD-03: never recompute, always the persisted value at sign time. */
  subtotal: number
  items: SignedContentSnapshotItem[]
}

export interface SignedContentSnapshot {
  /** Snapshot schema version, for future evolution. */
  version: 1
  summary: string | null
  notes: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  /** Rendered in the signed header — user-editable, MUST freeze. */
  estimate_date: string | null
  /** Rendered in the signed header — user-editable, MUST freeze. */
  estimate_number: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  /** Drives the "(X%)" label — MUST freeze. */
  discount_type: string | null
  discount_value: number | null
  discount_amount: number | null
  /** Drives deriveDepositDisplay — MUST freeze. */
  deposit_type: string | null
  deposit_value: number | null
  balance_due: number | null
  total: number
  /** Defaults to 'USD' at serialize time — mirrors estimate-view.tsx's `?? 'USD'`. */
  currency_code: string
  /** As-of-signing presentation settings (v4.18). */
  presentation_settings: unknown | null
  sections: SignedContentSnapshotSection[]
}

// ---- buildSignedContentSnapshot -------------------------------------------

/** The subset of a live estimate row buildSignedContentSnapshot needs. Kept
 *  local (not imported from lib/queries/estimate) so this module has zero
 *  dependencies and is trivially unit-testable with plain object literals. */
export interface SnapshotSourceEstimate {
  summary: string | null
  notes: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  estimate_date: string | null
  estimate_number: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_type: string | null
  discount_value: number | null
  discount_amount: number | null
  deposit_type: string | null
  deposit_value: number | null
  balance_due: number | null
  total: number
  currency_code?: string | null
  presentation_settings: unknown | null
}

export interface SnapshotSourceItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
  sort_order: number
  taxable?: boolean | null
  tax_category?: string | null
  discount?: number | null
}

export interface SnapshotSourceSection {
  id: string
  title: string
  sort_order: number
  subtotal: number
  items?: SnapshotSourceItem[] | null
}

/**
 * Serializes a live estimate + its sections/items into the frozen
 * SignedContentSnapshot shape. Pure — no DB calls, no defaults inferred
 * beyond `?? null` (never `undefined` — this is stored as JSONB). Sections
 * and items are re-sorted by sort_order defensively (the caller SHOULD
 * already order by sort_order, but a frozen snapshot must not depend on
 * caller discipline).
 */
export function buildSignedContentSnapshot(
  estimate: SnapshotSourceEstimate,
  sections: SnapshotSourceSection[]
): SignedContentSnapshot {
  return {
    version: 1,
    summary: estimate.summary ?? null,
    notes: estimate.notes ?? null,
    timeline: estimate.timeline ?? null,
    payment_terms: estimate.payment_terms ?? null,
    warranty_terms: estimate.warranty_terms ?? null,
    estimate_date: estimate.estimate_date ?? null,
    estimate_number: estimate.estimate_number ?? null,
    subtotal: estimate.subtotal,
    tax_rate: estimate.tax_rate,
    tax_amount: estimate.tax_amount,
    discount_type: estimate.discount_type ?? null,
    discount_value: estimate.discount_value ?? null,
    discount_amount: estimate.discount_amount ?? null,
    deposit_type: estimate.deposit_type ?? null,
    deposit_value: estimate.deposit_value ?? null,
    balance_due: estimate.balance_due ?? null,
    total: estimate.total,
    currency_code: estimate.currency_code ?? 'USD',
    presentation_settings: estimate.presentation_settings ?? null,
    sections: [...sections]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((section) => ({
        id: section.id,
        title: section.title,
        sort_order: section.sort_order,
        subtotal: section.subtotal,
        items: [...(section.items ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((item) => ({
            id: item.id,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit ?? null,
            unit_price: item.unit_price,
            total: item.total,
            sort_order: item.sort_order,
            taxable: item.taxable ?? null,
            tax_category: item.tax_category ?? null,
            discount: item.discount ?? null,
          })),
      })),
  }
}

// ---- applySignedSnapshot ---------------------------------------------------

/**
 * The exact rendered-content field set applySignedSnapshot REPLACES. Any type
 * passed to applySignedSnapshot must carry at least these fields (extra
 * fields — company, project, payment_status, attachedPhotos, share metadata,
 * signature display fields, etc. — are preserved untouched via the spread).
 * `sections`/`presentation_settings` are typed `unknown` here on purpose: the
 * overlay REPLACES them wholesale from the snapshot regardless of the live
 * payload's prior shape.
 */
export interface SignedSnapshotOverlayFields {
  summary: string | null
  notes: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  estimate_date: string | null
  estimate_number: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_type: string | null
  discount_value: number | null
  discount_amount: number | null
  deposit_type: string | null
  deposit_value: number | null
  balance_due: number | null
  total: number
  currency_code?: string | null
  presentation_settings: unknown
  sections: unknown
}

/**
 * The ONE shared overlay used by BOTH share lookups (lib/queries/share.ts —
 * getEstimateByShareToken + getEstimateByPublicToken) AND the PDF route
 * (app/api/estimates/[id]/pdf/route.ts) to make "what the client signed" the
 * thing every client-facing surface renders, forever.
 *
 * Semantics: REPLACE, not merge. When `snapshot` is non-null, every field in
 * SignedSnapshotOverlayFields is overwritten wholesale from the snapshot —
 * never `{...live, ...partial}` where an unlisted-but-related field (e.g.
 * discount_value alongside discount_type) is left live while its sibling is
 * frozen. Fields OUTSIDE this set (company branding, share metadata, photo
 * URLs, signature display fields) are NOT touched — they stay live via the
 * spread.
 *
 * KNOWN LIMITATION: photo URLs are NOT part of the frozen set and always
 * re-resolve live (signed URLs expire — freezing a URL would just break
 * after 1h). A post-sign photo add/remove is therefore still visible on a
 * signed estimate's share page/PDF. Tracked as a known limitation, not a bug
 * — see the phase 164-01 SUMMARY.
 *
 * `snapshot == null` (no signature yet, OR a legacy signature predating this
 * column) is a no-op — returns `payload` completely unchanged, so the legacy
 * path is byte-identical to today.
 */
export function applySignedSnapshot<T extends SignedSnapshotOverlayFields>(
  payload: T,
  snapshot: SignedContentSnapshot | null | undefined
): T {
  if (snapshot == null) return payload

  return {
    ...payload,
    summary: snapshot.summary,
    notes: snapshot.notes,
    timeline: snapshot.timeline,
    payment_terms: snapshot.payment_terms,
    warranty_terms: snapshot.warranty_terms,
    estimate_date: snapshot.estimate_date,
    estimate_number: snapshot.estimate_number,
    subtotal: snapshot.subtotal,
    tax_rate: snapshot.tax_rate,
    tax_amount: snapshot.tax_amount,
    discount_type: snapshot.discount_type,
    discount_value: snapshot.discount_value,
    discount_amount: snapshot.discount_amount,
    deposit_type: snapshot.deposit_type,
    deposit_value: snapshot.deposit_value,
    balance_due: snapshot.balance_due,
    total: snapshot.total,
    currency_code: snapshot.currency_code,
    presentation_settings: snapshot.presentation_settings,
    sections: snapshot.sections,
  } as T
}
