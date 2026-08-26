import Image from 'next/image'
import { formatMoney } from '@/lib/money/currency'
import { formatPhoneForDisplay } from '@/lib/phone/format'
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
// Modern share-page document — editorial serif styling, VIEW-ONLY.
//
// This is a brand-new, self-contained component. It consumes the exact same
// already-computed EstimateDocumentData/DocumentCompany/DocumentClient props
// that estimate-view.tsx already builds for Classic's <EstimateDocument
// mode="view">, and reuses the same pure helpers (deriveDepositDisplay,
// ensureReadableOnWhite, readableTextColor, formatMoney, formatPhoneForDisplay)
// — same totals/conditionals/order as Classic. Only JSX/Tailwind styling
// differs: font-serif, hairline rules instead of brand-color fills, a hero
// total, and more generous whitespace.
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
import { formatAddress, formatDate } from '@/lib/estimate/document/format'

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
  const hasTerms =
    (isSectionVisible(resolvedSettings, 'payment_terms') && data.payment_terms != null) ||
    (isSectionVisible(resolvedSettings, 'timeline') && data.timeline != null) ||
    (isSectionVisible(resolvedSettings, 'warranty_terms') && data.warranty_terms != null) ||
    (isSectionVisible(resolvedSettings, 'notes') && data.notes != null)

  return (
    <div
      className="font-serif rounded-3xl border shadow-lg overflow-hidden"
      style={{
        backgroundColor: '#ffffff',
        colorScheme: 'light',
        color: 'hsl(240 10% 3.9%)',
        borderColor: '#e4e4e7',
      }}
    >
      {/* Company header — thin hairline rule instead of Classic's brand-filled top border */}
      <div
        data-track-section="header"
        className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 px-8 sm:px-12 py-8 border-b border-t"
        style={{ borderTopColor: brandColor, borderBottomColor: '#e4e4e7' }}
      >
        <div className="min-w-0">
          <p className="font-bold text-lg leading-tight">{company.name}</p>
          {company.owner_name && (
            <p className="text-xs text-muted-foreground mt-0.5">{company.owner_name}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            {[
              company.phone && formatPhoneForDisplay(company.phone),
              company.email,
              company.website,
            ]
              .filter(Boolean)
              .join('  ·  ')}
          </p>
          {companyAddr && (
            <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">
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
              className="rounded object-contain"
              unoptimized
            />
          </div>
        )}
      </div>

      {/* ESTIMATE title — small, letter-spaced, left-aligned, thin rule underneath */}
      <div className="px-8 sm:px-12 pt-8">
        <h1
          className="text-sm font-semibold tracking-[0.2em] select-none"
          style={{ color: brandText }}
        >
          {L.estimate}
        </h1>
        <div className="mt-3 border-t" style={{ borderTopColor: '#e4e4e7' }} />
      </div>

      {/* Info grid: PROJECT | BILL TO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 px-8 sm:px-12 pt-8 pb-6 border-b border-border/50">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
            {L.project}
          </p>
          <p className="text-2xl font-bold">{projectName}</p>
          {projectType && (
            <p className="text-base text-muted-foreground mt-2 capitalize">
              {projectType.replace(/_/g, ' ')}
            </p>
          )}
          <p className="text-base text-muted-foreground mt-3">
            {L.date}: {formatDate(data.estimate_date ?? estimateCreatedAt, lang)}
          </p>
          <p className="text-base text-muted-foreground mt-2 tabular-nums">
            {L.estimateNum}
            {data.estimate_number ?? defaultEstimateNumber}
          </p>
        </div>

        {client && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
              {L.billTo}
            </p>
            <div className="space-y-0.5">
              <p className="text-2xl font-bold">{client.name}</p>
              {client.email && (
                <p className="text-base text-muted-foreground mt-1">{client.email}</p>
              )}
              {client.phone && (
                <p className="text-base text-muted-foreground">
                  {formatPhoneForDisplay(client.phone)}
                </p>
              )}
              {clientAddr && (
                <p className="text-base text-muted-foreground whitespace-pre-line">{clientAddr}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Summary — conditional on data.summary + SENDHUB-04 resolver gate */}
      {isSectionVisible(resolvedSettings, 'summary') && data.summary != null && (
        <div className="px-8 sm:px-12 py-6 border-b border-border/50">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
            {L.summary}
          </p>
          <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">
            {data.summary}
          </p>
        </div>
      )}

      {/* Sections */}
      <div data-track-section="line-items" className="divide-y divide-border/50">
        {visibleSections.map((section) => (
          <div key={section.id}>
            {/* Section header — plain serif text with thin bottom border, no brand fill */}
            <div
              className="px-8 sm:px-12 pt-6 pb-2 border-b"
              style={{ borderBottomColor: '#e4e4e7' }}
            >
              <span className="font-semibold text-base tracking-wide select-none" style={{ color: brandText }}>
                {section.title}
              </span>
            </div>

            {/* Mobile: stacked cards */}
            <div className="sm:hidden">
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className="px-8 py-3 mx-6 my-1.5 rounded-lg border border-[#e4e4e7]"
                >
                  <p className="text-base font-medium">{item.description}</p>
                  <div className="flex justify-between text-sm text-muted-foreground mt-0.5">
                    <span>
                      {item.quantity} {item.unit ? item.unit : ''} ×{' '}
                      {formatMoney(item.unit_price, data.currency_code)}
                    </span>
                    <span className="font-medium text-foreground tabular-nums">
                      {formatMoney(item.total, data.currency_code)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table with hairline dividers, no zebra striping */}
            <div className="hidden sm:block overflow-x-auto px-8 sm:px-12">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b" style={{ borderBottomColor: '#e4e4e7' }}>
                    <th className="py-2 px-0 text-left font-medium w-[40%]">{L.description}</th>
                    <th className="py-2 px-2 w-[12%] text-center font-medium">{L.qty}</th>
                    <th className="py-2 px-2 w-[13%] text-center font-medium">{L.unit}</th>
                    <th className="py-2 px-2 w-[17%] text-right font-medium">{L.unitPrice}</th>
                    <th className="py-2 px-0 w-[18%] text-right font-medium">{L.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0" style={{ borderBottomColor: '#e4e4e7' }}>
                      <td className="py-3 px-0 text-base">{item.description}</td>
                      <td className="py-3 px-2 text-base text-center tabular-nums">{item.quantity}</td>
                      <td className="py-3 px-2 text-base text-center">{item.unit ?? ''}</td>
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

            {/* Section subtotal */}
            <div className="flex justify-end items-center gap-3 px-8 sm:px-12 py-3">
              <span className="text-sm text-muted-foreground select-none">{L.sectionSubtotal}</span>
              <span className="text-sm font-semibold tabular-nums">
                {formatMoney(section.subtotal, data.currency_code)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Totals — hero grand total, hairline separators, generous margin */}
      <div data-track-section="totals" className="px-8 sm:px-12 py-8 border-t" style={{ borderTopColor: '#e4e4e7' }}>
        <div className="flex justify-end">
          <div className="w-full max-w-sm space-y-3">
            <div className="flex justify-between text-base">
              <span className="text-muted-foreground select-none">{L.subtotal}</span>
              <span className="tabular-nums font-medium">{fmt(data.subtotal)}</span>
            </div>

            {data.discount_amount > 0 && (
              <div className="flex justify-between text-base">
                <span className="text-muted-foreground select-none">
                  {L.discount}
                  {isPercentageDiscount(data.discount_type) ? ` (${data.discount_value}%)` : ''}
                </span>
                <span className="tabular-nums font-medium">-{fmt(data.discount_amount)}</span>
              </div>
            )}

            {data.tax_amount > 0 && (
              <div className="flex justify-between text-base">
                <span className="text-muted-foreground select-none">
                  {L.tax} ({(data.tax_rate * 100).toFixed(2)}%)
                </span>
                <span className="tabular-nums font-medium">{fmt(data.tax_amount)}</span>
              </div>
            )}

            {dep.showDeposit && (
              <div className="flex justify-between text-base">
                <span className="text-muted-foreground select-none">{L.deposit}</span>
                <span className="tabular-nums text-muted-foreground font-medium">
                  -{fmt(dep.depositAmount)}
                </span>
              </div>
            )}

            {dep.showDeposit && (
              <div className="flex justify-between items-baseline pt-2 border-t" style={{ borderTopColor: '#e4e4e7' }}>
                <span className="text-base font-semibold text-muted-foreground select-none">
                  {L.balanceDue}
                </span>
                <span className="text-base font-semibold tabular-nums">{fmt(dep.balanceDue)}</span>
              </div>
            )}

            {/* Grand total — large standalone "hero" number, generous margin */}
            <div className="pt-6 mt-3 border-t-2" style={{ borderTopColor: brandColor }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none mb-2">
                {L.grandTotal}
              </p>
              <p className="text-4xl sm:text-5xl font-bold tabular-nums" style={{ color: brandText }}>
                {fmt(data.total)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Terms — each block only when filled */}
      {hasTerms && (
        <div data-track-section="terms" className="px-8 sm:px-12 pb-8 pt-2 border-t border-border/50 space-y-6">
          {isSectionVisible(resolvedSettings, 'payment_terms') && data.payment_terms != null && (
            <div className="border-l-2 pl-4" style={{ borderLeftColor: brandColor }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none mb-1.5">
                {L.paymentTerms}
              </p>
              <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">
                {data.payment_terms}
              </p>
            </div>
          )}
          {isSectionVisible(resolvedSettings, 'timeline') && data.timeline != null && (
            <div data-track-section="timeline" className="border-l-2 pl-4" style={{ borderLeftColor: brandColor }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none mb-1.5">
                {L.timeline}
              </p>
              <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">
                {data.timeline}
              </p>
            </div>
          )}
          {isSectionVisible(resolvedSettings, 'warranty_terms') && data.warranty_terms != null && (
            <div className="border-l-2 pl-4" style={{ borderLeftColor: brandColor }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none mb-1.5">
                {L.warranty}
              </p>
              <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">
                {data.warranty_terms}
              </p>
            </div>
          )}
          {isSectionVisible(resolvedSettings, 'notes') && data.notes != null && (
            <div className="border-l-2 pl-4" style={{ borderLeftColor: brandColor }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none mb-1.5">
                {L.notes}
              </p>
              <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">
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
        <div data-track-section="signature" className="px-8 sm:px-12 pb-8 pt-2 border-t border-border/50">
          <div className="border-l-2 pl-4" style={{ borderLeftColor: brandColor }}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 select-none">
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
                <p className="text-base font-semibold">{data.signature.signerName}</p>
                <p className="text-base text-muted-foreground">{formatDate(data.signature.signedAt, lang)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attached photos — conditional on non-empty array + SENDHUB-04 resolver gate */}
      {isSectionVisible(resolvedSettings, 'photos') && data.attachedPhotos && data.attachedPhotos.length > 0 && (
        <div data-track-section="photos" className="px-8 sm:px-12 pb-8 pt-2 border-t border-border/50">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 select-none">
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
                  <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{photo.caption}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
