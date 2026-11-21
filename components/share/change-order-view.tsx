'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { CheckCircle, XCircle, Loader2, PenLine, Download, FileText, Receipt, ExternalLink } from 'lucide-react'
import { declineChangeOrder } from '@/app/change-order/[token]/actions'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { ensureReadableOnWhite, readableTextColor } from '@/lib/color/contrast'
import { formatMinorUnits } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'
import { ScopedLanguageProvider, type Language } from '@/lib/i18n/language-context'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { formatCurrency } from '@/lib/utils/format'
import { formatDate } from '@/lib/estimate/document/format'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import { SignaturePad } from '@/components/share/signature-pad'
import { ProposalBar } from '@/components/share/proposal-bar'
import { formatChangeOrderNumber, type PublicChangeOrderData } from '@/lib/change-orders/types'

interface ChangeOrderViewProps {
  data: PublicChangeOrderData
  /** The change order's share token (also the authority for the PDF link). */
  token: string
  appName: string
  whiteLabelMode?: boolean
  /** The owner (or a teammate) is previewing their own link: show a band; the
   *  page already skipped the view count. */
  ownerPreview?: boolean
}

// An anonymous client's browser has no language preference, so the page is
// scoped to the language the estimate was written in (same rule as
// components/share/estimate-view.tsx).
export function ChangeOrderView(props: ChangeOrderViewProps) {
  const language = (props.data.estimate.language ?? 'en') as Language
  return (
    <ScopedLanguageProvider language={language} setLanguage={() => {}}>
      <ChangeOrderViewInner {...props} />
    </ScopedLanguageProvider>
  )
}

const MINUS = '−'

