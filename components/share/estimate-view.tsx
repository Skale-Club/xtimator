'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
}: EstimateViewProps) {
  const { t } = useTranslation()
  const [responding, setResponding] = useState<'accepted' | 'declined' | null>(null)
  const [responded, setResponded] = useState(alreadyResponded)
  const [responseValue, setResponseValue] = useState<string | null>(estimate.client_response)
  const [error, setError] = useState<string | null>(null)
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [isSubmittingSignature, setIsSubmittingSignature] = useState(false)

  const requiresSignature = estimate.company.digital_signature_enabled && !alreadyResponded
  const { company, project } = estimate
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

  // ---------------------------------------------------------------------------
  // Respond handlers
  // ---------------------------------------------------------------------------

  async function handleRespond(response: 'accepted' | 'declined') {
    if (requiresSignature && response === 'accepted') {
      setShowSignaturePad(true)
      return
    }
    setResponding(response)
    setError(null)
    const result = await respondToEstimate(token, response)
    if (result.success) {
      setResponded(true)
      setResponseValue(response)
    } else {
      setError(result.error ?? t('Something went wrong'))
    }
    setResponding(null)
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

  return (
    <div className="space-y-4">
      {/* Language chip — floated above the document */}
      {estimate.language && estimate.language !== 'en' && (
        <div className="flex justify-end">
          <LanguageFlagChip lang={estimate.language} />
        </div>
      )}

      {/* Document body — registry-resolved templateId selects Classic vs Modern */}
      {templateId === 'modern' ? (
        <EstimateDocumentModern
          data={documentData}
          company={documentCompany}
          client={documentClient}
          projectName={project.name}
          projectType={project.project_type}
          language={(estimate.language ?? 'en') as EstimateLanguage}
          estimateVersion={estimate.version}
          estimateSeq={estimate.estimate_seq}
          estimateCreatedAt={estimate.created_at}
        />
      ) : (
        <EstimateDocument
          mode="view"
          data={documentData}
          company={documentCompany}
          client={documentClient}
          projectName={project.name}
          projectType={project.project_type}
          language={(estimate.language ?? 'en') as EstimateLanguage}
          estimateVersion={estimate.version}
          estimateSeq={estimate.estimate_seq}
          estimateCreatedAt={estimate.created_at}
        />
      )}

      {/* Estimate Terms (company-level) */}
      {estimate.company.estimate_terms_enabled && estimate.company.estimate_terms_text && (
        <Card variant="glass">
          <CardContent className="p-4 sm:p-6">
            <h3
              className="text-sm font-semibold uppercase tracking-wider mb-3"
              style={{ color: brandText }}
            >
              {t('Estimate Terms')}
            </h3>
            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
              {estimate.company.estimate_terms_text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Phase 94 — issued-invoice pay links. Open invoices get a "Pay" button to
          the Stripe-hosted invoice page; paid invoices show a muted confirmation. */}
      {estimate.invoices.length > 0 && (
        <Card variant="glass">
          <CardContent className="p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5" style={{ color: brandText }} />
              <h3 className="text-base font-semibold">{t('Invoices')}</h3>
            </div>
            <div className="space-y-3">
              {estimate.invoices.map((inv) => {
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signature pad */}
      {showSignaturePad && !responded && (
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-2">
              <PenLine className="h-5 w-5" style={{ color: brandText }} />
              <h3 className="text-base font-semibold">{t('Sign to accept this estimate')}</h3>
            </div>
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
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={handleSignAndAccept}
                disabled={isSubmittingSignature || !signerName.trim() || !signatureData}
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
                onClick={() => { setShowSignaturePad(false); setError(null) }}
                disabled={isSubmittingSignature}
              >
                {t('Cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Accept / Decline CTA — lives outside the document surface (P10)    */}
      {/* ------------------------------------------------------------------ */}
      {!showSignaturePad && (
        <Card variant="glass">
          <CardContent className="p-6 sm:p-8">
            {responded ? (
              <div className="text-center space-y-2">
                {responseValue === 'accepted' ? (
                  <>
                    <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                    <p className="text-lg font-semibold text-green-700">{t('Estimate Accepted')}</p>
                    <p className="text-sm text-muted-foreground">
                      {estimate.responded_at
                        ? t(`You accepted this estimate on ${new Date(estimate.responded_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
                        : t('Thank you for accepting this estimate')}
                    </p>
                  </>
                ) : (
                  <>
                    <XCircle className="mx-auto h-12 w-12 text-red-500" />
                    <p className="text-lg font-semibold text-red-700">{t('Estimate Declined')}</p>
                    <p className="text-sm text-muted-foreground">
                      {estimate.responded_at
                        ? t(`You declined this estimate on ${new Date(estimate.responded_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
                        : t('This estimate has been declined')}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  {t('Please review the estimate above and accept or decline.')}
                </p>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex flex-col sm:flex-row justify-center gap-3">
                  <Button
                    size="lg"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleRespond('accepted')}
                    disabled={responding !== null}
                  >
                    {responding === 'accepted' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    {t('Accept Estimate')}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => handleRespond('declined')}
                    disabled={responding !== null}
                  >
                    {responding === 'declined' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-2 h-4 w-4" />
                    )}
                    {t('Decline Estimate')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      {!whiteLabelMode && (
        <div className="text-center text-xs text-muted-foreground pb-8">
          <p>
            {t('Generated by')} <span className="font-medium">{appName}</span>
          </p>
        </div>
      )}
    </div>
  )
}
