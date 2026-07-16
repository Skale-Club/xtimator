// components/workspace/send/send-hub-dialog.tsx
// Phase 163 (SENDHUB-01, SENDHUB-03, SENDHUB-06): format-first Send hub.
// Three primary format cards (Online Estimate / PDF / Plain Text), each with
// its own delivery actions. Retires the channel-first email/SMS tab layout AND the
// separate dropdown menu that used to sit in the dialog header (see 163-06
// for the deletion sweep).
//
// 163-04 landed the layout + Copy URL / Open URL bindings. 163-05 (THIS plan)
// replaces every remaining placeholder onClick with a real server-action or
// route call, threads the `format` field into every send POST body, and
// records copy/open/download actions via logDeliveryAction. The retire and
// dispatch surfaces (email/SMS/WhatsApp routes + WhatsApp dispatcher +
// estimate_deliveries schema) were widened in Tasks 1-2 of this same plan.

'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Send,
} from 'lucide-react'
import { LanguageFlagChip } from './language-flag-chip'
import { PlainTextSheet } from './plain-text-sheet'
import { logDeliveryAction, markAsSentAction } from '@/lib/actions/estimate'
import { buildEstimatePublicPath } from '@/lib/estimate/public-url'
import {
  resolveTemplate,
  buildItemsBreakdown,
} from '@/lib/utils/estimate-template'
import { formatCurrency } from '@/lib/utils/format'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { EstimateTemplate } from '@/lib/utils/estimate-template'

type SendFormat = 'online_link' | 'pdf' | 'plain_text'