/** Signed amount: credits read "-$50.00" with a real minus sign. */
function signedMoney(value: number, currency: string): string {
  return value < 0 ? `${MINUS}${formatCurrency(Math.abs(value), currency)}` : formatCurrency(value, currency)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

type Blocked = 'answered' | 'unavailable' | null

function ChangeOrderViewInner({
  data,
  token,
  appName,
  whiteLabelMode = false,
  ownerPreview = false,
}: ChangeOrderViewProps) {
  const { t } = useTranslation()
  const { changeOrder, company, estimate, contract } = data
  const currency = changeOrder.currency_code || 'USD'
  const lang = (estimate.language ?? 'en') as EstimateLanguage

  const initialResponse: 'accepted' | 'declined' | null =
    changeOrder.client_response ??
    (changeOrder.status === 'accepted' ? 'accepted' : changeOrder.status === 'declined' ? 'declined' : null)
  const [response, setResponse] = useState<'accepted' | 'declined' | null>(initialResponse)
  const [respondedAt, setRespondedAt] = useState<string | null>(changeOrder.responded_at)
  // Kept locally after a successful sign so the approved card can show it
  // without a reload.
  const [localSignature, setLocalSignature] = useState<{ name: string; image: string } | null>(null)

  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [confirmingDecline, setConfirmingDecline] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedNotice, setUpdatedNotice] = useState(false)
  // The parent estimate is no longer the current accepted one: no answer is possible.
  const [blocked, setBlocked] = useState<Blocked>(data.contractActive === false ? 'unavailable' : null)
  const noticeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (updatedNotice) noticeRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }, [updatedNotice])

  const brandColor = company.brand_primary_color ?? SYSTEM_COLORS.primary
  const brandText = ensureReadableOnWhite(brandColor)
  const brandOnFill = readableTextColor(brandColor)
  const invoice = data.invoice ?? null

  const approvalEnabled = company.digital_signature_enabled === true
  const isDraft = changeOrder.status === 'draft'
  const answered = response !== null
  const canRespond = approvalEnabled && !answered && !isDraft && blocked === null
  const showActionBar = canRespond && !showSignaturePad
  const isApproved = response === 'accepted'

  const number = formatChangeOrderNumber(estimate.estimateNumber, changeOrder.number)
  const acceptedOn = estimate.acceptedAt ? formatDate(estimate.acceptedAt, lang) : null
  const respondedOn = respondedAt ? formatDate(respondedAt, lang) : null

  // "Current contract" is the contract BEFORE this change order: when the loaded
  // summary already counts it (approved when the page was loaded), take it back
  // out. A change order approved on this very visit is not in the summary yet.
  const countedInSummary = contract.changeOrders.some(
    (row) => row.id === changeOrder.id && row.status === 'accepted'
  )
  const currentContract = round2(
    countedInSummary ? contract.contractTotal - changeOrder.total : contract.contractTotal
  )
  const newTotal = round2(currentContract + changeOrder.total)
  const extraDays = changeOrder.extra_days && changeOrder.extra_days > 0 ? changeOrder.extra_days : null
  const pdfHref = `/api/change-orders/${changeOrder.id}/pdf?token=${encodeURIComponent(token)}`

  function openSignature() {
    setError(null)
    setConfirmingDecline(false)
    setShowSignaturePad(true)
  }

  function closeSignature() {
    if (isSubmitting) return
    setShowSignaturePad(false)
    setError(null)
  }

  async function handleDecline() {
    setDeclining(true)
    setError(null)
    try {
      const result = await declineChangeOrder(token)
      if (result.success) {
        setResponse('declined')
        setRespondedAt(new Date().toISOString())
        setConfirmingDecline(false)
      } else if (result.error === 'already_responded') {
        setBlocked('answered')
        setConfirmingDecline(false)
      } else if (result.error === 'contract_not_accepted') {
        setBlocked('unavailable')
        setConfirmingDecline(false)
      } else {
        setError(result.error ?? t('Something went wrong'))
      }
    } catch {
      setError(t('Something went wrong'))
    } finally {
      setDeclining(false)
    }
  }

  async function handleSign() {
    if (!signerName.trim()) {
      setError(t('Please enter your full name.'))
      return
    }
    if (!signatureData) {
      setError(t('Please draw your signature.'))
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/change-orders/${changeOrder.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signerName: signerName.trim(),
          signerEmail: signerEmail.trim() || undefined,
          signatureData,
          contentVersion: changeOrder.updated_at,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 409 && body.error === 'change_order_updated') {
          setUpdatedNotice(true)
          setShowSignaturePad(false)
          return
        }
        if (res.status === 409 && body.error === 'already_responded') {
          setBlocked('answered')
          setShowSignaturePad(false)
          return
        }
        if (res.status === 409 && body.error === 'contract_not_accepted') {
          setBlocked('unavailable')
          setShowSignaturePad(false)
          return
        }
        throw new Error(body.error ?? t('Something went wrong'))
      }
      setLocalSignature({ name: signerName.trim(), image: signatureData })
      setResponse('accepted')
      setRespondedAt(new Date().toISOString())
      setShowSignaturePad(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Something went wrong'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const signature = localSignature
    ? { name: localSignature.name, image: localSignature.image, signedAt: respondedAt }
    : changeOrder.signature
      ? {
          name: changeOrder.signature.signer_name,
          image: changeOrder.signature.signature_data,
          signedAt: changeOrder.signature.signed_at,
        }
      : null

  const card = 'rounded-lg border border-border bg-white p-4 shadow-sm sm:p-6'
  const eyebrow = 'text-xs font-semibold uppercase tracking-widest text-muted-foreground'

  return (
    <div
      className={
        // Keep the last content clear of the fixed mobile action bar (+ iOS home indicator).
        showActionBar ? 'pb-[calc(8rem+env(safe-area-inset-bottom))] sm:pb-0' : undefined
      }
    >
      {ownerPreview && (
        <div
          data-testid="owner-preview-band"
          className="-mx-4 border-b border-border bg-muted px-4 py-2 text-center text-xs text-muted-foreground sm:mx-0"
        >
          {t("You're viewing your own change order. This visit isn't counted.")}
        </div>
      )}

      <ProposalBar
        companyName={company.name}
        logoUrl={company.logo_url}
        phone={company.phone}
        email={company.email}
        estimateNumber={estimate.estimateNumber}
        estimateDate=""
        subtitle={t('Change order {number}').replace('{number}', number)}
        totalLabel={t('This change order')}
        total={signedMoney(changeOrder.total, currency)}
        brandText={brandText}
        showAccept={false}
        onAccept={() => {}}
      />

      <div className="mx-auto max-w-2xl space-y-4 pt-5">
        {/* A white card like the rest: the stage behind it can be dark when the
            visitor's app theme is dark, and this text must stay readable. */}
        <header className="space-y-2 rounded-2xl bg-white p-5 text-slate-900 shadow-sm">
          <p className={eyebrow} data-testid="change-order-kicker">
            {t('Change order #{n} · estimate {estimate}')
              .replace('{n}', String(changeOrder.number))
              .replace('{estimate}', estimate.estimateNumber)}
          </p>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-3xl">
            {estimate.projectName}
          </h1>
          <p className="text-sm text-slate-600 sm:text-base">
            {acceptedOn
              ? t('{company} asks for your approval of a change to the work accepted on {date}.')
                  .replace('{company}', company.name)
                  .replace('{date}', acceptedOn)
              : t('{company} asks for your approval of a change to the accepted work.').replace(
                  '{company}',
                  company.name
                )}
          </p>
        </header>

        {updatedNotice && !answered && (
          <div
            ref={noticeRef}
            role="alert"
            data-testid="change-order-updated-notice"
            className="flex flex-col items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900 sm:flex-row sm:justify-between sm:text-left"
          >
            <p>{t('This change order was just updated. Review the latest version before signing.')}</p>
            <Button size="sm" className="min-h-10" onClick={() => window.location.reload()}>
              {t('Load latest version')}
            </Button>
          </div>
        )}

        {blocked === 'answered' && !answered && (
          <div
            role="alert"
            data-testid="change-order-answered-notice"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900"
          >
            {t('This change order was already answered.')}
          </div>
        )}
        {blocked === 'unavailable' && !answered && (
          <div
            role="alert"
            data-testid="change-order-unavailable-notice"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900"
          >
            {t("This change order can't be approved right now. Contact {company}.").replace(
              '{company}',
              company.name
            )}
          </div>
        )}
        {isDraft && !answered && (
          <div
            data-testid="change-order-draft-notice"
            className="rounded-lg border border-border bg-white px-4 py-3 text-center text-sm text-muted-foreground"
          >
            {t('This change order is still being prepared.')}
          </div>
        )}

        {answered && (
          <section
            data-testid="response-status"
            className={`${card} ${isApproved ? 'border-green-300' : 'border-red-300'}`}
          >
            <div className="flex items-center gap-2">
              {isApproved ? (
                <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 shrink-0 text-red-500" />
              )}
              <h2 className="text-base font-semibold">
                {isApproved ? t('Change order approved') : t('Change order declined')}
              </h2>
            </div>
            {respondedOn && (
              <p className="mt-1 text-sm text-muted-foreground">
                {(isApproved ? t('Approved on {date}') : t('Declined on {date}')).replace('{date}', respondedOn)}
              </p>
            )}
            {isApproved && signature && (
              <div className="mt-3 space-y-1" data-testid="approved-signature">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signature.image}
                  alt={t('Signed by {name}').replace('{name}', signature.name)}
                  className="h-14 w-auto max-w-full rounded border border-border bg-white object-contain"
                />
                <p className="text-sm font-medium">{signature.name}</p>
              </div>
            )}
          </section>
        )}

        {changeOrder.reason && (
          <section className={card}>
            <h2 className={eyebrow}>{t('Reason')}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {changeOrder.reason}
            </p>
          </section>
        )}

        <section className={card} data-testid="change-order-lines">
          <h2 className={eyebrow}>{t('What changes')}</h2>
          {changeOrder.title && <p className="mt-1 text-sm font-medium">{changeOrder.title}</p>}
          <ul className="mt-3 divide-y divide-border">
            {changeOrder.items.map((item) => {
              const credit = item.total < 0
              const qtyLine =
                item.quantity !== 1 || item.unit
                  ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''} × ${signedMoney(item.unit_price, currency)}`
                  : null
              return (
                <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{item.description}</p>
                    {qtyLine && <p className="mt-0.5 text-xs text-muted-foreground">{qtyLine}</p>}
                    {credit && <p className="mt-0.5 text-xs text-red-600">{t('Credit')}</p>}
                  </div>
                  <p
                    data-testid="line-amount"
                    className={`shrink-0 text-sm font-medium tabular-nums ${credit ? 'text-red-600' : 'text-foreground'}`}
                  >
                    {signedMoney(item.total, currency)}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>

        <section className={card} data-testid="change-order-totals">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{t('Current contract')}</dt>
              <dd className="tabular-nums">{formatCurrency(currentContract, currency)}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">
                {t('This change order')}
                {changeOrder.tax_amount !== 0 && (
                  <span className="block text-xs">
                    {t('Includes tax of {amount}').replace(
                      '{amount}',
                      signedMoney(changeOrder.tax_amount, currency)
                    )}
                  </span>
                )}
              </dt>
              <dd
                className={`tabular-nums ${changeOrder.total < 0 ? 'text-red-600' : 'text-foreground'}`}
              >
                {signedMoney(changeOrder.total, currency)}
              </dd>
            </div>
            {extraDays !== null && (
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{t('Extra time')}</dt>
                <dd className="tabular-nums">
                  {(extraDays === 1 ? t('+{n} day') : t('+{n} days')).replace('{n}', String(extraDays))}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 border-t-2 border-foreground/80 pt-3 text-base font-semibold">
              <dt>{t('New total')}</dt>
              <dd className="tabular-nums" style={{ color: brandText }}>
                {formatCurrency(newTotal, currency)}
              </dd>
            </div>
          </dl>
        </section>

        {/* This change order's own invoice (billed on its own): pay link while
            open, a confirmation once paid. Nothing when there is none. */}
        {invoice && invoice.status === 'open' && invoice.hosted_invoice_url && (
          <section className={card} data-testid="change-order-pay-invoice">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Receipt className="h-5 w-5 shrink-0" style={{ color: brandText }} aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t('Invoice for this change order')}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatMinorUnits(invoice.amount_cents, invoice.currency_code)}
                  </p>
                </div>
              </div>
              <Button
                asChild
                size="lg"
                className="w-full sm:w-auto"
                style={{ backgroundColor: brandColor, color: brandOnFill }}
              >
                <a href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('Pay invoice')}
                </a>
              </Button>
            </div>
          </section>
        )}
        {invoice && invoice.status === 'paid' && (
          <section className={card} data-testid="change-order-invoice-paid">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500" aria-hidden />
              <span>
                {t('Paid')}: {formatMinorUnits(invoice.amount_cents, invoice.currency_code)}
              </span>
            </p>
          </section>
        )}

        <nav className="flex flex-col gap-1 px-1 text-sm sm:flex-row sm:gap-6">
          <a
            href={estimate.publicPath}
            className="inline-flex min-h-10 items-center gap-2 underline underline-offset-2 hover:text-foreground"
            style={{ color: brandText }}
          >
            <FileText className="h-4 w-4" />
            {t('See the accepted estimate')}
          </a>
          <a
            href={pdfHref}
            className="inline-flex min-h-10 items-center gap-2 underline underline-offset-2 hover:text-foreground"
            style={{ color: brandText }}
          >
            <Download className="h-4 w-4" />
            {t('Download PDF')}
          </a>
        </nav>

        {/* Actions. One element: a fixed bottom bar on phones (thumb reach), the
            same buttons inline under the cards from sm up. */}
        {canRespond && (
          <div
            data-testid="change-order-actions"
            data-hide-on-keyboard
            className={
              showActionBar
                ? 'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none'
                : 'hidden'
            }
          >
            {confirmingDecline ? (
              <div className="mx-auto max-w-2xl space-y-2 text-center" data-testid="decline-confirm">
                <p className="text-sm font-medium">{t('Decline this change order?')}</p>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2 sm:justify-center">
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1 border-red-300 text-red-600 hover:bg-red-50 sm:flex-none"
                    onClick={handleDecline}
                    disabled={declining}
                  >
                    {declining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('Yes, decline')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-11 flex-1 sm:flex-none"
                    onClick={() => setConfirmingDecline(false)}
                    disabled={declining}
                  >
                    {t('Keep reviewing')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-2xl gap-2 sm:justify-start">
                <Button
                  size="lg"
                  className="min-h-11 flex-1 bg-green-600 text-white hover:bg-green-700 sm:flex-none"
                  onClick={openSignature}
                >
                  <PenLine className="mr-2 h-4 w-4" />
                  {t('Approve and sign')}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    setError(null)
                    setConfirmingDecline(true)
                  }}
                >
                  {t('Decline')}
                </Button>
              </div>
            )}
          </div>
        )}

        {!approvalEnabled && !answered && !isDraft && (
          <p
            data-testid="contact-to-approve"
            className="rounded-lg border border-border bg-white px-4 py-3 text-center text-sm text-muted-foreground"
          >
            {t('To approve this change, contact {company}.').replace('{company}', company.name)}
            {company.phone ? ` ${formatPhoneForDisplay(company.phone)}` : ''}
          </p>
        )}

        {!whiteLabelMode && (
          <div className="pb-2 text-center text-xs text-white/55">
            <p>
              {t('Generated by')} <span className="font-medium">{appName}</span>
            </p>
          </div>
        )}
      </div>

      {approvalEnabled && (
        <Dialog
          open={showSignaturePad && !answered}
          onOpenChange={(open) => !open && closeSignature()}
        >
          {/* Portals to <body>, outside the forced-light share layout: re-declare
              the light scope so it does not turn dark around the white canvas. */}
          <BottomSheetContent
            data-theme="light"
            desktopClassName="sm:max-w-xl"
            className="text-foreground"
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              ;(e.currentTarget as HTMLElement | null)?.focus()
            }}
          >
            <DialogHeader
              data-sheet-drag=""
              className="flex shrink-0 flex-row items-center justify-between gap-3 pb-2 pl-5 pr-3 pt-1 text-left touch-none sm:pl-6 sm:pr-4 sm:pt-5"
            >
              <DialogTitle className="flex items-center gap-2 text-base">
                <PenLine className="h-5 w-5" style={{ color: brandText }} />
                {t('Sign to approve this change order')}
              </DialogTitle>
              <BottomSheetCloseButton label={t('Close')} disabled={isSubmitting} />
              <DialogDescription className="sr-only">
                {t('By signing, you approve this change and the new contract total.')}
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 pb-5 pt-1 sm:gap-4 sm:px-6 sm:pb-6">
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
              {t('By signing, you approve this change and the new contract total.')}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="min-h-11 bg-green-600 text-white hover:bg-green-700"
                onClick={handleSign}
                disabled={isSubmitting || !signerName.trim() || !signatureData}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                {t('Sign & Approve')}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="min-h-11"
                onClick={closeSignature}
                disabled={isSubmitting}
              >
                {t('Cancel')}
              </Button>
            </div>
            </div>
          </BottomSheetContent>
        </Dialog>
      )}
    </div>
  )
}
