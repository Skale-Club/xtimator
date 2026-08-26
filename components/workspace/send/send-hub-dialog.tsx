// components/workspace/send/send-hub-dialog.tsx
// Send hub, preview-first: Xtimator never dispatches email/SMS/WhatsApp itself.
// The owner sends from their OWN apps so client replies land where they
// already talk to the client (we rarely have reliable client contact data,
// and an in-app send would orphan the reply thread). The hub therefore:
//   1. heroes the online estimate (webview) with the full URL + a visible
//      Copy button,
//   2. pairs Download PDF with a single Share menu (wa.me / mailto: / sms: /
//      native share sheet) whose intents open the user's own app with the
//      message + link pre-filled,
//   3. keeps the copy-ready formatted message visible + editable inline.
// The old in-app dispatch routes (/send, /send-sms, /send-whatsapp) are no
// longer called from here, and the Mark-as-sent button was dropped from the
// hub (markAsSentAction still exists server-side for other callers).

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Lock,
  LockOpen,
  Mail,
  MessageSquare,
  RotateCcw,
  Send,
  Share2,
} from 'lucide-react'
import { LanguageFlagChip } from './language-flag-chip'
import { logDeliveryAction, setEstimateSharePassword } from '@/lib/actions/estimate'
import { buildEstimatePublicPath } from '@/lib/estimate/public-url'
import {
  resolveTemplate,
  buildItemsBreakdown,
} from '@/lib/utils/estimate-template'
import { formatCurrency } from '@/lib/utils/format'
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
   * null/undefined (matches buildShareLink today).
   */
  companySlug?: string | null
  /** Pre-fills the mailto: recipient when the client has an email on file. */
  clientEmail: string | null
  /** Pre-fills the wa.me / sms: recipient when the client has a phone on file. */
  clientPhone: string | null
  clientName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
  /**
   * @deprecated In-app SMS dispatch was removed from the hub -- sharing goes
   * through the user's own apps now. Accepted so existing parents keep
   * compiling; ignored.
   */
  smsDeliveryEnabled?: boolean
  /**
   * @deprecated In-app WhatsApp dispatch was removed from the hub -- wa.me
   * share intents need no account entitlement. Accepted so existing parents
   * keep compiling; ignored.
   */
  whatsappEnabled?: boolean
}

