import Image from 'next/image'
import { formatMoney } from '@/lib/money/currency'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import { CompanyContactLinks } from '@/components/estimate/company-contact-links'
import { ensureReadableOnWhite } from '@/lib/color/contrast'
import { deriveDepositDisplay } from '@/lib/estimate/deposit-display'
import { isPercentageDiscount } from '@/lib/estimate/discount-display'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import {
  resolvePresentationSettings,
  isSectionVisible,
} from '@/lib/estimate/presentation-settings'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type {
  EstimateDocumentData,
  DocumentCompany,
  DocumentClient,
} from '@/components/workspace/estimate/estimate-document'

// ---------------------------------------------------------------------------
// Modern share-page document — VIEW-ONLY.
//
// This is a brand-new, self-contained component. It consumes the exact same
// already-computed EstimateDocumentData/DocumentCompany/DocumentClient props
// that estimate-view.tsx already builds for Classic's <EstimateDocument
// mode="view">, and reuses the same pure helpers (deriveDepositDisplay,
// ensureReadableOnWhite, readableTextColor, formatMoney, formatPhoneForDisplay)
// — same totals/conditionals/order as Classic. Only JSX/Tailwind styling
// differs. Since the 2026-11-12 redesign (shared with the Modern PDF and the
// paginated preview): Inter only (no serif), the estimate number and date on
// the title's line, a section's subtotal on its title line (no subtotal row),
// the editor's read list for items on a phone, the total as one row under a
// brand rule, and the neutral palette of tokens.ts MODERN_COLORS.
//
// components/workspace/estimate/estimate-document.tsx is NOT imported at
// runtime — only its exported TYPES are type-imported above. No edit-mode
// affordances, no dispatch, no drag-and-drop exist in this file.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// i18n label map — same STRINGS as estimate-document.tsx's DOC_LABELS,
// trimmed to only the keys this view-only document renders.
// ---------------------------------------------------------------------------

import { LABELS as DOC_LABELS } from '@/lib/estimate/document/labels'
import { formatAddress, formatDate, formatPercent, formatProjectType } from '@/lib/estimate/document/format'

// tokens.ts MODERN_COLORS, spelled out so Tailwind generates the classes.
const INK = 'text-[#18181b]' // MODERN_COLORS.ink — values, titles
const SECONDARY = 'text-[#52525b]' // MODERN_COLORS.secondary — supporting text
const LABEL = 'text-[#71717a]' // MODERN_COLORS.label — small uppercase labels
const RULE = '#e4e4e7' // MODERN_COLORS.rule — hairlines
const EYEBROW = `text-xs font-semibold uppercase tracking-widest ${LABEL} select-none`

/** "2 hr × $85.00" — the same line the editor's mobile read list shows
 *  (item-card-mobile.tsx formatItemQuantityLine; restated here because that
 *  module is a client component and this one renders on the server). */
function quantityLine(quantity: number, unit: string | null, unitPrice: string): string {
  const qty = Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(4)))
  return `${qty}${unit ? ` ${unit}` : ''} × ${unitPrice}`
}

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

interface EstimateDocumentModernProps {
  data: EstimateDocumentData
  company: DocumentCompany
  client: DocumentClient | null
  projectName: string
  projectType: string | null
  language?: EstimateLanguage | null
  estimateVersion: number
  estimateSeq?: number
  estimateCreatedAt: string
  /** Same semantics as EstimateDocument's `preparedBy`: rendered only when provided. */
  preparedBy?: string | null
  /** Same semantics as EstimateDocument's `companyTerms`: rendered FIRST in the
   *  terms block only when enabled && text. */
  companyTerms?: { enabled: boolean; text: string | null } | null
}

