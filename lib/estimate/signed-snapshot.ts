// lib/estimate/signed-snapshot.ts
// TRUST-01 (Phase 164 Plan 01): close audit finding A1/A2 -- "a signed
// estimate remains fully editable, and a post-sign edit silently changes what
// every client-facing surface renders" -- by capturing an IMMUTABLE snapshot
// of everything the signed document rendered, at the moment of signing, and
// replaying it forever after on every client-facing surface.
//
// Three pure functions live here, all dependency-free (no DB calls):
//   - buildSignedContentSnapshot: serializes a live estimate + sections into
//     the frozen SignedContentSnapshot shape, called ONCE at sign time
//     (app/api/estimates/[id]/sign/route.ts).
//   - applySignedSnapshot: the ONE shared overlay used by BOTH share lookups
//     (lib/queries/share.ts) AND the PDF route (app/api/estimates/[id]/pdf/route.ts)
//     to REPLACE (never merge) the live payload's rendered fields with the
//     signed snapshot once a signature with a non-null snapshot exists.
//   - applySignedCompanyTerms / applySignedCompanyTermsValue: the sibling
//     overlay for the COMPANY-level Terms & Conditions block
//     (companies.estimate_terms_enabled/text). Same REPLACE-not-merge
//     semantics, applied to the `company` object rather than the estimate
//     payload, because company terms are read from a different table than
//     everything else in this file. The `...Value` variant takes the
//     already-extracted `{enabled, text}` pair directly (for a caller that
//     already has it, e.g. off an EstimateWithSections.signedCompanyTerms)
//     instead of a whole SignedContentSnapshot.
//   - canonicalJsonStringify: sorted-key JSON serialization used to hash
//     `signed_content` in a way that survives jsonb's key-order normalization
//     — see its own doc comment (finding #3) for why plain JSON.stringify
//     cannot be used for this.
//
// Field set mirrors EXACTLY what the client-facing renderers show today
// (share query lib/queries/share.ts:117-138, estimate-document-modern.tsx,
// estimate-view.tsx, deriveDepositDisplay) -- every rendered + user-editable
// field must be captured/overlaid or post-sign drift survives via the
// omission. Company branding, share metadata, photo URLs, and signature
// display fields are intentionally NOT part of this set -- they stay live
// (see applySignedSnapshot's doc comment for the known photo-URL limitation).
//
// v2 (security-hardening S1): company-level Terms & Conditions
// (companies.estimate_terms_enabled/estimate_terms_text) join the frozen set
// -- editing Settings > Terms after signing was silently changing the legal
// content of an already-signed document. A `consent` field also records the
// exact consent statement + key shown to the signer at sign time, for audit
// evidence. v1 snapshots (signed before this change) have neither field and
// keep rendering LIVE company terms -- see applySignedCompanyTerms's doc
// comment for the exact v1/v2 branching.

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
  /** Snapshot schema version. v1 = pre-security-hardening (no company_terms/
   *  consent). v2 = adds both fields below. */
  version: 1 | 2
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
  /** v2 only. The company's Terms & Conditions block AS OF signing --
   *  `null` on a v1 snapshot (field didn't exist yet); non-null on every v2
   *  snapshot (the builder always populates it, even when terms were
   *  disabled/empty at sign time -- `enabled: false` / `text: null` is a
   *  valid, meaningful frozen state, not an absent one). */
  company_terms?: { enabled: boolean; text: string | null } | null
  /** v2 only. Evidence of the consent statement shown to the signer at sign
   *  time. `null` on a v1 snapshot. */
  consent?: { statement: string; key: string } | null
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

/** Canonical consent statement shown to the signer at sign time, and its
 *  stable identifier -- both recorded verbatim into the v2 snapshot's
 *  `consent` field as audit evidence that a specific, known statement (not
 *  just a raw signature image) was presented before signing. `key` lets a
 *  future statement revision be distinguished from this one without having
 *  to diff snapshot text. */
