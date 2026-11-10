'use client'

import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle, XCircle, Loader2, PenLine, Receipt, ExternalLink } from 'lucide-react'
import { respondToEstimate } from '@/app/estimate/[token]/actions'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { ensureReadableOnWhite, readableTextColor } from '@/lib/color/contrast'
import type { ShareEstimateData } from '@/lib/queries/share'
import { useTranslation } from '@/lib/i18n/use-translation'
import { ScopedLanguageProvider, type Language } from '@/lib/i18n/language-context'
import { formatMinorUnits } from '@/lib/money/currency'
import type { ComponentType } from 'react'
import { FlagUS, FlagBR, FlagES } from '@/components/app-shell/flags'
import { LANGUAGE_LABELS, type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { SignaturePad } from '@/components/share/signature-pad'
import { ProposalBar } from '@/components/share/proposal-bar'
import { formatDate, formatEstimateNumber } from '@/lib/estimate/document/format'
import { useEstimateTracking } from '@/hooks/use-estimate-tracking'
import type {
  EstimateDocumentData,
  DocumentCompany,
  DocumentClient,
} from '@/components/workspace/estimate/estimate-document'
import {
  type EstimateTemplateId,
  isEstimateTemplateId,
  DEFAULT_ESTIMATE_TEMPLATE_ID,
} from '@/lib/estimate/templates/registry'

// The public recipient page only ever renders ONE template. Statically
// importing both shipped the classic editor (2k LOC + @dnd-kit) AND the modern
// renderer to every visitor. next/dynamic splits each into its own chunk so
// only the selected template's code is fetched. SSR stays enabled (default) so
// the document still renders server-side for the recipient / SEO; dynamic
// nonetheless code-splits the client chunk. A skeleton covers the client
// hydration/lazy-load window.
function DocumentSkeleton() {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-6" aria-busy>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

const EstimateDocument = dynamic(
  () =>
    import('@/components/workspace/estimate/estimate-document').then(
      (m) => m.EstimateDocument
    ),
  { loading: () => <DocumentSkeleton /> }
)

const EstimateDocumentModern = dynamic(
  () =>
    import('@/components/share/estimate-document-modern').then(
      (m) => m.EstimateDocumentModern
    ),
  { loading: () => <DocumentSkeleton /> }
)

const FLAG_MAP_LANG: Record<string, ComponentType<{ className?: string }>> = {
  en: FlagUS,
  pt: FlagBR,
  es: FlagES,
}

function LanguageFlagChip({ lang }: { lang: string | null | undefined }) {
  if (!lang) return null
  const F = FLAG_MAP_LANG[lang] ?? FlagUS
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-border/50 bg-muted/30 text-xs text-foreground/80">
      <F className="h-3.5 w-3.5 rounded-[2px]" />
      {LANGUAGE_LABELS[lang as EstimateLanguage] ?? lang.toUpperCase()}
    </span>
  )
}

interface EstimateViewProps {
  estimate: ShareEstimateData['estimate']
  client: ShareEstimateData['client']
  token: string
  alreadyResponded: boolean
  appName: string
  whiteLabelMode?: boolean
  /** "Prepared by" name, resolved server-side with the PDF's rule
   *  (company_members.display_name of the creator, else company.owner_name). */
  preparedBy?: string | null
  /** The owner (or a teammate) is previewing their own link: show a banner and
   *  skip engagement tracking so the visit never reaches Insights. */
  ownerPreview?: boolean
}

// Pre-launch audit fix: an anonymous client's browser has no prior
// LanguageProvider preference, so without this scoped override every
// t() call below rendered in English regardless of estimate.language —
// the language the contractor actually sent the estimate in. Scoping the
// override HERE (rather than in EstimateViewInner) is required: a
// component can't consume a context provider it renders itself.
export function EstimateView(props: EstimateViewProps) {
  const language = (props.estimate.language ?? 'en') as Language
  return (
    <ScopedLanguageProvider language={language} setLanguage={() => {}}>
      <EstimateViewInner {...props} />
    </ScopedLanguageProvider>
  )
}

function EstimateViewInner({
  estimate,
  client,
  token,
  alreadyResponded,
  appName,
  whiteLabelMode = false,
  preparedBy = null,
  ownerPreview = false,
}: EstimateViewProps) {
  const { t } = useTranslation()
  const [responding, setResponding] = useState(false)
  const [responded, setResponded] = useState(alreadyResponded)
  const [responseValue, setResponseValue] = useState<string | null>(estimate.client_response)
  const [error, setError] = useState<string | null>(null)
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [confirmingDecline, setConfirmingDecline] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [isSubmittingSignature, setIsSubmittingSignature] = useState(false)

  // Phase 193-01 — scoped to the rendered document surface only (not the
  // whole page: the proposal bar, invoice cards, etc. live outside it), so
  // click coordinates and doc_h stay meaningful for a future heatmap overlay.
  const documentContainerRef = useRef<HTMLDivElement | null>(null)
  useEstimateTracking({ token, containerRef: documentContainerRef, enabled: !ownerPreview })

  const { company, project } = estimate
  // Online approval exists ONLY when the company requires a digital signature.
  // When off, the contractor records the response inside the app and this page
  // renders no accept/decline UI at all. When on, Accept means sign.
  const approvalEnabled = company.digital_signature_enabled === true
  const canRespond = approvalEnabled && !responded
  const brandColor = company.brand_primary_color ?? SYSTEM_COLORS.primary
  // Render-time WCAG adaptation (stored brand color never mutated):
  const brandText = ensureReadableOnWhite(brandColor) // brand color as text on white
  const brandOnFill = readableTextColor(brandColor) // fixed foreground over a brand fill

  // ---------------------------------------------------------------------------
  // Convert to EstimateDocument types
  // ---------------------------------------------------------------------------

  const documentCompany: DocumentCompany = {
    name: company.name,
    owner_name: company.owner_name,
    phone: company.phone,
    email: company.email,
    website: company.website,
    address: company.address,
    city: company.city,
    state: company.state,
    zip: company.zip,
    logo_url: company.logo_url,
    brand_primary_color: company.brand_primary_color,
  }

  const documentClient: DocumentClient | null = client
    ? {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        city: client.city,
        state: client.state,
        zip: client.zip,
      }
    : null

  const documentData: EstimateDocumentData = {
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
    // v4.11 deposit — read the server row with retrocompat no-op defaults. The
    // full share-doc deposit rendering is Phase 134; here we just feed the type
    // so the document surface doesn't crash. balance_due defaults to total so
    // the view-mode Balance Due line stays hidden (byte-identical) until set.
    deposit_type: (estimate as { deposit_type?: string }).deposit_type ?? 'none',
    deposit_value: (estimate as { deposit_value?: number | null }).deposit_value ?? null,
    deposit: (estimate as { deposit?: number | null }).deposit ?? 0,
    balance_due: (estimate as { balance_due?: number | null }).balance_due ?? estimate.total,
    currency_code: estimate.currency_code ?? 'USD',
    estimate_date: (estimate as { estimate_date?: string | null }).estimate_date ?? null,
    valid_until: (estimate as { valid_until?: string | null }).valid_until ?? null,
    estimate_number: (estimate as { estimate_number?: string | null }).estimate_number ?? null,
    // Phase 162-04 (DOCUX-01) — thread persisted overrides to the classic
    // share renderer so hidden sections stay hidden. Phase 163 will wire the
    // same into the send-hub PDF/plain-text renderers; here we just feed
    // EstimateDocument so its resolver call gates section visibility. NULL
    // preserves today's byte-identical behavior (all sections visible).
    presentation_settings:
      (estimate as { presentation_settings?: unknown }).presentation_settings as
        | import('@/lib/estimate/presentation-settings').PresentationSettings
        | null
        | undefined ?? null,
    // PDFPAR-02 — guard on BOTH signerName and signatureImageDataUrl being
    // non-null, mirroring the same-shape guard render-estimate-pdf.ts uses
    // (Plan 183-02): a row can theoretically have one without the other only
    // in malformed data, never trust partial presence.
    signature:
      estimate.signerName && estimate.signatureImageDataUrl
        ? {
            signerName: estimate.signerName,
            signedAt: estimate.signedAt ?? estimate.responded_at ?? estimate.created_at,
            signatureDataUrl: estimate.signatureImageDataUrl,
          }
        : null,
    // Signed URLs are already resolved server-side in lib/queries/share.ts
    // (getEstimateByShareToken) — anon visitors have no session to call
    // getSignedUrl with, so no client-side resolution happens here.
    attachedPhotos:
      (
        estimate as unknown as {
          attachedPhotos?: {
            id: string
            storage_path: string
            caption: string | null
            url: string
          }[]
        }
      ).attachedPhotos ?? [],
    sections: estimate.sections.map((s) => ({
      id: s.id,
      title: s.title,
      subtotal: s.subtotal,
      items: s.items.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        total: i.total,
        price_source: i.price_source,
      })),
    })),
  }

  // Registry-resolved templateId — guarded via isEstimateTemplateId, never a raw
  // string comparison. Legacy/unrecognized values fall back to the default (classic).
  const templateId: EstimateTemplateId = isEstimateTemplateId(
    estimate.company.estimate_template_style
  )
    ? estimate.company.estimate_template_style
    : DEFAULT_ESTIMATE_TEMPLATE_ID

  // Only invoices this view can actually ACT on: a paid one (confirmation) or
  // an open one carrying its hosted link. Deriving the list before the card
  // decides to render is what keeps an "Invoices" heading from appearing over
  // empty space (an open invoice whose hosted_invoice_url has not landed yet
  // used to produce exactly that). Actionable rows sort first.
  const renderableInvoices = estimate.invoices
    .filter((inv) => inv.status === 'paid' || (inv.status === 'open' && !!inv.hosted_invoice_url))
    .slice()
    .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1))

  // Amount still uninvoiced (e.g. the deposit was paid but the balance invoice
  // has not been issued yet). Without this line the customer sees "Paid:
  // deposit — $X" and no statement of what remains.
  // Sum EVERY active invoice, not just the renderable ones: an issued invoice
  // whose hosted link has not landed yet is still money already invoiced, and
  // counting only the rendered rows would overstate what remains.
  const invoicedCents = estimate.invoices
    .filter((inv) => inv.status !== 'void' && inv.status !== 'uncollectible')
    .reduce((sum, inv) => sum + (inv.amount_cents ?? 0), 0)
  const uninvoicedCents = Math.max(0, (estimate.total_amount_cents ?? 0) - invoicedCents)

  // Company "Estimate Terms" now render INSIDE the document (first terms card),
  // exactly as in the PDF/preview, so the public page and the PDF carry the
  // same content. Passed identically to both templates.
  const companyTerms = {
    enabled: company.estimate_terms_enabled ?? false,
    text: company.estimate_terms_text ?? null,
  }

  const lang = (estimate.language ?? 'en') as EstimateLanguage
  const total = formatMinorUnits(estimate.total_amount_cents ?? 0, estimate.currency_code ?? 'USD')
  // Same values/formatting the document header shows.
  const estimateNumber = formatEstimateNumber({
    estimate_number: documentData.estimate_number ?? null,
    estimate_seq: estimate.estimate_seq,
  })
  const estimateDate = formatDate(documentData.estimate_date ?? estimate.created_at, lang)
  const respondedOn = estimate.responded_at ? formatDate(estimate.responded_at, lang) : null

  function openSignature() {
    setError(null)
    setConfirmingDecline(false)
    setShowSignaturePad(true)
  }

  function closeSignature() {
    if (isSubmittingSignature || responding) return
    setShowSignaturePad(false)
    setConfirmingDecline(false)
    setError(null)
  }

  // ---------------------------------------------------------------------------
  // Respond handlers
  // ---------------------------------------------------------------------------

  // Decline is the only response that goes through respondToEstimate; acceptance
  // always goes through the sign route (handleSignAndAccept).
  async function handleDecline() {
    setResponding(true)
    setError(null)
    const result = await respondToEstimate(token, 'declined')
    if (result.success) {
      setResponded(true)
      setResponseValue('declined')
      setShowSignaturePad(false)
      setConfirmingDecline(false)
    } else {
      setError(result.error ?? t('Something went wrong'))
    }
    setResponding(false)
  }

  async function handleSignAndAccept() {
    if (!signerName.trim()) { setError('Please enter your full name.'); return }
    if (!signatureData) { setError('Please draw your signature.'); return }
    setIsSubmittingSignature(true)
    setError(null)
    try {
      const res = await fetch(`/api/estimates/${estimate.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signerName: signerName.trim(),
          signerEmail: signerEmail.trim() || undefined,
          signatureData,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to submit signature')
      }
      // sign_estimate_atomic already committed client_response='accepted' as
      // part of the sign transaction — calling respondToEstimate here would
      // deterministically hit its already-responded guard and surface an
      // error banner on a SUCCESSFUL signature. A 200 from the sign endpoint
      // IS acceptance; just reflect it.
      setResponded(true)
      setResponseValue('accepted')
      setShowSignaturePad(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Something went wrong'))
    } finally {
      setIsSubmittingSignature(false)
    }
  }

  const showMobileAcceptBar = canRespond && !showSignaturePad
  const isAccepted = responseValue === 'accepted'

  return (
    <div
      className={
        // Keep the last content clear of the fixed mobile bar (+ iOS home indicator).
        showMobileAcceptBar
          ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-0'
          : undefined
      }
    >
      {ownerPreview && (
        <div className="mx-auto mt-2 max-w-4xl rounded-md border border-border bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
          {t("You're viewing your own estimate. This visit isn't counted in Insights.")}
        </div>
      )}
      <ProposalBar
        companyName={company.name}
        logoUrl={company.logo_url}
        phone={company.phone}
        email={company.email}
        estimateNumber={estimateNumber}
        estimateDate={estimateDate}
        total={total}
        brandText={brandText}
        showAccept={canRespond}
        onAccept={openSignature}
        trailing={
          estimate.language && estimate.language !== 'en' ? (
            <span className="hidden sm:block">
              <LanguageFlagChip lang={estimate.language} />
            </span>
          ) : null
        }
      />

      <div className="space-y-4 pt-4">
        {/* Document body — registry-resolved templateId selects Classic vs Modern.
            Wrapped in a ref'd div (not the outer page) so use-estimate-tracking's
            click/section/heatmap coordinates are measured against the rendered
            document surface only. The soft shadow lifts the white paper off the
            grey stage. */}
        <div
          ref={documentContainerRef}
          className="rounded-lg shadow-[0_1px_3px_rgba(15,23,42,0.10),0_10px_30px_-10px_rgba(15,23,42,0.25)]"
        >
          {templateId === 'modern' ? (
            <EstimateDocumentModern
              data={documentData}
              company={documentCompany}
              client={documentClient}
              projectName={project.name}
              projectType={project.project_type}
              language={lang}
              estimateVersion={estimate.version}
              estimateSeq={estimate.estimate_seq}
              estimateCreatedAt={estimate.created_at}
              preparedBy={preparedBy}
              companyTerms={companyTerms}
            />
          ) : (
            <EstimateDocument
              mode="view"
              data={documentData}
              company={documentCompany}
              client={documentClient}
              projectName={project.name}
              projectType={project.project_type}
              language={lang}
              estimateVersion={estimate.version}
              estimateSeq={estimate.estimate_seq}
              estimateCreatedAt={estimate.created_at}
              preparedBy={preparedBy}
              companyTerms={companyTerms}
            />
          )}
        </div>

        {/* Response status. Online approval ON: compact confirmation. OFF: only a
            small neutral line when the contractor already recorded a response
            inside the app. Never a card with buttons. */}
        {responded && (
          <div
            data-testid="response-status"
            className={
              approvalEnabled
                ? 'flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-3 text-sm'
                : 'text-center text-sm text-white/75'
            }
          >
            {approvalEnabled &&
              (isAccepted ? (
                <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 shrink-0 text-red-500" />
              ))}
            <span className={approvalEnabled ? 'font-medium' : undefined}>
              {approvalEnabled
                ? isAccepted
                  ? t('Estimate Accepted')
                  : t('Estimate Declined')
                : isAccepted
                  ? t('Accepted on')
                  : t('Declined on')}
              {!approvalEnabled && respondedOn ? ` ${respondedOn}` : ''}
            </span>
            {approvalEnabled && respondedOn && (
              <span className="text-muted-foreground">· {respondedOn}</span>
            )}
          </div>
        )}

        {/* Phase 94 — issued-invoice pay links. Open invoices get a "Pay" button to
            the Stripe-hosted invoice page; paid invoices show a muted confirmation. */}
        {renderableInvoices.length > 0 && (
          <Card variant="glass">
            <CardContent className="p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5" style={{ color: brandText }} />
                <h3 className="text-base font-semibold">{t('Invoices')}</h3>
              </div>
              <div className="space-y-3">
                {renderableInvoices.map((inv) => {
                  const amount = formatMinorUnits(inv.amount_cents, inv.currency_code)
                  const kindLabel =
                    inv.kind === 'deposit'
                      ? t('deposit')
                      : inv.kind === 'balance'
                        ? t('balance')
                        : t('invoice')

                  if (inv.status === 'paid') {
                    return (
                      <div
                        key={inv.id}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>
                          {t('Paid')}: {kindLabel} — {amount}
                        </span>
                      </div>
                    )
                  }

                  if (inv.status === 'open' && inv.hosted_invoice_url) {
                    return (
                      <Button
                        key={inv.id}
                        asChild
                        size="lg"
                        className="w-full sm:w-auto"
                        style={{ backgroundColor: brandColor, color: brandOnFill }}
                      >
                        <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {t('Pay')} {kindLabel} — {amount}
                        </a>
                      </Button>
                    )
                  }

                  return null
                })}

                {uninvoicedCents > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t('Remaining, not yet invoiced')}:{' '}
                    {formatMinorUnits(uninvoicedCents, estimate.currency_code ?? 'USD')}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        {!whiteLabelMode && (
          <div className="pb-2 text-center text-xs text-white/55">
            <p>
              {t('Generated by')} <span className="font-medium">{appName}</span>
            </p>
          </div>
        )}
      </div>

      {/* Signature step — overlay panel opened by Accept. Accept means sign. */}
      {approvalEnabled && (
        <Dialog open={showSignaturePad && !responded} onOpenChange={(open) => !open && closeSignature()}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <PenLine className="h-5 w-5" style={{ color: brandText }} />
                {t('Sign to accept this estimate')}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t('By signing, you agree to the pricing and terms in this estimate.')}
              </DialogDescription>
            </DialogHeader>
            <SignaturePad
              signerName={signerName}
              onSignerNameChange={setSignerName}
              signerEmail={signerEmail}
              onSignerEmailChange={setSignerEmail}
              onSignatureChange={setSignatureData}
              brandColor={brandColor}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-xs text-muted-foreground">
              {t('By signing, you agree to the pricing and terms in this estimate.')}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="bg-green-600 text-white hover:bg-green-700"
                onClick={handleSignAndAccept}
                disabled={isSubmittingSignature || responding || !signerName.trim() || !signatureData}
              >
                {isSubmittingSignature ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                {t('Sign & Accept Estimate')}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={closeSignature}
                disabled={isSubmittingSignature || responding}
              >
                {t('Cancel')}
              </Button>
            </div>

            {/* Discreet decline — asks for confirmation before anything is sent. */}
            <div className="border-t border-border pt-3 text-center">
              {confirmingDecline ? (
                <div className="space-y-2" data-testid="decline-confirm">
                  <p className="text-sm font-medium">{t('Decline this estimate?')}</p>
                  <div className="flex justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                      onClick={handleDecline}
                      disabled={responding}
                    >
                      {responding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('Yes, decline')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmingDecline(false)}
                      disabled={responding}
                    >
                      {t('Keep reviewing')}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() => setConfirmingDecline(true)}
                  disabled={isSubmittingSignature}
                >
                  {t('Decline estimate')}
                </button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Mobile-only sticky Accept bar (bottom is thumb-reachable). Opens the
          signature panel; hidden while it is open. */}
      {showMobileAcceptBar && (
        <div
          data-testid="mobile-accept-bar"
          className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden"
        >
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t('Total')}</p>
            <p
              className="truncate text-lg font-semibold leading-tight tabular-nums"
              style={{ color: brandText }}
            >
              {total}
            </p>
          </div>
          <Button
            size="lg"
            className="shrink-0 whitespace-nowrap bg-green-600 text-white hover:bg-green-700"
            onClick={openSignature}
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            {t('Accept Estimate')}
          </Button>
        </div>
      )}
    </div>
  )
}