export interface SendHubDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estimate: EstimateWithSections | null
  projectName: string
  companyName: string
  /**
   * Company slug -- needed by buildEstimatePublicPath to construct the friendly
   * Phase 160 URL. Falls back to the legacy /estimate/{share_token} path when
   * null/undefined (matches buildShareLink today). Wired in from estimate-tab
   * in Task 3; the parent chain (OverviewTab -> ProjectWorkspace -> page)
   * threads it in a follow-on 163-05 commit.
   */
  companySlug?: string | null
  clientEmail: string | null
  clientPhone: string | null
  clientName: string
  ownerName: string
  estimateTemplate: EstimateTemplate
  smsDeliveryEnabled: boolean
  /**
   * Whether WhatsApp delivery is available for this account — a single opaque
   * boolean resolved server-side in the project page from the tier entitlement
   * ∧ the account registry's active status (getWhatsAppAccountStatus). When
   * false, the WhatsApp actions are hidden. Defaults to true when the parent
   * omits it, keeping the hub's shape stable.
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
  smsDeliveryEnabled,
  whatsappEnabled,
  clientEmail,
  clientPhone,
  clientName,
  ownerName,
  estimateTemplate,
}: SendHubDialogProps) {
  const [plainTextOpen, setPlainTextOpen] = useState(false)
  const [isMarkingSent, startMarkTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  if (!estimate) return null

  const showWhatsapp = whatsappEnabled !== false
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

  // ---------------------------------------------------------------------------
  // Online Estimate: pure client-side URL affordances (no network dispatch).
  // logDeliveryAction is fire-and-forget -- copy/open success is what matters
  // to the user, and a log-write failure must NEVER trigger an error toast.
  // ---------------------------------------------------------------------------
  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(buildAbsoluteUrl())
      toast.success('Link copied')
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
    // deliveryLog=true is a signal to /pdf/route.ts that this open was
    // triggered by the hub. Wiring the route to self-log on the flag is a
    // follow-up; today the client-side logDeliveryAction above is authoritative.
    window.open(
      `/api/estimates/${estimate!.id}/pdf?deliveryLog=true`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  // ---------------------------------------------------------------------------
  // Plain Text: render locally using the same recipe PlainTextSheet uses,
  // then copy + log.
  // ---------------------------------------------------------------------------
  async function handleCopyPlainText() {
    try {
      const resolvedSettings = resolvePresentationSettings(
        (estimate as { presentation_settings?: unknown }).presentation_settings,
      )
      const text = resolveTemplate(estimateTemplate, {
        client_name: clientName,
        company_name: companyName,
        owner_name: ownerName,
        total: formatCurrency(estimate!.total, estimate!.currency_code),
        items_breakdown: buildItemsBreakdown(estimate!, resolvedSettings),
      })
      await navigator.clipboard.writeText(text)
      toast.success('Plain text copied')
      void logDeliveryAction({
        estimateId: estimate!.id,
        format: 'plain_text',
        channel: 'copy',
      })
    } catch {
      toast.error('Failed to copy plain text')
    }
  }

  // ---------------------------------------------------------------------------
  // Email / SMS / WhatsApp per format. Each POSTs to the route Task 1 widened
  // to accept `format`. If clientEmail/clientPhone is null, we abort with a
  // clear toast -- a modal input flow is a follow-up. Recipient is pulled
  // from the linked client's contact fields (drop-in with the retired
  // channel-first form's field-picker behaviour).
  // ---------------------------------------------------------------------------
  async function sendEmail(opts: { format: SendFormat; label: string }) {
    if (!clientEmail) {
      toast.error("No email on file for this client")
      return
    }
    setPendingAction(`email-${opts.format}`)
    try {
      const res = await fetch(`/api/estimates/${estimate!.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: clientEmail,
          subject: `Your estimate from ${companyName}`,
          body: `Hi ${clientName || 'there'},\n\nYour estimate is ready. View it here: ${buildAbsoluteUrl()}\n\nThanks,\n${ownerName}`,
          attachPdf: false,
          format: opts.format,
        }),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(errBody.error ?? `Failed to send ${opts.label}`)
        return
      }
      toast.success(`${opts.label} sent`)
    } catch {
      toast.error(`Failed to send ${opts.label}`)
    } finally {
      setPendingAction(null)
    }
  }

  async function sendSms(opts: { format: SendFormat; label: string }) {
    if (!clientPhone) {
      toast.error("No phone on file for this client")
      return
    }
    setPendingAction(`sms-${opts.format}`)
    try {
      const res = await fetch(`/api/estimates/${estimate!.id}/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: clientPhone, format: opts.format }),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(errBody.error ?? `Failed to send ${opts.label}`)
        return
      }
      toast.success(`${opts.label} sent`)
    } catch {
      toast.error(`Failed to send ${opts.label}`)
    } finally {
      setPendingAction(null)
    }
  }

  async function sendWhatsapp(opts: { format: SendFormat; label: string }) {
    if (!clientPhone) {
      toast.error("No phone on file for this client")
      return
    }
    setPendingAction(`whatsapp-${opts.format}`)
    try {
      // NOTE: the WhatsApp route destructures `to` (E.164), NOT `phone`.
      const res = await fetch(`/api/estimates/${estimate!.id}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: clientPhone, format: opts.format }),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(errBody.error ?? `Failed to send ${opts.label}`)
        return
      }
      toast.success(`${opts.label} sent`)
    } catch {
      toast.error(`Failed to send ${opts.label}`)
    } finally {
      setPendingAction(null)
    }
  }

  function handleMarkAsSent() {
    startMarkTransition(async () => {
      try {
        const result = await markAsSentAction(estimate!.id)
        if (result && 'error' in result && result.error) {
          toast.error(result.error)
          return
        }
        toast.success('Marked as sent')
        onOpenChange(false)
      } catch {
        toast.error('Failed to mark as sent')
      }
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Wider than the retired channel-first dialog so 3 format cards can lay
            side-by-side at md+; on mobile they stack. max-h in dvh + overflow-y-auto
            mirrors the retired dialog's mobile-friendliness. */}
        <DialogContent className="sm:max-w-3xl max-h-[85dvh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
              <div className="flex min-w-0 items-center gap-2">
                <DialogTitle className="truncate">Send estimate</DialogTitle>
                {/* SENDHUB-06: display-only language chip; there is NO picker
                    (language is locked at generation time). */}
                <LanguageFlagChip lang={estimate.language} />
              </div>
            </div>
            <DialogDescription>
              Choose a format and how to deliver it.
            </DialogDescription>
          </DialogHeader>

          {/* SENDHUB-01: three primary format cards -- NOT a channel-first
              tab strip, NOT an overflow dropdown. Grid stacks on mobile
              (grid-cols-1) and lays out horizontally at md+ (grid-cols-3). */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* --- Online Estimate card (default) --- */}
            <Card
              data-testid="send-hub-card-online-link"
              variant="glass"
              className="border-primary/40"
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ExternalLink className="h-4 w-4" /> Online Estimate
                </CardTitle>
                <CardDescription>
                  Shareable link the client opens in a browser
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={handleCopyUrl}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy URL
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={handleOpenUrl}
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open URL
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  disabled={pendingAction === 'email-online_link'}
                  onClick={() => void sendEmail({ format: 'online_link', label: 'Email link' })}
                >
                  <Mail className="mr-2 h-3.5 w-3.5" /> Email
                </Button>
                {smsDeliveryEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    disabled={pendingAction === 'sms-online_link'}
                    onClick={() => void sendSms({ format: 'online_link', label: 'SMS link' })}
                  >
                    <MessageSquare className="mr-2 h-3.5 w-3.5" /> SMS
                  </Button>
                )}
                {showWhatsapp && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    disabled={pendingAction === 'whatsapp-online_link'}
                    onClick={() => void sendWhatsapp({ format: 'online_link', label: 'WhatsApp link' })}
                  >
                    <Send className="mr-2 h-3.5 w-3.5" /> WhatsApp
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* --- PDF card --- */}
            <Card data-testid="send-hub-card-pdf" variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Download className="h-4 w-4" /> PDF
                </CardTitle>
                <CardDescription>
                  Downloadable branded PDF; SMS/WhatsApp fall back to the online
                  link
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={handleDownloadPdf}
                >
                  <Download className="mr-2 h-3.5 w-3.5" /> Download PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  disabled={pendingAction === 'email-pdf'}
                  onClick={() => void sendEmail({ format: 'pdf', label: 'Email PDF' })}
                >
                  <Mail className="mr-2 h-3.5 w-3.5" /> Email
                </Button>
                {smsDeliveryEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    disabled={pendingAction === 'sms-pdf'}
                    onClick={() => void sendSms({ format: 'pdf', label: 'SMS (link fallback)' })}
                  >
                    <MessageSquare className="mr-2 h-3.5 w-3.5" /> SMS
                  </Button>
                )}
                {showWhatsapp && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    disabled={pendingAction === 'whatsapp-pdf'}
                    onClick={() => void sendWhatsapp({ format: 'pdf', label: 'WhatsApp (link fallback)' })}
                  >
                    <Send className="mr-2 h-3.5 w-3.5" /> WhatsApp
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* --- Plain Text card --- */}
            <Card data-testid="send-hub-card-plain-text" variant="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" /> Plain Text
                </CardTitle>
                <CardDescription>
                  Plain-text version of the estimate; SMS/WhatsApp fall back to
                  the online link
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() => void handleCopyPlainText()}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() => setPlainTextOpen(true)}
                >
                  <FileText className="mr-2 h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  disabled={pendingAction === 'email-plain_text'}
                  onClick={() => void sendEmail({ format: 'plain_text', label: 'Email plain text' })}
                >
                  <Mail className="mr-2 h-3.5 w-3.5" /> Email
                </Button>
                {smsDeliveryEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    disabled={pendingAction === 'sms-plain_text'}
                    onClick={() => void sendSms({ format: 'plain_text', label: 'SMS (link fallback)' })}
                  >
                    <MessageSquare className="mr-2 h-3.5 w-3.5" /> SMS
                  </Button>
                )}
                {showWhatsapp && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    disabled={pendingAction === 'whatsapp-plain_text'}
                    onClick={() => void sendWhatsapp({ format: 'plain_text', label: 'WhatsApp (link fallback)' })}
                  >
                    <Send className="mr-2 h-3.5 w-3.5" /> WhatsApp
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* SENDHUB-06: Mark as Sent is a subordinate secondary action --
              muted ghost styling, right-aligned below the primary format grid.
              Language chip already lives in the header above. */}
          <div className="mt-2 flex items-center justify-end border-t border-[var(--glass-border)] pt-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={isMarkingSent}
              onClick={handleMarkAsSent}
              aria-label="Mark as sent"
            >
              {isMarkingSent ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {isMarkingSent ? 'Marking' : 'Mark as sent'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PlainTextSheet is opened from the Plain Text card's "Edit" action.
          It stays a Sheet (right-side drawer) -- same UX as the retired
          plain-text editor affordance from the old dropdown, minus the
          menu wrapper. */}
      <PlainTextSheet
        key={estimate.id}
        open={plainTextOpen}
        onOpenChange={setPlainTextOpen}
        estimate={estimate}
        clientName={clientName}
        companyName={companyName}
        ownerName={ownerName}
        estimateTemplate={estimateTemplate}
      />
    </>
  )
}