export const SIGN_CONSENT_STATEMENT =
  'By signing, you agree to the pricing and terms in this estimate.'
export const SIGN_CONSENT_KEY = 'sign_consent_v1'

/**
 * Serializes a live estimate + its sections/items into the frozen
 * SignedContentSnapshot shape. Pure — no DB calls, no defaults inferred
 * beyond `?? null` (never `undefined` — this is stored as JSONB). Sections
 * and items are re-sorted by sort_order defensively (the caller SHOULD
 * already order by sort_order, but a frozen snapshot must not depend on
 * caller discipline).
 *
 * `extras` carries the v2 fields, both required so every NEW snapshot is a
 * v2 snapshot -- there is no code path left that produces a v1 snapshot;
 * v1 only exists as a legacy shape for rows written before this change.
 */
export function buildSignedContentSnapshot(
  estimate: SnapshotSourceEstimate,
  sections: SnapshotSourceSection[],
  extras: {
    companyTerms: { enabled: boolean; text: string | null }
    consent: { statement: string; key: string } | null
  }
): SignedContentSnapshot {
  return {
    version: 2,
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
    company_terms: {
      enabled: extras.companyTerms.enabled,
      text: extras.companyTerms.text ?? null,
    },
    consent: extras.consent
      ? { statement: extras.consent.statement, key: extras.consent.key }
      : null,
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

// ---- applySignedCompanyTerms -----------------------------------------------

/**
 * The sibling overlay to applySignedSnapshot for the COMPANY-level Terms &
 * Conditions block (companies.estimate_terms_enabled/estimate_terms_text).
 * Applied to the `company` object at the same call sites as
 * applySignedSnapshot (share.ts's two lookups, the PDF resolver via
 * getEstimateWithContext) — right where a live `company` row and a loaded
 * signature snapshot meet.
 *
 * Semantics: REPLACE, not merge — same discipline as applySignedSnapshot.
 * When the snapshot carries a non-null `company_terms` (v2+), BOTH fields are
 * overwritten wholesale from the snapshot; `enabled: false` is a valid frozen
 * state and is never left live just because `text` also changed.
 *
 * Degrades to a no-op (returns `company` unchanged) in every case that isn't
 * "a v2+ snapshot with a populated company_terms":
 *   - `snapshot == null` — no signature yet, or a legacy signature with no
 *     `signed_content` at all.
 *   - a v1 snapshot, or any snapshot whose `company_terms` is null/undefined
 *     — pre-security-hardening snapshots never captured company terms, so
 *     there is nothing to freeze; the estimate keeps rendering LIVE terms
 *     (today's behavior, unchanged for legacy signatures).
 * Never throws on null/undefined `snapshot`.
 */
export function applySignedCompanyTerms<
  T extends { estimate_terms_enabled: boolean; estimate_terms_text: string | null }
>(company: T, snapshot: SignedContentSnapshot | null | undefined): T {
  if (snapshot == null) return company
  return applySignedCompanyTermsValue(company, snapshot.company_terms)
}

/**
 * Fix-pack F1 (finding #6) — the sibling entry point to applySignedCompanyTerms
 * for callers that already have the frozen `company_terms` VALUE in hand
 * (e.g. lib/queries/estimate.ts's getEstimateWithContext, which reads it off
 * an already-loaded EstimateWithSections.signedCompanyTerms instead of
 * re-fetching the whole signed_content snapshot a second time just to reach
 * this one nested field). Same REPLACE-not-merge / degrade-to-no-op semantics
 * as applySignedCompanyTerms — in fact applySignedCompanyTerms now delegates
 * here so the two can never drift apart.
 */
export function applySignedCompanyTermsValue<
  T extends { estimate_terms_enabled: boolean; estimate_terms_text: string | null }
>(company: T, companyTerms: { enabled: boolean; text: string | null } | null | undefined): T {
  if (companyTerms == null) return company

  return {
    ...company,
    estimate_terms_enabled: companyTerms.enabled,
    estimate_terms_text: companyTerms.text,
  }
}

// ---- canonicalJsonStringify -------------------------------------------------

/**
 * Fix-pack F1 (finding #3 — tamper-evidence hash not reproducible from stored
 * jsonb): `p_signed_content` is persisted into a **jsonb** Postgres column,
 * which normalizes/discards object key-INSERTION order on write (jsonb, unlike
 * json, stores a parsed binary representation — re-reading the row back never
 * reproduces the original key order). Hashing `JSON.stringify(signedContent)`
 * at sign time captures THAT process's insertion order, but re-serializing the
 * value read back from `estimate_signatures.signed_content` with plain
 * `JSON.stringify` can walk the keys in a different order and produce a
 * DIFFERENT digest for byte-for-byte identical content — making the recorded
 * hash unable to ever be reproduced by a verifier, which defeats the entire
 * point of a tamper-evidence hash.
 *
 * Fix: serialize with object keys sorted (default `Array.prototype.sort`,
 * lexicographic by UTF-16 code unit) at BOTH sign time and verification time.
 * A sorted-key serialization is order-independent by construction, so it can
 * always be reproduced from the stored jsonb value regardless of how Postgres
 * (or any client) happened to lay out the keys internally.
 *
 * Pure, deterministic, dependency-free. Semantics deliberately mirror
 * `JSON.stringify` wherever this doesn't conflict with key-sorting:
 *   - arrays keep their existing order (arrays ARE ordered in jsonb too);
 *   - an `undefined` object-property value is OMITTED from the output, exactly
 *     like `JSON.stringify` (never serialized as `null` or `"undefined"`);
 *   - an `undefined` array ELEMENT becomes `null`, exactly like `JSON.stringify`;
 *   - `NaN`/`Infinity`/`-Infinity` serialize as `null`, exactly like
 *     `JSON.stringify` (delegated straight to `JSON.stringify` for numbers);
 *   - a value with a `.toJSON()` method is replaced by its result first, exactly
 *     like `JSON.stringify` (e.g. `Date`).
 */
export function canonicalJsonStringify(value: unknown): string {
  const serialize = (input: unknown): string | undefined => {
    if (input === undefined) return undefined
    if (input === null) return 'null'

    const kind = typeof input

    if (kind === 'string' || kind === 'boolean' || kind === 'number') {
      // JSON.stringify already handles NaN/Infinity -> 'null' correctly.
      return JSON.stringify(input)
    }
    if (kind === 'bigint') {
      throw new TypeError('canonicalJsonStringify cannot serialize a BigInt')
    }
    if (kind === 'function' || kind === 'symbol') return undefined

    // kind === 'object' from here on.
    const toJSON = (input as { toJSON?: unknown }).toJSON
    if (typeof toJSON === 'function') {
      return serialize((toJSON as () => unknown).call(input))
    }

    if (Array.isArray(input)) {
      const items = input.map((item) => serialize(item) ?? 'null')
      return `[${items.join(',')}]`
    }

    const record = input as Record<string, unknown>
    const sortedKeys = Object.keys(record).sort()
    const parts: string[] = []
    for (const key of sortedKeys) {
      const serialized = serialize(record[key])
      if (serialized === undefined) continue // omit, exactly like JSON.stringify
      parts.push(`${JSON.stringify(key)}:${serialized}`)
    }
    return `{${parts.join(',')}}`
  }

  // Top-level `undefined` has no real JSON.stringify-compatible string form
  // (JSON.stringify(undefined) itself returns the VALUE undefined, not a
  // string) — degrades to 'null' rather than widening this function's return
  // type. Never hit in practice: every caller passes a SignedContentSnapshot,
  // always a populated object.
  return serialize(value) ?? 'null'
}
