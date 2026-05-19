'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, XCircle, Loader2, PenLine } from 'lucide-react'
import { respondToEstimate } from '@/app/estimate/[token]/actions'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { formatCurrency } from '@/lib/utils/format'
import type { ShareEstimateData } from '@/lib/queries/share'
import { PayNowButton } from '@/components/estimate/pay-now-button'
import {
  PaymentSuccessBanner,
  PaymentCanceledNotice,
} from '@/components/estimate/payment-success-banner'
import { useTranslation } from '@/lib/i18n/use-translation'
import { SignaturePad } from '@/components/share/signature-pad'

interface EstimateViewProps {
  estimate: ShareEstimateData['estimate']
  client: ShareEstimateData['client']
  token: string
  alreadyResponded: boolean
  appName: string
  whiteLabelMode?: boolean
  /** Phase 70 — return state from Stripe Checkout redirect (?stripe=success|canceled). */
  stripeState?: 'success' | 'canceled' | null
}

export function EstimateView({
  estimate,
  client,
  token,
  alreadyResponded,
  appName,
  whiteLabelMode = false,
  stripeState = null,
}: EstimateViewProps) {
  const { t } = useTranslation()
  const [responding, setResponding] = useState<'accepted' | 'declined' | null>(null)
  const [responded, setResponded] = useState(alreadyResponded)
  const [responseValue, setResponseValue] = useState<string | null>(
    estimate.client_response
  )
  const [error, setError] = useState<string | null>(null)
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [isSubmittingSignature, setIsSubmittingSignature] = useState(false)

  const requiresSignature = estimate.company.digital_signature_enabled && !alreadyResponded

  const { company, project } = estimate
  const brandColor = company.brand_primary_color ?? SYSTEM_COLORS.primary

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
    if (!signerName.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (!signatureData) {
      setError('Please draw your signature.')
      return
    }

    setIsSubmittingSignature(true)
    setError(null)

    try {
      const res = await fetch(`/api/estimates/${estimate.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signerName: signerName.trim(),
          signatureData,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to submit signature')
      }

      const result = await respondToEstimate(token, 'accepted')
      if (result.success) {
        setResponded(true)
        setResponseValue('accepted')
        setShowSignaturePad(false)
      } else {
        setError(result.error ?? t('Something went wrong'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Something went wrong'))
    } finally {
      setIsSubmittingSignature(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Phase 71-09: glass header card with 3px gradient-brand top edge that
          cascades tenant --platform-primary (overrides the previous solid
          border-t-4 styled by inline brandColor). */}
      <Card
        variant="glass"
        className="relative overflow-hidden before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:gradient-brand"
      >
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              {company.logo_url && (
                <Image
                  src={company.logo_url}
                  alt={`${company.name} logo`}
                  width={80}
                  height={80}
                  className="rounded-lg object-contain"
                />
              )}
              <div>
                <h1
                  className="text-3xl font-semibold tracking-[-0.02em]"
                  style={{ color: brandColor }}
                >
                  {company.name}
                </h1>
                {company.owner_name && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {company.owner_name}
                  </p>
                )}
              </div>
            </div>
            <div className="text-sm text-muted-foreground text-right space-y-0.5">
              {company.phone && <p><a href={`tel:${company.phone}`} className="hover:underline">{company.phone}</a></p>}
              {company.email && <p>{company.email}</p>}
              {company.website && <p>{company.website}</p>}
              {(company.address || company.city) && (
                <p>
                  {[company.address, company.city, company.state]
                    .filter(Boolean)
                    .join(', ')}
                  {company.zip ? ` ${company.zip}` : ''}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client info bar */}
      {client && (
        <Card variant="glass">
          <CardContent className="p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {t('Prepared For')}
            </h2>
            <p className="font-medium">{client.name}</p>
            <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
              {client.email && <p>{client.email}</p>}
              {client.phone && <p><a href={`tel:${client.phone}`} className="hover:underline">{client.phone}</a></p>}
              {(client.address || client.city) && (
                <p>
                  {[client.address, client.city, client.state]
                    .filter(Boolean)
                    .join(', ')}
                  {client.zip ? ` ${client.zip}` : ''}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project info */}
      <Card variant="glass">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{project.name}</h2>
              {project.project_type && (
                <p className="text-sm text-muted-foreground capitalize">
                  {project.project_type.replace(/_/g, ' ')}
                </p>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              <p>
                {t('Estimate Date:')}{' '}
                {new Date(estimate.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <p>{t('Version')} {estimate.version}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {estimate.summary && (
        <Card variant="glass">
          <CardContent className="p-4 sm:p-6">
            <h2
              className="text-sm font-semibold uppercase tracking-wider mb-2"
              style={{ color: brandColor }}
            >
              {t('Summary')}
            </h2>
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              {estimate.summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Sections with line items */}
      {estimate.sections.map((section) => (
        <Card key={section.id}>
          <CardContent className="p-4 sm:p-6">
            <h2
              className="text-base font-semibold mb-4 pb-2 border-b-2"
              style={{ borderBottomColor: brandColor, color: brandColor }}
            >
              {t(section.title)}
            </h2>

            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">{t('Description')}</th>
                    <th className="pb-2 font-medium text-right w-16">{t('Qty')}</th>
                    <th className="pb-2 font-medium text-right w-20">{t('Unit')}</th>
                    <th className="pb-2 font-medium text-right w-28">
                      {t('Unit Price')}
                    </th>
                    <th className="pb-2 font-medium text-right w-28">{t('Total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item, index) => (
                    <tr
                      key={item.id}
                      className={index % 2 === 0 ? 'bg-muted/30' : ''}
                    >
                      <td className="py-2 px-1">{item.description}</td>
                      <td className="py-2 px-1 text-right tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="py-2 px-1 text-right">
                        {item.unit ?? ''}
                      </td>
                      <td className="py-2 px-1 text-right tabular-nums">
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td className="py-2 px-1 text-right tabular-nums font-medium">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked layout */}
            <div className="sm:hidden space-y-3">
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className="border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <p className="font-medium">{item.description}</p>
                  <div className="flex justify-between text-sm text-muted-foreground mt-1">
                    <span>
                      {item.quantity} {item.unit ?? ''} x{' '}
                      {formatCurrency(item.unit_price)}
                    </span>
                    <span className="font-medium text-foreground tabular-nums">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Section subtotal */}
            <div className="flex justify-end mt-4 pt-2 border-t">
              <div className="text-sm">
                <span className="text-muted-foreground mr-4">
                  {t('Section Subtotal:')}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(section.subtotal)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Totals block */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col items-end space-y-2">
            <div className="w-full sm:w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('Subtotal')}</span>
                <span className="tabular-nums">
                  {formatCurrency(estimate.subtotal)}
                </span>
              </div>

              {estimate.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t('Discount')}
                    {estimate.discount_type === 'percentage'
                      ? ` (${estimate.discount_value}%)`
                      : ''}
                  </span>
                  <span className="text-green-600 tabular-nums">
                    -{formatCurrency(estimate.discount_amount)}
                  </span>
                </div>
              )}

              {estimate.tax_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t('Tax')} ({estimate.tax_rate}%)
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(estimate.tax_amount)}
                  </span>
                </div>
              )}

              <div className="flex justify-between pt-2 border-t-2 border-foreground">
                <span className="text-lg font-bold">{t('Total')}</span>
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{ color: brandColor }}
                >
                  {formatCurrency(estimate.total)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Terms, warranty, timeline, notes */}
      {(estimate.payment_terms ||
        estimate.warranty_terms ||
        estimate.timeline ||
        estimate.notes) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {estimate.payment_terms && (
            <Card variant="glass">
              <CardContent className="p-4 sm:p-6">
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-2"
                  style={{ color: brandColor }}
                >
                  {t('Payment Terms')}
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {estimate.payment_terms}
                </p>
              </CardContent>
            </Card>
          )}

          {estimate.warranty_terms && (
            <Card variant="glass">
              <CardContent className="p-4 sm:p-6">
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-2"
                  style={{ color: brandColor }}
                >
                  {t('Warranty')}
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {estimate.warranty_terms}
                </p>
              </CardContent>
            </Card>
          )}

          {estimate.timeline && (
            <Card variant="glass">
              <CardContent className="p-4 sm:p-6">
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-2"
                  style={{ color: brandColor }}
                >
                  {t('Timeline')}
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {estimate.timeline}
                </p>
              </CardContent>
            </Card>
          )}

          {estimate.notes && (
            <Card variant="glass">
              <CardContent className="p-4 sm:p-6">
                <h3
                  className="text-sm font-semibold uppercase tracking-wider mb-2"
                  style={{ color: brandColor }}
                >
                  {t('Notes')}
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {estimate.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Phase 70 — Stripe payment return banners + Pay Now button */}
      {(stripeState !== null ||
        (estimate.company.stripe_account_id != null &&
          estimate.company.stripe_connect_status === 'active' &&
          estimate.payment_status !== 'paid' &&
          estimate.total_amount_cents > 0)) && (
        <Card variant="glass">
          <CardContent className="p-6 sm:p-8 space-y-4">
            {stripeState === 'success' && <PaymentSuccessBanner />}
            {stripeState === 'canceled' && <PaymentCanceledNotice />}
            <PayNowButton
              token={token}
              totalAmountCents={estimate.total_amount_cents}
              stripeAccountId={estimate.company.stripe_account_id}
              stripeConnectStatus={estimate.company.stripe_connect_status}
              paymentStatus={
                stripeState === 'success'
                  ? 'paid'
                  : (estimate.payment_status ?? 'unpaid')
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Estimate Terms */}
      {estimate.company.estimate_terms_enabled && estimate.company.estimate_terms_text && (
        <Card variant="glass">
          <CardContent className="p-4 sm:p-6">
            <h3
              className="text-sm font-semibold uppercase tracking-wider mb-3"
              style={{ color: brandColor }}
            >
              {t('Estimate Terms')}
            </h3>
            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
              {estimate.company.estimate_terms_text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Signature pad (shown when client clicks Accept and signature is required) */}
      {showSignaturePad && !responded && (
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-2">
              <PenLine className="h-5 w-5" style={{ color: brandColor }} />
              <h3 className="text-base font-semibold">Sign to accept this estimate</h3>
            </div>
            <SignaturePad
              signerName={signerName}
              onSignerNameChange={setSignerName}
              onSignatureChange={setSignatureData}
              brandColor={brandColor}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
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
                Sign & Accept Estimate
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => { setShowSignaturePad(false); setError(null) }}
                disabled={isSubmittingSignature}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accept / Decline buttons — hidden while signature pad is open */}
      {!showSignaturePad && (
      <Card variant="glass">
        <CardContent className="p-6 sm:p-8">
          {responded ? (
            <div className="text-center space-y-2">
              {responseValue === 'accepted' ? (
                <>
                  <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                  <p className="text-lg font-semibold text-green-700">
                    {t('Estimate Accepted')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {estimate.responded_at
                      ? t(`You accepted this estimate on ${new Date(
                          estimate.responded_at
                        ).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}`)
                      : t('Thank you for accepting this estimate')}
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="mx-auto h-12 w-12 text-red-500" />
                  <p className="text-lg font-semibold text-red-700">
                    {t('Estimate Declined')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {estimate.responded_at
                      ? t(`You declined this estimate on ${new Date(
                          estimate.responded_at
                        ).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}`)
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

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

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
            {t('Generated by')}{' '}
            <span className="font-medium">{appName}</span>
          </p>
        </div>
      )}
    </div>
  )
}
