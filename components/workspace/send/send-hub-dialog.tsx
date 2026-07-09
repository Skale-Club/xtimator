// components/workspace/send/send-hub-dialog.tsx
// Phase 163 (SENDHUB-01, SENDHUB-06): format-first Send hub.
// Three primary format cards (Online Estimate / PDF / Plain Text), each with
// its own delivery actions. Retires the channel-first SendForm tabs AND the
// separate dropdown menu that used to sit in the dialog header (see 163-06
// for the deletion sweep).
//
// Copy URL + Open URL are wired TODAY -- they are pure client-side operations
// (clipboard write + window.open) that don't require server logging. 163-05
// will ADD server-side delivery-tracking (an estimate_deliveries.insert with
// {channel: 'copy' | 'open', format: 'online_link', ...}) on top of them.
//
// Email / SMS / WhatsApp / Download buttons are PLACEHOLDERS -- their onClick
// shows toast.info('...  wired in 163-05'). Plan 163-05 replaces them with
// real server-action calls that also record deliveries into estimate_deliveries
// with the widened { format, channel, provider } payload from 163-02's
// migration.
//
// Mark as Sent IS wired here (SENDHUB-06 requirement of THIS plan) via the
// existing markAsSentAction server action.

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
import { markAsSentAction } from '@/lib/actions/estimate'
import { buildEstimatePublicPath } from '@/lib/estimate/public-url'
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
   * Whether WhatsApp delivery is configured for this account. Defaults to true
   * (buttons show but placeholder) so the hub's shape is stable across accounts;
   * 163-05 wires real gating from getWhatsAppAccountStatus().
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
  clientName,
  ownerName,
  estimateTemplate,
}: SendHubDialogProps) {
  const [plainTextOpen, setPlainTextOpen] = useState(false)
  const [isMarkingSent, startMarkTransition] = useTransition()

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

  async function handleCopyUrl() {
    try {
      await navigator.clipboard.writeText(buildAbsoluteUrl())
      toast.success('Link copied')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  function handleOpenUrl() {
    if (typeof window !== 'undefined') {
      window.open(buildAbsoluteUrl(), '_blank', 'noopener,noreferrer')
    }
  }

  function placeholder(action: string) {
    // SENDHUB-05: real wiring lands in 163-05 alongside estimate_deliveries
    // logging. Keeping a distinct toast per action makes RTL smoke testing in
    // a follow-up cheap.
    toast.info(`${action} — wired in 163-05`)
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
        {/* Wider than the retired SendDialog so 3 format cards can lay side-by-
            side at md+; on mobile they stack. max-h in dvh + overflow-y-auto
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
                  onClick={() => placeholder('Email link')}
                >
                  <Mail className="mr-2 h-3.5 w-3.5" /> Email
                </Button>
                {smsDeliveryEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => placeholder('SMS link')}
                  >
                    <MessageSquare className="mr-2 h-3.5 w-3.5" /> SMS
                  </Button>
                )}
                {showWhatsapp && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => placeholder('WhatsApp link')}
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
                  onClick={() => placeholder('Download PDF')}
                >
                  <Download className="mr-2 h-3.5 w-3.5" /> Download PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() => placeholder('Email PDF')}
                >
                  <Mail className="mr-2 h-3.5 w-3.5" /> Email
                </Button>
                {smsDeliveryEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => placeholder('SMS PDF (link fallback)')}
                  >
                    <MessageSquare className="mr-2 h-3.5 w-3.5" /> SMS
                  </Button>
                )}
                {showWhatsapp && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() =>
                      placeholder('WhatsApp PDF (link fallback)')
                    }
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
                  onClick={() => placeholder('Copy plain text')}
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
                  onClick={() => placeholder('Email plain text')}
                >
                  <Mail className="mr-2 h-3.5 w-3.5" /> Email
                </Button>
                {smsDeliveryEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() =>
                      placeholder('SMS plain text (link fallback)')
                    }
                  >
                    <MessageSquare className="mr-2 h-3.5 w-3.5" /> SMS
                  </Button>
                )}
                {showWhatsapp && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() =>
                      placeholder('WhatsApp plain text (link fallback)')
                    }
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
              {isMarkingSent ? 'Marking…' : 'Mark as sent'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PlainTextSheet is opened from the Plain Text card's "Edit" action.
          It stays a Sheet (right-side drawer) -- same UX as the retired
          plain-text editor affordance from the send-actions-menu, minus the
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