export function SendHubDialog({
  open,
  onOpenChange,
  estimate,
  projectName,
  companyName,
  companySlug,
  clientEmail,
  clientPhone,
  clientName,
  ownerName,
  estimateTemplate,
}: SendHubDialogProps) {
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

  // The copy-ready formatted message, same recipe the retired PlainTextSheet
  // used. Always visible + editable in the block below.
  const resolvedSettings = resolvePresentationSettings(
    (estimate as { presentation_settings?: unknown }).presentation_settings,
  )
  const generatedText = resolveTemplate(estimateTemplate, {
    client_name: clientName,
    company_name: companyName,
    owner_name: ownerName,
    total: formatCurrency(estimate.total, estimate.currency_code),
    items_breakdown: buildItemsBreakdown(estimate, resolvedSettings),
  })
  const messageText =
    draft?.id === estimate.id ? draft.text : generatedText

  /** What the share intents carry: the visible message plus the link. */
  function buildShareText(): string {
    return `${messageText}\n\n${buildAbsoluteUrl()}`
  }

  // ---------------------------------------------------------------------------
  // Online Estimate: pure client-side URL affordances (no network dispatch).
  // logDeliveryAction is fire-and-forget -- copy/open success is what matters
  // to the user, and a log-write failure must NEVER trigger an error toast.
  // ---------------------------------------------------------------------------
  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(buildAbsoluteUrl())
      setUrlCopied(true)
      toast.success('Link copied')
      setTimeout(() => setUrlCopied(false), 2000)
      void logDeliveryAction({
        estimateId: estimate!.id,
        format: 'online_link',
        channel: 'copy',
      })
    } catch {
      toast.error('Failed to copy link')
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
  // Share intents: open the USER'S OWN app with the message + link pre-filled.
  // Nothing is dispatched by Xtimator, so nothing is logged as a delivery.
  // ---------------------------------------------------------------------------
  function shareWhatsapp() {
    // wa.me wants digits only (E.164 without the +). Without a phone the
    // no-recipient variant opens WhatsApp's own contact picker.
    const digits = (clientPhone ?? '').replace(/\D/g, '')
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(buildShareText())}`
      : `https://wa.me/?text=${encodeURIComponent(buildShareText())}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function shareEmail() {
    const subject = encodeURIComponent(`Your estimate from ${companyName}`)
    const body = encodeURIComponent(buildShareText())
    // location.href (not window.open) so no blank tab is left behind when the
    // OS hands the mailto: off to the mail client.
    window.location.href = `mailto:${clientEmail ?? ''}?subject=${subject}&body=${body}`
  }

  function shareSms() {
    // The `?&body` form is the one both iOS and Android accept.
    const digits = (clientPhone ?? '').replace(/[^\d+]/g, '')
    window.location.href = `sms:${digits}?&body=${encodeURIComponent(buildShareText())}`
  }

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function shareNative() {
    try {
      await navigator.share({
        title: `Estimate from ${companyName}`,
        text: messageText,
        url: buildAbsoluteUrl(),
      })
    } catch {
      // User dismissed the share sheet -- not an error.
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <div className="flex min-w-0 items-center gap-2">
              <DialogTitle className="truncate">Share estimate</DialogTitle>
              {/* Display-only language chip; there is NO picker
                  (language is locked at generation time). */}
              <LanguageFlagChip lang={estimate.language} />
            </div>
          </div>
          <DialogDescription>
            Copy the link or message and send it from your own apps.
          </DialogDescription>
        </DialogHeader>

        {/* --- Hero: the online estimate (webview) is THE action; Download
            PDF sits right below it as THE secondary action.
            min-w-0: the full URL is one unbreakable "word" -- without it the
            grid track inflates to the URL's min-content width and every row
            overflows the dialog. --- */}
        <div
          data-testid="send-hub-card-online-link"
          className="flex min-w-0 flex-col gap-2"
        >
          <Button variant="primary" size="lg" onClick={handleOpenUrl}>
            <ExternalLink className="mr-2 h-4 w-4" /> Open Online Estimate
          </Button>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-md border border-input bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
              {buildAbsoluteUrl()}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => void handleCopyUrl()}
            >
              {urlCopied ? (
                <Check className="mr-2 h-3.5 w-3.5" />
              ) : (
                <Copy className="mr-2 h-3.5 w-3.5" />
              )}
              {urlCopied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          {/* Download PDF + Share side by side: PDF is the secondary action,
              Share bundles the intents (WhatsApp / Email / SMS / native share
              sheet) that open the user's own app with message + link. */}
          <div className="flex gap-2">
            <Button
              data-testid="send-hub-card-pdf"
              variant="outline"
              className="flex-1"
              onClick={handleDownloadPdf}
            >
              <Download className="mr-2 h-4 w-4" /> Download PDF
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-1">
                  <Share2 className="mr-2 h-4 w-4" /> Share
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={shareWhatsapp}>
                  <Send className="mr-2 h-4 w-4" /> WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem onClick={shareEmail}>
                  <Mail className="mr-2 h-4 w-4" /> Email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={shareSms}>
                  <MessageSquare className="mr-2 h-4 w-4" /> SMS
                </DropdownMenuItem>
                {canNativeShare && (
                  <DropdownMenuItem onClick={() => void shareNative()}>
                    <Share2 className="mr-2 h-4 w-4" /> More options
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* --- Phase 193-02: optional password lock on the share link. Keyed
            by estimate.id so switching estimates/versions remounts fresh
            local state instead of carrying over the previous estimate's
            editing state (same reasoning as `draft?.id === estimate.id`
            above for the message block). --- */}
        <SharePasswordControl
          key={estimate.id}
          estimateId={estimate.id}
          initiallyProtected={!!estimate.share_password_hash}
        />

        {/* --- Copy-ready message: always visible + editable inline. Share
            intents above carry this text (plus the link). --- */}
        <MessageTextBlock
          estimateId={estimate.id}
          value={messageText}
          onChange={(text) => setDraft({ id: estimate!.id, text })}
          onReset={() => setDraft(null)}
        />
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------------------
// SharePasswordControl: Phase 193-02 — set/remove a password on the share
// link. Local optimistic state (mirrors urlCopied above); router.refresh()
// after a successful save re-runs the project page's server components so
// the header's Insights chip lock badge (components/workspace/estimate/
// engagement-button.tsx, already wired to estimate.share_password_hash)
// picks up the change without a full reload.
// -----------------------------------------------------------------------------
// Exported (only) so tests/unit/estimate/share-password-control.test.tsx can
// exercise the toggle/set/remove behavior directly without assembling the
// full SendHubDialog estimate/company fixture -- SendHubDialog itself still
// only ever renders it inline above, never imports it from elsewhere.
export function SharePasswordControl({
  estimateId,
  initiallyProtected,
}: {
  estimateId: string
  initiallyProtected: boolean
}) {
  const router = useRouter()
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
      toast.success('Password set')
      router.refresh()
    } else {
      setError(result.error ?? 'Failed to set password')
    }
  }

  async function handleRemovePassword() {
    setSaving(true)
    setError(null)
    const result = await setEstimateSharePassword(estimateId, null)
    setSaving(false)
    if (result.success) {
      setIsProtected(false)
      toast.success('Password removed')
      router.refresh()
    } else {
      setError(result.error ?? 'Failed to remove password')
    }
  }

  return (
    <div
      data-testid="send-hub-share-password"
      className="flex flex-col gap-2 rounded-md border border-input p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isProtected ? (
            <>
              <Lock className="h-3.5 w-3.5" />
              <span>Password protected</span>
            </>
          ) : (
            <>
              <LockOpen className="h-3.5 w-3.5" />
              <span>Anyone with the link can view</span>
            </>
          )}
        </div>
        {isProtected ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => void handleRemovePassword()}
          >
            Remove
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel' : 'Protect with password'}
          </Button>
        )}
      </div>
      {editing && !isProtected && (
        <div className="flex items-center gap-2">
          <Input
            type="password"
            placeholder="Set a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            disabled={saving || password.trim().length < 4}
            onClick={() => void handleSetPassword()}
          >
            Save
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// -----------------------------------------------------------------------------
// MessageTextBlock: the formatted plain-text message, always visible in the
// hub. Controlled by the parent so the share intents carry edits. Copy copies
// the (possibly edited) text and logs a plain_text/copy delivery row; Reset
// restores the generated template output.
// -----------------------------------------------------------------------------
function MessageTextBlock({
  estimateId,
  value,
  onChange,
  onReset,
}: {
  estimateId: string
  value: string
  onChange: (text: string) => void
  onReset: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('Message copied')
      setTimeout(() => setCopied(false), 2000)
      // Fire-and-forget delivery log -- a log-write failure must never
      // surface a toast, the copy already succeeded.
      void logDeliveryAction({
        estimateId,
        format: 'plain_text',
        channel: 'copy',
      })
    } catch {
      toast.error('Failed to copy message')
    }
  }

  return (
    <div data-testid="send-hub-card-plain-text" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Copy-ready message
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Reset message"
            onClick={onReset}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
            {copied ? (
              <Check className="mr-2 h-3.5 w-3.5" />
            ) : (
              <Copy className="mr-2 h-3.5 w-3.5" />
            )}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={7}
        className="resize-none font-mono text-xs"
      />
    </div>
  )
}
