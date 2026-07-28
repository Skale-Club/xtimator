// tests/unit/estimate/fixtures/document-fixtures.ts
//
// Phase 183 (Wave 0) — ONE shared fixture module for PDF-direct-call tests
// (EstimateWithSections shape) AND webview RTL tests (EstimateDocumentData
// shape via toFixtureDocumentData). Every later signature/caption/parity test
// in this phase should import from here instead of re-declaring its own
// estimate/company/photo fixtures per test file.
//
// Zero framework imports (no `react`, no `@react-pdf/renderer`) — this stays
// a plain data module so both PDF-direct-call tests and RTL webview tests can
// import it without pulling in either rendering stack.

/** DocumentCompany-shaped (and PDF CompanyInfo-compatible — same field set)
 * fixture company. */
export const FIXTURE_COMPANY = {
  name: 'Acme Renovations',
  owner_name: 'Jamie Lee',
  phone: '+15125550100',
  email: 'jamie@acme.test',
  website: 'https://acme.test',
  address: '123 Main St',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
  logo_url: null,
  brand_primary_color: '#2563eb',
}

/**
 * Builds an EstimateWithSections-shaped fixture: 2 sections (Labor,
 * Materials), discount + tax + deposit all configured so every totals-block
 * row renders. All money fields below are computed EXPLICITLY by hand — this
 * module has zero dependency on the totals engine, so the arithmetic must
 * stay internally consistent on its own:
 *
 *   subtotal       = 1500    (750 Labor + 750 Materials)
 *   discount_amount = 150    (1500 * 10%)
 *   tax_amount      = 111.38 (round2((1500 - 150) * 0.0825) = round2(111.375))
 *   total           = 1461.38 (1500 - 150 + 111.38)
 *   balance_due     = 1022.97 (total - depositAmount, depositAmount ~= round2(total * 30%) = 438.41
 *                              — for reference only; the PDF/webview NEVER recompute this from
 *                              deposit_value, see lib/estimate/deposit-display.ts GUARD-03. The
 *                              persisted balance_due below is the only value that actually drives
 *                              rendering.)
 *
 * Spread `...overrides` last so callers can override any field.
 */
export function buildFixtureEstimate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'fixture-est-1',
    project_id: 'fixture-proj-1',
    company_id: 'fixture-co-1',
    currency_code: 'USD',
    version: 1,
    estimate_seq: 1,
    estimate_number: null,
    estimate_date: null,
    is_current: true,
    share_token: 'fixture-share-tok',
    public_slug_token: null,
    status: 'draft',
    language: 'en',
    summary: 'Full kitchen renovation including framing, materials, and finish work.',
    notes: null,
    timeline: null,
    payment_terms: 'Net 30',
    warranty_terms: '1 year labor',
    subtotal: 1500,
    discount_type: 'percentage',
    discount_value: 10,
    discount_amount: 150,
    tax_rate: 0.0825,
    tax_amount: 111.38,
    total: 1461.38,
    deposit_type: 'percent',
    deposit_value: 30,
    balance_due: 1022.97,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    client_response: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    presentation_settings: null,
    sections: [
      {
        id: 'fixture-sec-labor',
        estimate_id: 'fixture-est-1',
        company_id: 'fixture-co-1',
        title: 'Labor',
        sort_order: 1,
        subtotal: 750,
        items: [
          {
            id: 'fixture-item-labor-1',
            section_id: 'fixture-sec-labor',
            company_id: 'fixture-co-1',
            description: 'Labor - framing and installation',
            quantity: 10,
            unit: 'hr',
            unit_price: 75,
            total: 750,
            sort_order: 1,
            price_source: null,
          },
        ],
      },
      {
        id: 'fixture-sec-materials',
        estimate_id: 'fixture-est-1',
        company_id: 'fixture-co-1',
        title: 'Materials',
        sort_order: 2,
        subtotal: 750,
        items: [
          {
            id: 'fixture-item-mat-1',
            section_id: 'fixture-sec-materials',
            company_id: 'fixture-co-1',
            description: 'Lumber - 2x4 studs',
            quantity: 50,
            unit: 'ea',
            unit_price: 10,
            total: 500,
            sort_order: 1,
            price_source: null,
          },
          {
            id: 'fixture-item-mat-2',
            section_id: 'fixture-sec-materials',
            company_id: 'fixture-co-1',
            description: 'Drywall sheets',
            quantity: 25,
            unit: 'ea',
            unit_price: 10,
            total: 250,
            sort_order: 2,
            price_source: null,
          },
        ],
      },
    ],
    attachedPhotos: [],
    ...overrides,
  }
}

/**
 * Mirrors tests/unit/estimate/presentation-settings-cross-surface.test.tsx's
 * toDocumentData() field-for-field, plus one new line threading a `signature`
 * field so the SAME fixture object can drive both EstimatePDF (direct
 * EstimateWithSections shape) and <EstimateDocument data={...}> (webview
 * EstimateDocumentData shape) in later tasks/plans.
 */
