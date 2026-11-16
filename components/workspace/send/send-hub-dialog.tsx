// components/workspace/send/send-hub-dialog.tsx
// "Share estimate" sheet. Xtimator never sends the estimate itself: the owner copies the link or the message and sends it from their OWN apps, so
// the client's reply lands where they already talk to the client. Two blocks:
//   1. the online estimate: readable link, whether the client opened it, Copy
//      link (primary), Open, and the optional password;
//   2. the ready message, always visible and editable in place.
// Download PDF is a plain text button at the end.

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Check, Copy, Download, Eye, Lock, LockOpen, X } from 'lucide-react'
import { logDeliveryAction, setEstimateSharePassword } from '@/lib/actions/estimate'
import { buildEstimatePublicPath } from '@/lib/estimate/public-url'
import { formatEstimateNumber } from '@/lib/estimate/document/format'
import {
  resolveTemplate,
  buildMessageBreakdown,
} from '@/lib/utils/estimate-template'
import { formatCurrency } from '@/lib/utils/format'
import { relativeTime } from '@/lib/utils/relative-time'
import { getInitials } from '@/lib/utils/avatar'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'

export interface SendHubDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estimate: EstimateWithSections | null
  projectName: string
  companyName: string
  /**
   * Company slug -- needed by buildEstimatePublicPath to construct the friendly
   * Phase 160 URL. Falls back to the legacy /estimate/{share_token} path when
   * null/undefined.
   */
  companySlug?: string | null
  /** Company logo for the miniature of the client page; initials when absent. */
  companyLogoUrl?: string | null
  clientName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
  /** How many times the client opened the link (same counter as the Insights chip). */
  viewCount?: number
  /** ISO time of the last open (same value as the Insights chip). */
  lastViewedAt?: string | null
}

// Primary / secondary / text buttons of the sheet (blue palette of the
// `nx-surface` popups).
const PRIMARY_STYLE = {
  backgroundImage: 'linear-gradient(135deg, hsl(219 92% 65%), hsl(228 84% 54%))',
} as const
const PRIMARY_BTN =
  'h-[50px] rounded-full px-5 text-[15px] font-semibold text-white shadow-none hover:text-white'
const SECONDARY_BTN =
  'rounded-full bg-primary/10 font-semibold text-primary shadow-none hover:bg-primary/15 hover:text-primary hover:translate-y-0'
const TEXT_BTN =
  'cursor-pointer rounded text-primary font-medium focus-visible:outline-2 focus-visible:outline-primary'
const LABEL =
  'text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'

function shortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function SendHubDialog({
  open,
  onOpenChange,
  estimate,
  projectName,
  companyName,
  companySlug,
  companyLogoUrl,
  clientName,
  ownerName,
  estimateTemplate,
  viewCount,
  lastViewedAt,
}: SendHubDialogProps) {
  const { t } = useTranslation()
  const [urlCopied, setUrlCopied] = useState(false)
  // Edited message draft, tagged with the estimate id it belongs to so a
  // dialog reused for another estimate falls back to that estimate's
  // freshly generated text (no effect needed).
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null)

  if (!estimate) return null

  const publicPath = buildEstimatePublicPath(
    { slug: companySlug ?? null, name: companyName },
    {
      id: estimate.id,
      public_slug_token: estimate.public_slug_token,
      share_token: estimate.share_token,
      project_name: projectName,
    }
  )

  function buildAbsoluteUrl(): string {
    // Client-only surface -- window is guaranteed by 'use client'.
    return typeof window !== 'undefined'
      ? `${window.location.origin}${publicPath}`
      : publicPath
  }

  // Readable form of the link: no protocol.
  const displayUrl = buildAbsoluteUrl().replace(/^https?:\/\//, '')

  const resolvedSettings = resolvePresentationSettings(
    (estimate as { presentation_settings?: unknown }).presentation_settings,
  )
  const generatedText = resolveTemplate(estimateTemplate, {
    client_name: clientName,
    company_name: companyName,
    owner_name: ownerName,
    total: formatCurrency(estimate.total, estimate.currency_code),
    // Line items plus the visible payment / timeline / warranty / notes blocks (SEED-056).
    items_breakdown: buildMessageBreakdown(estimate, resolvedSettings),
  })
  const messageText =
    draft?.id === estimate.id ? draft.text : generatedText

  const totalLabel = formatCurrency(estimate.total, estimate.currency_code)
  const numberLabel = formatEstimateNumber(estimate)

  // ---------------------------------------------------------------------------
  // Online estimate: pure client-side URL affordances (no network dispatch).
  // logDeliveryAction is fire-and-forget -- copy/open success is what matters
  // to the user, and a log-write failure must NEVER trigger an error toast.
  // ---------------------------------------------------------------------------
  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(buildAbsoluteUrl())
      setUrlCopied(true)
      toast.success(t('Link copied'))
      setTimeout(() => setUrlCopied(false), 2000)
      void logDeliveryAction({
        estimateId: estimate!.id,
        format: 'online_link',
        channel: 'copy',
      })
    } catch {
      toast.error(t('Failed to copy link'))
    }
  }

  function handleOpenUrl() {
    if (typeof window !== 'undefined') {
      window.open(buildAbsoluteUrl(), '_blank', 'noopener,noreferrer')
      void logDeliveryAction({
        estimateId: estimate!.id,
        format: 'online_link',
        channel: 'open',
      })
    }
  }

  // ---------------------------------------------------------------------------
  // PDF: download opens the existing /api/estimates/[id]/pdf route in a new
  // tab. logDeliveryAction fires BEFORE the open so the row lands even if the
  // download stream errors afterwards.
  // ---------------------------------------------------------------------------
  function handleDownloadPdf() {
    if (typeof window === 'undefined') return
    void logDeliveryAction({
      estimateId: estimate!.id,
      format: 'pdf',
      channel: 'download',
    })
    window.open(
      `/api/estimates/${estimate!.id}/pdf`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  // What the owner sees about the link's life: the answer, else the opens.
  const accepted = estimate.client_response === 'accepted'
  const declined = estimate.client_response === 'declined'
  const opens = viewCount ?? 0
  let status: { text: string; tone: 'ok' | 'on' | 'idle' }
  if (accepted) {
    status = {
      text: `${t('Accepted on')} ${shortDate(estimate.responded_at)}`.trim(),
      tone: 'ok',
    }
  } else if (declined) {
    status = {
      text: `${t('Declined on')} ${shortDate(estimate.responded_at)}`.trim(),
      tone: 'idle',
    }
  } else if (opens > 0) {
    status = {
      text: `${t('Opened')} ${opens} ${opens === 1 ? t('time') : t('times')}${
        lastViewedAt ? ` · ${relativeTime(lastViewedAt)}` : ''
      }`,
      tone: 'on',
    }
  } else {
    status = { text: t('Not opened yet'), tone: 'idle' }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'nx-surface flex flex-col gap-0 overflow-hidden border-border bg-background p-0 backdrop-blur-none',
          // Phones: bottom sheet (full width, square bottom, safe-area padding).
          'top-auto bottom-0 left-0 max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none pb-[env(safe-area-inset-bottom)]',
          // sm and up: centred 580px dialog.
          'sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:max-h-[85dvh] sm:max-w-[580px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[28px] sm:pb-0',
        )}
      >
        {/* Decorative grab handle (phones only); the sheet has no drag gesture. */}
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden" />

        <DialogHeader className="flex shrink-0 flex-row items-start justify-between gap-3 pl-5 pr-3 pt-3 pb-1 text-left sm:pl-6 sm:pr-4 sm:pt-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle className="text-[19px] leading-tight font-semibold tracking-tight">
              {t('Share estimate')}
            </DialogTitle>
            <div className="flex min-w-0 items-center gap-2 text-[13.5px] text-muted-foreground">
              {clientName && (
                <span
                  aria-hidden="true"
                  className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10.5px] font-semibold text-primary"
                >
                  {getInitials(clientName)}
                </span>
              )}
              <span className="min-w-0 truncate">
                {clientName && <b className="font-semibold text-foreground">{clientName}</b>}
                {clientName && ' · '}
                {[totalLabel, numberLabel].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t('Close')}
            // 40px hit area around a 36px round visual.
            className="group flex size-10 shrink-0 items-center justify-center rounded-full focus:outline-none"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <X className="h-4 w-4" />
            </span>
          </button>
          <DialogDescription className="sr-only">
            {t('Copy the link or the message and send it from your own apps.')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-5 pt-3.5 pb-5 sm:px-6 sm:pt-4 sm:pb-6">
          {/* --- Block 1: the online estimate --- */}
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className={cn(LABEL, 'whitespace-nowrap')}>{t('Online estimate')}</p>
              <p
                data-testid="send-hub-status"
                className={cn(
                  'flex min-w-0 items-center gap-1.5 text-[12.5px]',
                  status.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    status.tone === 'ok' && 'bg-emerald-500',
                    status.tone === 'on' && 'bg-primary',
                    status.tone === 'idle' && 'bg-muted-foreground/60',
                  )}
                />
                <span className="truncate">{status.text}</span>
              </p>
            </div>

            <div
              data-testid="send-hub-card-online-link"
              className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border bg-muted sm:flex-row"
            >
              <ClientPageMiniature
                companyName={companyName}
                companyLogoUrl={companyLogoUrl ?? null}
                numberLabel={numberLabel}
                title={projectName}
                clientName={clientName}
                totalLabel={totalLabel}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-3 p-3.5">
                <p
                  data-testid="send-hub-url"
                  className="m-0 truncate text-[14.5px] leading-snug font-medium text-foreground sm:overflow-visible sm:whitespace-normal sm:[overflow-wrap:anywhere]"
                >
                  {displayUrl}
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => void handleCopyUrl()}
                    style={PRIMARY_STYLE}
                    className={cn(PRIMARY_BTN, 'min-w-0 flex-1')}
                  >
                    {urlCopied ? <Check className="size-[18px]" /> : <Copy className="size-[18px]" />}
                    {urlCopied ? t('Link copied') : t('Copy link')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleOpenUrl}
                    className={cn(SECONDARY_BTN, 'h-[50px] shrink-0 px-[18px] text-[14.5px]')}
                  >
                    <Eye className="size-[18px]" />
                    {t('Open')}
                  </Button>
                </div>
                {urlCopied && (
                  <p className="m-0 text-[12.5px] text-muted-foreground">
                    {t('Paste it where you already talk to the client.')}
                  </p>
                )}
                {/* Keyed by estimate.id so switching estimates/versions remounts
                    fresh local state instead of carrying over the previous
                    estimate's editing state. */}
                <SharePasswordControl
                  key={estimate.id}
                  estimateId={estimate.id}
                  initiallyProtected={!!estimate.share_password_hash}
                />
              </div>
            </div>
          </div>

          {/* --- Block 2: the ready message, always visible + editable --- */}
          <MessageTextBlock
            estimateId={estimate.id}
            value={messageText}
            edited={messageText !== generatedText}
            linkUrl={buildAbsoluteUrl()}
            onChange={(text) => setDraft({ id: estimate.id, text })}
            onReset={() => setDraft(null)}
          />

          <button
            type="button"
            data-testid="send-hub-card-pdf"
            onClick={handleDownloadPdf}
            className={cn(
              TEXT_BTN,
              '-mt-1.5 inline-flex items-center gap-2 self-center rounded-full px-4 py-2.5 text-sm font-semibold hover:bg-primary/10',
            )}
          >
            <Download className="size-[18px]" />
            {t('Download PDF')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------------------
// ClientPageMiniature: a picture of the public client page, shown from sm up.
// The white card is always light, like the real public page, so literal light
// colours are intentional here.
// -----------------------------------------------------------------------------
function ClientPageMiniature({
  companyName,
  companyLogoUrl,
  numberLabel,
  title,
  clientName,
  totalLabel,
}: {
  companyName: string
  companyLogoUrl: string | null
  numberLabel: string
  title: string
  clientName: string
  totalLabel: string
}) {
  const { t } = useTranslation()
  return (
    <div
      aria-hidden="true"
      className="hidden w-[214px] shrink-0 items-end justify-start pt-5 pl-[18px] sm:flex"
      style={{
        backgroundImage:
          'linear-gradient(160deg, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.08))',
      }}
    >
      <div className="flex w-[196px] flex-col gap-[3px] rounded-tl-xl bg-white px-3.5 pt-3 pb-3.5 text-[#0f172a] shadow-[0_-6px_24px_-8px_hsl(228_50%_10%/0.5)]">
        <div className="mb-1.5 flex items-center gap-1.5">
          {companyLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- decorative miniature of a user-uploaded logo
            <img src={companyLogoUrl} alt="" className="size-[18px] rounded-[5px] object-cover" />
          ) : (
            <span className="flex size-[18px] items-center justify-center rounded-[5px] bg-[#0f172a] text-[7px] font-bold text-white">
              {getInitials(companyName)}
            </span>
          )}
          <b className="truncate text-[10px] font-semibold leading-none">{companyName}</b>
        </div>
        <small className="text-[7.5px] font-semibold uppercase tracking-[0.08em] text-[#8a94a6]">
          {t('Estimate')} {numberLabel}
        </small>
        <strong className="line-clamp-2 text-[13px] leading-tight font-bold tracking-tight">{title}</strong>
        {clientName && <span className="truncate text-[9.5px] text-[#475569]">{clientName}</span>}
        <div className="mt-1.5 flex items-baseline justify-between border-t border-[#e6eaf1] pt-1.5">
          <span className="text-[9px] text-[#475569]">{t('Total')}</span>
          <b className="text-[15px] leading-none font-bold text-[hsl(224_80%_45%)]">{totalLabel}</b>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// SharePasswordControl: Phase 193-02 — set/remove a password on the share
// link. Local optimistic state; router.refresh() after a successful save
// re-runs the project page's server components so the header's Insights chip
// lock badge (components/workspace/estimate/engagement-button.tsx, already
// wired to estimate.share_password_hash) picks up the change without a full
// reload.
// -----------------------------------------------------------------------------
// Exported (only) so tests/unit/estimate/share-password-control.test.tsx can
// exercise the toggle/set/remove behavior directly without assembling the
// full SendHubDialog estimate/company fixture.
export function SharePasswordControl({
  estimateId,
  initiallyProtected,
}: {
  estimateId: string
  initiallyProtected: boolean
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const [isProtected, setIsProtected] = useState(initiallyProtected)
  const [editing, setEditing] = useState(false)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSetPassword() {
    setSaving(true)
    setError(null)
    const result = await setEstimateSharePassword(estimateId, password)
    setSaving(false)
    if (result.success) {
      setIsProtected(true)
      setEditing(false)
      setPassword('')
      toast.success(t('Password set'))
      router.refresh()
    } else {
      setError(result.error ?? t('Failed to update the estimate password.'))
    }
  }

  async function handleRemovePassword() {
    setSaving(true)
    setError(null)
    const result = await setEstimateSharePassword(estimateId, null)
    setSaving(false)
    if (result.success) {
      setIsProtected(false)
      toast.success(t('Password removed'))
      router.refresh()
    } else {
      setError(result.error ?? t('Failed to update the estimate password.'))
    }
  }

  function cancelEditing() {
    setEditing(false)
    setPassword('')
    setError(null)
  }

  return (
    <div data-testid="send-hub-share-password" className="flex min-w-0 flex-col gap-2">
      {editing && !isProtected ? (
        <div className="flex items-center gap-2">
          <Input
            type="password"
            autoComplete="new-password"
            enterKeyHint="done"
            placeholder={t('Set a password')}
            aria-label={t('Set a password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              // Return saves, same as tapping Save (which is disabled until valid).
              if (e.key === 'Enter' && !saving && password.trim().length >= 4) {
                e.preventDefault()
                void handleSetPassword()
              }
            }}
            // 16px text: below that iOS Safari zooms the page on focus.
            className="h-11 min-w-0 flex-1 rounded-xl bg-background text-base"
          />
          <Button
            variant="ghost"
            disabled={saving || password.trim().length < 4}
            onClick={() => void handleSetPassword()}
            className={cn(SECONDARY_BTN, 'h-10 shrink-0 px-3.5 text-[13.5px]')}
          >
            {t('Save')}
          </Button>
          <Button
            variant="ghost"
            aria-label={t('Cancel')}
            onClick={cancelEditing}
            className={cn(SECONDARY_BTN, 'size-10 shrink-0 p-0')}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            'flex min-h-9 items-center gap-2 text-[13.5px] text-muted-foreground',
            isProtected && 'text-foreground/80',
          )}
        >
          {isProtected ? (
            <Lock aria-hidden="true" className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <LockOpen aria-hidden="true" className="size-4 shrink-0" />
          )}
          <span className="min-w-0 flex-1 leading-tight">
            {isProtected ? t('Password protected') : t('No password')}
          </span>
          {isProtected ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleRemovePassword()}
              className={cn(TEXT_BTN, 'shrink-0 whitespace-nowrap py-2 text-[13.5px] disabled:opacity-50')}
            >
              {t('Remove')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={cn(TEXT_BTN, 'shrink-0 whitespace-nowrap py-2 text-[13.5px]')}
            >
              {t('Add password')}
            </button>
          )}
        </div>
      )}
      {isProtected && (
        <p className="-mt-1 text-[12.5px] text-muted-foreground">
          {t('Remember to send the password to the client through another channel.')}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// -----------------------------------------------------------------------------
// MessageTextBlock: the formatted plain-text message, always visible in the
// hub and editable in place. Copy copies the (possibly edited) text followed by
// the public link and logs a plain_text/copy delivery row; Restore brings back
// the generated template output.
// -----------------------------------------------------------------------------
function MessageTextBlock({
  estimateId,
  value,
  edited,
  linkUrl,
  onChange,
  onReset,
}: {
  estimateId: string
  value: string
  edited: boolean
  linkUrl: string
  onChange: (text: string) => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${value}\n\n${linkUrl}`)
      setCopied(true)
      toast.success(t('Message copied'))
      setTimeout(() => setCopied(false), 2000)
      // Fire-and-forget delivery log -- a log-write failure must never
      // surface a toast, the copy already succeeded.
      void logDeliveryAction({
        estimateId,
        format: 'plain_text',
        channel: 'copy',
      })
    } catch {
      toast.error(t('Failed to copy message'))
    }
  }

  return (
    <div data-testid="send-hub-card-plain-text" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className={cn(LABEL, 'flex items-center gap-2')}>
          {t('Ready message')}
          {edited && (
            <span
              data-testid="send-hub-edited-tag"
              className="rounded-full bg-amber-500/15 px-2 py-1 text-[10.5px] font-semibold normal-case tracking-[0.04em] text-amber-700 dark:text-amber-400"
            >
              {t('Edited')}
            </span>
          )}
        </p>
        <Button
          variant="ghost"
          onClick={() => void handleCopy()}
          className={cn(SECONDARY_BTN, 'h-10 px-3.5 text-[13.5px]')}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t('Copied!') : t('Copy')}
        </Button>
      </div>
      <div className="rounded-2xl border border-border bg-muted px-4 py-3.5">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t('Ready message')}
          className="h-[168px] min-h-0 resize-none rounded-none border-0 bg-transparent p-0 text-[15px] leading-normal shadow-none [field-sizing:fixed] focus-visible:shadow-none sm:h-[150px]"
        />
      </div>
      <p className="m-0 text-[12.5px] text-muted-foreground">
        {t('The estimate link goes at the end of the copied message.')}
        {edited && (
          <>
            {' '}
            <button type="button" onClick={onReset} className={cn(TEXT_BTN, 'text-[12.5px]')}>
              {t('Restore the original text')}
            </button>
          </>
        )}
      </p>
    </div>
  )
}