export function EstimateDocumentModern({
  data,
  company,
  client,
  projectName,
  projectType,
  language,
  estimateVersion,
  estimateSeq,
  estimateCreatedAt,
  preparedBy,
  companyTerms,
}: EstimateDocumentModernProps) {
  // SENDHUB-04 (Phase 163): resolve once at the render boundary (mirrors
  // components/workspace/estimate/estimate-document.tsx:1592). data.presentation_settings
  // is already threaded via estimate-view.tsx:157-161's cast-with-fallback — no
  // re-cast needed here.
  const resolvedSettings = resolvePresentationSettings(data.presentation_settings)

  const lang = (language ?? 'en') as EstimateLanguage
  const L = DOC_LABELS[lang] ?? DOC_LABELS.en

  const brandColor = company.brand_primary_color ?? SYSTEM_COLORS.primary
  // Render-time WCAG adaptation (stored brand color never mutated) — same as Classic.
  // Modern never fills a background with brand color (hairline rules + text accents
  // only), so readableTextColor (foreground-over-fill) is intentionally unused here.
  const brandText = ensureReadableOnWhite(brandColor) // brand color as text on white

  const defaultEstimateNumber =
    estimateSeq && estimateSeq > 0
      ? String(estimateSeq).padStart(4, '0')
      : String(estimateVersion)

  // View mode: skip items with empty descriptions and sections that end up empty
  // — same filtering as Classic's view-mode branch.
  // SENDHUB-04 (Phase 163): gate the line-items block on the resolver's 'sections'
  // toggle (mirrors the Classic wrap-around at estimate-document.tsx:1602).
  const visibleSections = isSectionVisible(resolvedSettings, 'sections')
    ? data.sections
        .map((s) => ({ ...s, items: s.items.filter((i) => i.description.trim() !== '') }))
        .filter((s) => s.items.length > 0)
    : []

  const companyAddr = formatAddress(company)
  const clientAddr = client ? formatAddress(client) : null

  // PUI-02 (GUARD-03): read the persisted server row through the shared seam —
  // never recompute. Same as Classic's DocumentTotals.
  const dep = deriveDepositDisplay({
    total: data.total,
    deposit_type: data.deposit_type ?? 'none',
    deposit_value: data.deposit_value,
    balance_due: data.balance_due,
  })

  const fmt = (v: number) => formatMoney(v, data.currency_code)

  // SENDHUB-04 (Phase 163): each term block is independently gated below; the
  // outer wrapper stays hidden when every gated term is invisible OR null.
  const hasCompanyTerms =
    !!(companyTerms?.enabled && companyTerms.text) &&
    isSectionVisible(resolvedSettings, 'estimate_terms')
  const hasTerms =
    hasCompanyTerms ||
    (isSectionVisible(resolvedSettings, 'payment_terms') && data.payment_terms != null) ||
    (isSectionVisible(resolvedSettings, 'timeline') && data.timeline != null) ||
    (isSectionVisible(resolvedSettings, 'warranty_terms') && data.warranty_terms != null) ||
    (isSectionVisible(resolvedSettings, 'notes') && data.notes != null)

  return (
    <div
      className="font-sans rounded-[8px] shadow-lg overflow-hidden"
      // The paper is always light: pin the theme tokens it uses, exactly like the
      // Classic document (estimate-document.tsx). Without this a dark app or OS
      // theme leaked in: item totals rendered near-white on white and the
      // Payment box's bg-muted turned dark grey.
      style={{
        backgroundColor: '#ffffff',
        colorScheme: 'light',
        '--foreground': '240 10% 3.9%',
        '--muted-foreground': '240 3.8% 46.1%',
        '--muted': '240 4.8% 95.9%',
        '--border': '240 5.9% 90%',
        '--card': '0 0% 100%',
        '--card-foreground': '240 10% 3.9%',
        '--glass-bg': 'rgba(255, 255, 255, 0.65)',
        '--glass-bg-strong': 'rgba(255, 255, 255, 0.97)',
        '--glass-border': 'rgba(15, 23, 42, 0.08)',
        color: 'hsl(240 10% 3.9%)',
      } as React.CSSProperties}
    >
      {/* Company header — thin hairline rule instead of Classic's brand-filled top border */}
      <div
        data-track-section="header"
        // Logo to the right of the company info at every width, like Classic
        // (it used to drop below it on phones via flex-col).
        className="flex flex-row items-start justify-between gap-4 px-8 sm:px-12 py-8 border-b border-t"
        style={{ borderTopColor: brandColor, borderBottomColor: RULE }}
      >
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-2xl leading-tight tracking-tight break-words ${INK}`}>{company.name}</p>
          {company.owner_name && (
            <p className={`text-xs ${SECONDARY} mt-0.5`}>{company.owner_name}</p>
          )}
          <CompanyContactLinks
            phone={company.phone}
            email={company.email}
            website={company.website}
          />
          {companyAddr && (
            <p className={`text-xs ${SECONDARY} mt-0.5 whitespace-pre-line`}>
              {companyAddr}
            </p>
          )}
        </div>

        {company.logo_url && (
          <div className="flex-shrink-0">
            {/* Phase 190 (URL-03/W2): skip /_next/image. These logos are now
                same-origin (/storage/logos/...) and the proxy already sets the
                right Cache-Control (public, max-age=300, stale-while-revalidate
                — logos use STABLE keys with upsert, so they must revalidate).
                Routing through the optimizer would re-cache them under
                next.config.ts's minimumCacheTTL (31 days) and pin a stale logo
                on exactly the surface that shows a company's CURRENT branding.
                Same rationale as components/landing/*, which also skip the
                self-hosted optimizer (it intermittently fails — no sharp). */}
            <Image
              src={company.logo_url}
              alt={company.name}
              width={64}
              height={64}
              className="h-12 w-12 rounded object-contain sm:h-16 sm:w-16"
              unoptimized
            />
          </div>
        )}
      </div>

      {/* Title row — "ESTIMATE" on the left, the estimate number over the date on
          the right, then a full-width 2px brand rule (the PDF's PdfTitleBanner). */}
      <div className="px-8 sm:px-12 pt-8">
        <div className="flex items-start justify-between gap-4 pb-2">
          <h1
            className="text-2xl sm:text-3xl font-extrabold tracking-[0.02em] leading-tight select-none"
            style={{ color: brandText }}
          >
            {L.estimate}
          </h1>
          <div className="text-right">
            <p data-testid="modern-estimate-number" className="text-base font-bold tabular-nums leading-tight" style={{ color: brandText }}>
              #{data.estimate_number ?? defaultEstimateNumber}
            </p>
            <p className={`text-sm ${SECONDARY} leading-tight mt-0.5`}>
              {formatDate(data.estimate_date ?? estimateCreatedAt, lang)}
            </p>
          </div>
        </div>
        <div className="border-t-2" style={{ borderTopColor: brandColor }} />
      </div>

      {/* Info grid: PROJECT | BILL TO (the date and number are in the title row) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 px-8 sm:px-12 pt-7 pb-6">
        <div>
          <p className={`${EYEBROW} mb-1.5`}>{L.project}</p>
          <p className={`text-xl font-bold leading-snug ${INK}`}>{projectName}</p>
          {projectType && (
            <p className={`text-base ${SECONDARY} mt-1 capitalize`}>
              {formatProjectType(projectType)}
            </p>
          )}
          {isSectionVisible(resolvedSettings, 'valid_until') && data.valid_until && (
            <p className={`text-base ${SECONDARY} mt-1`} data-testid="valid-until">
              {L.validUntil}: {formatDate(data.valid_until, lang)}
            </p>
          )}
        </div>

        {client && (
          <div>
            <p className={`${EYEBROW} mb-1.5`}>{L.billTo}</p>
            <div className="space-y-0.5">
              <p className={`text-xl font-bold leading-snug ${INK}`}>{client.name}</p>
              {client.email && (
                <p className={`text-base ${SECONDARY} break-words`}>{client.email}</p>
              )}
              {client.phone && (
                <p className={`text-base ${SECONDARY}`}>
                  {formatPhoneForDisplay(client.phone)}
                </p>
              )}
              {clientAddr && (
                <p className={`text-base ${SECONDARY} whitespace-pre-line`}>{clientAddr}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Summary — conditional on data.summary + SENDHUB-04 resolver gate */}
      {isSectionVisible(resolvedSettings, 'summary') && data.summary != null && (
        <div className="px-8 sm:px-12 pb-6">
          <p className={`${EYEBROW} mb-1.5`}>{L.summary}</p>
          <p className={`text-base ${SECONDARY} whitespace-pre-line leading-relaxed`}>
            {data.summary}
          </p>
        </div>
      )}

      {/* Sections — ink title with its subtotal on the same line over an ink rule;
          no "Section Subtotal" row (the PDF's PdfSectionHeader subtotal). */}
      <div data-track-section="line-items">
        {visibleSections.map((section) => (
          <div key={section.id} className="pt-6">
            <div
              data-testid="modern-section-header"
              className="mx-8 sm:mx-12 flex items-baseline justify-between gap-4 border-b pb-2"
              style={{ borderBottomColor: '#18181b' }}
            >
              <span className={`min-w-0 break-words font-bold text-base tracking-wide select-none ${INK}`}>
                {section.title}
              </span>
              <span className={`flex-shrink-0 font-bold text-base tabular-nums ${INK}`}>
                {formatMoney(section.subtotal, data.currency_code)}
              </span>
            </div>

            {/* Mobile: the editor's read list — description, "qty unit × price",
                the line total on the right; hairlines on the content rails, no cards. */}
            <div className="sm:hidden mx-8">
              {section.items.map((item) => (
                <div
                  key={item.id}
                  data-track-section={`item:${item.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-3 border-b last:border-b-0"
                  style={{ borderBottomColor: RULE }}
                >
                  <p className={`break-words text-base font-medium leading-snug ${INK}`}>{item.description}</p>
                  <span className={`row-span-2 self-center text-right text-base font-semibold tabular-nums whitespace-nowrap ${INK}`}>
                    {formatMoney(item.total, data.currency_code)}
                  </span>
                  <span className={`text-sm ${SECONDARY} tabular-nums`}>
                    {quantityLine(item.quantity, item.unit, formatMoney(item.unit_price, data.currency_code))}
                  </span>
                </div>
              ))}
            </div>

            {/* Desktop: table with hairline dividers, no zebra striping */}
            <div className="hidden sm:block overflow-x-auto px-8 sm:px-12">
              <table className="w-full">
                <thead>
                  <tr className={`text-xs uppercase tracking-wider ${LABEL} border-b`} style={{ borderBottomColor: RULE }}>
                    <th className="py-2 px-0 text-left font-semibold w-[40%]">{L.description}</th>
                    <th className="py-2 px-2 w-[12%] text-center font-semibold">{L.qty}</th>
                    <th className="py-2 px-2 w-[13%] text-center font-semibold">{L.unit}</th>
                    <th className="py-2 px-2 w-[17%] text-right font-semibold">{L.unitPrice}</th>
                    <th className="py-2 px-0 w-[18%] text-right font-semibold">{L.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.id} data-track-section={`item:${item.id}`} className={`border-b last:border-0 ${INK}`} style={{ borderBottomColor: RULE }}>
                      <td className="py-3 px-0 text-base">{item.description}</td>
                      <td className="py-3 px-2 text-base text-center tabular-nums">{item.quantity}</td>
                      <td className={`py-3 px-2 text-base text-center ${SECONDARY}`}>{item.unit ?? ''}</td>
                      <td className="py-3 px-2 text-base text-right tabular-nums">
                        {formatMoney(item.unit_price, data.currency_code)}
                      </td>
                      <td className="py-3 px-0 text-base text-right tabular-nums font-medium">
                        {formatMoney(item.total, data.currency_code)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Totals — hairline rows, then the total as ONE row under a 2px brand rule
          (label left, amount right), then the Payment box. Order matches the PDF:
          Subtotal → Discount → Tax → Total → Payment box. */}
      <div data-track-section="totals" className="px-8 sm:px-12 pt-8 pb-8">
        <div className="flex justify-end">
          <div className="w-full sm:max-w-sm">
            <div className="flex justify-between text-base py-2 border-b" style={{ borderBottomColor: RULE }}>
              <span className={`${SECONDARY} select-none`}>{L.subtotal}</span>
              <span className={`tabular-nums font-medium ${INK}`}>{fmt(data.subtotal)}</span>
            </div>

            {data.discount_amount > 0 && (
              <div className="flex justify-between text-base py-2 border-b" style={{ borderBottomColor: RULE }}>
                <span className={`${SECONDARY} select-none`}>
                  {L.discount}
                  {isPercentageDiscount(data.discount_type) ? ` (${formatPercent(data.discount_value)})` : ''}
                </span>
                <span className={`tabular-nums font-medium ${INK}`}>-{fmt(data.discount_amount)}</span>
              </div>
            )}

            {data.tax_amount > 0 && (
              <div className="flex justify-between text-base py-2 border-b" style={{ borderBottomColor: RULE }}>
                <span className={`${SECONDARY} select-none`}>
                  {L.tax} ({formatPercent(data.tax_rate * 100)})
                </span>
                <span className={`tabular-nums font-medium ${INK}`}>{fmt(data.tax_amount)}</span>
              </div>
            )}

            <div
              data-testid="modern-total-row"
              className="mt-3 flex items-end justify-between gap-4 border-t-2 pt-3"
              style={{ borderTopColor: brandText }}
            >
              <span className={`${EYEBROW} pb-1`}>{L.grandTotal}</span>
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums" style={{ color: brandText }}>
                {fmt(data.total)}
              </span>
            </div>

            {/* Payment — deposit due now and the balance, apart from the price
                (the same box in every rendering). -mx-3/px-3 keeps the rows on the
                rails of the lines above. */}
            {dep.showDeposit && (
              <div data-testid="totals-payment-box" className="mt-4 -mx-3 space-y-1 rounded-lg bg-muted/50 px-3 py-2">
                <p className={EYEBROW}>{L.payment}</p>
                <div className="flex justify-between text-base">
                  <span className={`${SECONDARY} select-none`}>
                    {L.depositRequired}
                    {data.deposit_type === 'percent' && data.deposit_value
                      ? ` (${formatPercent(data.deposit_value)})`
                      : ''}
                  </span>
                  <span className={`tabular-nums font-medium ${INK}`}>{fmt(dep.depositAmount)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className={`text-base font-semibold select-none ${INK}`}>{L.balanceDue}</span>
                  <span className={`text-base font-semibold tabular-nums ${INK}`}>{fmt(dep.balanceDue)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Terms — each block only when filled */}
      {hasTerms && (
        <div data-track-section="terms" className="px-8 sm:px-12 pb-8 pt-2 border-t border-[#e4e4e7] space-y-6">
          {hasCompanyTerms && (
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest select-none mb-1.5"
                style={{ color: brandText }}
              >
                {L.estimateTerms}
              </p>
              <p className={`text-base ${SECONDARY} whitespace-pre-line leading-relaxed`}>
                {companyTerms!.text}
              </p>
            </div>
          )}
          {isSectionVisible(resolvedSettings, 'payment_terms') && data.payment_terms != null && (
            <div>
              <p className={`${EYEBROW} mb-1.5`}>
                {L.paymentTerms}
              </p>
              <p className={`text-base ${SECONDARY} whitespace-pre-line leading-relaxed`}>
                {data.payment_terms}
              </p>
            </div>
          )}
          {isSectionVisible(resolvedSettings, 'timeline') && data.timeline != null && (
            <div data-track-section="timeline">
              <p className={`${EYEBROW} mb-1.5`}>
                {L.timeline}
              </p>
              <p className={`text-base ${SECONDARY} whitespace-pre-line leading-relaxed`}>
                {data.timeline}
              </p>
            </div>
          )}
          {isSectionVisible(resolvedSettings, 'warranty_terms') && data.warranty_terms != null && (
            <div>
              <p className={`${EYEBROW} mb-1.5`}>
                {L.warranty}
              </p>
              <p className={`text-base ${SECONDARY} whitespace-pre-line leading-relaxed`}>
                {data.warranty_terms}
              </p>
            </div>
          )}
          {isSectionVisible(resolvedSettings, 'notes') && data.notes != null && (
            <div>
              <p className={`${EYEBROW} mb-1.5`}>
                {L.notes}
              </p>
              <p className={`text-base ${SECONDARY} whitespace-pre-line leading-relaxed`}>
                {data.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Signature — PDFPAR-02, net-new. Data-presence gated only (no
          presentation_settings key exists for it per CONTEXT.md's locked
          rule — Pitfall 3). Position: Terms -> Signature -> Photos. */}
      {data.signature && (
        <div data-track-section="signature" className="px-8 sm:px-12 pb-8 pt-2 border-t border-[#e4e4e7]">
          <div>
            <p className={`${EYEBROW} mb-3`}>
              {L.signedBy}
            </p>
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.signature.signatureDataUrl}
                alt={L.signedBy}
                className="h-16 w-auto max-w-[240px] object-contain"
              />
              <div>
                <p className={`text-base font-semibold ${INK}`}>{data.signature.signerName}</p>
                <p className={`text-base ${SECONDARY}`}>{formatDate(data.signature.signedAt, lang)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prepared-by — rendered only when the caller supplies it. Position
          matches the Modern PDF's block order: Signature -> Prepared-by -> Photos. */}
      {preparedBy && (
        <div data-track-section="prepared-by" className="px-8 sm:px-12 pb-8 pt-2 border-t border-[#e4e4e7]">
          <p className={`${EYEBROW} mb-1.5`}>
            {L.preparedBy}
          </p>
          <p className={`text-base ${SECONDARY}`}>{preparedBy}</p>
        </div>
      )}

      {/* Attached photos — conditional on non-empty array + SENDHUB-04 resolver gate */}
      {isSectionVisible(resolvedSettings, 'photos') && data.attachedPhotos && data.attachedPhotos.length > 0 && (
        <div data-track-section="photos" className="px-8 sm:px-12 pb-8 pt-2 border-t border-[#e4e4e7]">
          <p className={`${EYEBROW} mb-3`}>
            {L.photos}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.attachedPhotos.map((photo) => (
              <div key={photo.id}>
                <div className="aspect-square overflow-hidden rounded-lg relative border border-[#e4e4e7]">
                  {photo.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.url}
                      alt={photo.caption ?? ''}
                      className="object-cover w-full h-full"
                    />
                  ) : null}
                </div>
                {photo.caption && (
                  <p className={`mt-1.5 text-xs ${SECONDARY} line-clamp-2`}>{photo.caption}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
