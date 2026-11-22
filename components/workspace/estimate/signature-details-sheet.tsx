'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { getSignatureEvidence } from '@/lib/actions/signature-evidence'
import type { SignatureEvidence } from '@/lib/estimate/signature-evidence'
import { formatMoney } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'

interface SignatureDetailsSheetProps {
  estimateId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Dev fixtures only: render this evidence instead of fetching it. */
  initialEvidence?: SignatureEvidence | null
}

function formatSignedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2 text-sm sm:grid-cols-[8.5rem_minmax(0,1fr)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  )
}

/**
 * "Signature details": the evidence behind an online signature, for the owner.
 * Bottom sheet on phones, centred card from sm up. The evidence is fetched when
 * the panel first opens and kept for the life of the component.
 */
export function SignatureDetailsSheet({ estimateId, open, onOpenChange, initialEvidence }: SignatureDetailsSheetProps) {
  const { t } = useTranslation()
  const [evidence, setEvidence] = useState<SignatureEvidence | null>(initialEvidence ?? null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The id the cached evidence belongs to: switching to another version of the
  // estimate drops it and fetches again on the next open.
  const requested = useRef<string | null>(initialEvidence ? estimateId : null)

  useEffect(() => {
    if (requested.current !== null && requested.current !== estimateId) {
      requested.current = null
      setEvidence(null)
      setError(null)
    }
  }, [estimateId])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getSignatureEvidence(estimateId)
      if (result.error) {
        // Server reasons (session, membership) are not customer copy.
        setError(t('Could not load the signature details'))
      } else if (!result.data) {
        setError(t('No signature was found for this estimate.'))
      } else {
        setEvidence(result.data)
      }
    } catch {
      setError(t('Could not load the signature details'))
    } finally {
      setLoading(false)
    }
  }, [estimateId, t])

  useEffect(() => {
    if (!open || requested.current === estimateId) return
    requested.current = estimateId
    void load()
  }, [open, load, estimateId])

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
  }, [])

  async function copyHash() {
    if (!evidence?.sha256) return
    try {
      await navigator.clipboard.writeText(evidence.sha256)
      setCopied(true)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked: the fingerprint stays selectable */
    }
  }

  function retry() {
    void load()
  }

  const integrity = evidence?.integrity
  const IntegrityIcon = integrity === 'verified' ? ShieldCheck : integrity === 'mismatch' ? ShieldAlert : ShieldQuestion
  const integrityText =
    integrity === 'verified'
      ? t('Content unchanged since signing')
      : integrity === 'mismatch'
        ? t('Stored content does not match its fingerprint')
        : t('Fingerprint not available for this signature')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent desktopClassName="sm:max-w-[480px]">
        <DialogHeader
          data-sheet-drag=""
          className="flex shrink-0 touch-none flex-row items-center justify-between gap-3 pl-5 pr-3 pt-1 pb-1 text-left sm:pt-4"
        >
          <DialogTitle className="text-[19px] font-semibold leading-tight tracking-tight">
            {t('Signature details')}
          </DialogTitle>
          <BottomSheetCloseButton label={t('Close')} />
          <DialogDescription className="sr-only">{t('Signature details')}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-3 pb-5">
          {loading && !evidence && (
            <div
              role="status"
              className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
              data-testid="signature-loading"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t('Loading')}
            </div>
          )}

          {error && !loading && !evidence && (
            <div role="alert" className="flex flex-col items-start gap-3 py-4" data-testid="signature-error">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                {t('Retry')}
              </Button>
            </div>
          )}

          {evidence && (
            <>
              <div className="flex h-16 w-60 max-w-full items-center justify-center self-start overflow-hidden rounded-lg border border-border bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, not optimizable */}
                <img
                  src={evidence.signatureDataUrl}
                  alt={t('Signature of {name}').replace('{name}', evidence.signerName)}
                  className="max-h-full max-w-full object-contain"
                />
              </div>

              <dl className="divide-y divide-border">
                <Row label={t('Signed by')}>{evidence.signerName}</Row>
                <Row label={t('Email')}>
                  {evidence.signerEmail ?? <span className="font-normal text-muted-foreground">{t('Not provided')}</span>}
                </Row>
                <Row label={t('Signed on')}>{formatSignedAt(evidence.signedAt)}</Row>
                <Row label={t('IP address')}>
                  {evidence.ipAddress ?? <span className="font-normal text-muted-foreground">{t('Not recorded')}</span>}
                </Row>
                <Row label={t('Device')}>
                  {evidence.device || evidence.userAgent ? (
                    <span title={evidence.userAgent ?? undefined}>
                      {evidence.device ?? evidence.userAgent}
                      {evidence.device && evidence.userAgent && (
                        <span className="mt-0.5 block break-all text-xs font-normal text-muted-foreground">
                          {evidence.userAgent}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="font-normal text-muted-foreground">{t('Not recorded')}</span>
                  )}
                </Row>
                {evidence.signedTotal != null && (
                  <Row label={t('Amount signed')}>{formatMoney(evidence.signedTotal, evidence.currencyCode)}</Row>
                )}
              </dl>

              <div
                data-testid="signature-integrity"
                data-integrity={integrity}
                className={cn(
                  'flex items-start gap-2 text-sm font-medium',
                  integrity === 'verified' && 'text-emerald-600 dark:text-emerald-400',
                  integrity === 'mismatch' && 'text-destructive',
                  integrity === 'unavailable' && 'text-muted-foreground',
                )}
              >
                <IntegrityIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{integrityText}</span>
              </div>

              {evidence.sha256 && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('Fingerprint')}
                    </span>
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={copyHash}>
                      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                      {copied ? t('Copied') : t('Copy')}
                    </Button>
                  </div>
                  <code
                    data-testid="signature-sha256"
                    className="select-all break-all rounded-md border border-border bg-muted/50 p-2.5 font-mono text-xs leading-relaxed"
                  >
                    {evidence.sha256}
                  </code>
                </div>
              )}

              {evidence.consentStatement && (
                <p className="text-xs text-muted-foreground">
                  {t('Consent shown')}: {'“'}
                  {evidence.consentStatement}
                  {'”'}
                </p>
              )}
            </>
          )}
        </div>
      </BottomSheetContent>
    </Dialog>
  )
}