export function toFixtureDocumentData(estimate: Record<string, unknown>): Record<string, unknown> {
  return {
    summary: estimate.summary,
    notes: estimate.notes,
    timeline: estimate.timeline,
    payment_terms: estimate.payment_terms,
    warranty_terms: estimate.warranty_terms,
    discount_type: estimate.discount_type,
    discount_value: estimate.discount_value,
    discount_amount: estimate.discount_amount,
    tax_rate: estimate.tax_rate,
    tax_amount: estimate.tax_amount,
    subtotal: estimate.subtotal,
    total: estimate.total,
    deposit_type: estimate.deposit_type ?? 'none',
    deposit_value: estimate.deposit_value ?? null,
    deposit: (estimate as { deposit?: number }).deposit ?? 0,
    balance_due: estimate.balance_due ?? estimate.total,
    currency_code: estimate.currency_code,
    sections: estimate.sections,
    estimate_date: estimate.estimate_date ?? null,
    estimate_number: estimate.estimate_number ?? null,
    attachedPhotos: estimate.attachedPhotos ?? [],
    presentation_settings:
      (estimate as { presentation_settings?: unknown }).presentation_settings ?? null,
    signature: (estimate as { signature?: unknown }).signature ?? null,
  }
}

/**
 * A well-known minimal valid 1x1 PNG, base64-encoded as a full data URL (the
 * same `data:image/png;base64,...` shape canvas.toDataURL('image/png')
 * produces — see components/share/signature-pad.tsx:88). If a later
 * renderToBuffer smoke test (Plan 183-06) throws on this constant, regenerate
 * a fresh 1x1 PNG via `node -e "..."` or an online base64-PNG generator and
 * replace this string — do not delete the smoke test.
 */
export const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

/**
 * Matches the DocumentSignature shape Plan 183-02 will add to
 * lib/estimate/document/model.ts — NOT imported here since it does not exist
 * yet; kept as a plain object literal so this file has zero dependency on
 * not-yet-existing types.
 *
 * signedAt is date-only (YYYY-MM-DD) so formatDate's local-midnight
 * normalization (lib/estimate/document/format.ts) keeps it deterministic
 * across timezones/CI. Every test asserting the rendered signed-date TEXT
 * must compute its expectation via formatDate(SIGNATURE_FIXTURE.signedAt,
 * 'en') (or the relevant language) — never hardcode a formatted date string.
 */
export const SIGNATURE_FIXTURE = {
  signerName: 'Jane Doe',
  signedAt: '2026-07-20',
  signatureDataUrl: TINY_PNG_DATA_URL,
}

/** DocumentPhoto-shaped fixture: a captioned photo. */
export const PHOTO_WITH_CAPTION = {
  id: 'photo-1',
  storage_path: 'co-1/photo-1.jpg',
  caption: 'Front yard before demo',
  url: 'https://signed.example.test/photo-1.jpg',
}

/** DocumentPhoto-shaped fixture: an uncaptioned photo. */
export const PHOTO_NO_CAPTION = {
  id: 'photo-2',
  storage_path: 'co-1/photo-2.jpg',
  caption: null,
  url: 'https://signed.example.test/photo-2.jpg',
}

/**
 * Phase 184 Plan 05 (PGBRK-01/03/04) — forces a genuinely multi-page PDF
 * under Classic/Modern's REAL page geometry via the real blocksFromModel() +
 * computePageBreaks() pipeline (tests/unit/pdf/_pages-for-fixture.ts's
 * buildPagesForFixture): 4 sections x 10 items, medium-length descriptions
 * (long enough to wrap to 2 lines at the item table's ~9pt font / ~213pt
 * description column width), tuned empirically to yield pages.length >= 3.
 * No signature/photos/terms — purely a pagination stress fixture, not a
 * content-parity fixture (see buildFixtureEstimate for that).
 */
export function buildMultiPageFixtureEstimate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const sectionTitles = ['Demolition', 'Framing', 'Electrical', 'Finishing']
  const sections = sectionTitles.map((title, sIdx) => {
    const items = Array.from({ length: 10 }, (_, iIdx) => {
      const n = sIdx * 10 + iIdx + 1
      return {
        id: `mp-item-${sIdx}-${iIdx}`,
        section_id: `mp-sec-${sIdx}`,
        company_id: 'fixture-co-1',
        description: `Line item ${n}: detailed scope of work covering labor and materials for this phase of the project, including site prep and cleanup`,
        quantity: 1,
        unit: 'ea',
        unit_price: 100,
        total: 100,
        sort_order: iIdx + 1,
        price_source: null,
      }
    })
    return {
      id: `mp-sec-${sIdx}`,
      estimate_id: 'mp-est-1',
      company_id: 'fixture-co-1',
      title,
      sort_order: sIdx + 1,
      subtotal: items.reduce((sum, item) => sum + item.total, 0),
      items,
    }
  })
  const total = sections.reduce((sum, s) => sum + s.subtotal, 0)

  return {
    id: 'mp-est-1',
    project_id: 'mp-proj-1',
    company_id: 'fixture-co-1',
    currency_code: 'USD',
    version: 1,
    estimate_seq: 1,
    estimate_number: null,
    estimate_date: null,
    is_current: true,
    share_token: 'mp-share-tok',
    public_slug_token: null,
    status: 'draft',
    language: 'en',
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    subtotal: total,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total,
    deposit_type: 'none',
    deposit_value: null,
    balance_due: null,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    client_response: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    presentation_settings: null,
    sections,
    attachedPhotos: [],
    ...overrides,
  }
}
