'use client'

/**
 * Account provisioning controls for the admin WhatsApp surface.
 *
 * Lists company configs and authorized senders for a selected company.
 * Allows super-admins to provision, edit status/delivery format, and
 * remove senders — all through the dedicated admin actions.
 *
 * Does NOT render Meta access tokens, WABA secrets, or full unmasked phone
 * in list tables. Full number is visible only inside the privileged form.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useClientReady } from '@/hooks/use-client-ready'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { T } from '@/components/i18n/t'
import {
  saveWhatsAppAccount,
  saveWhatsAppSender,
  resolveWhatsAppWelcomeStep,
  resolveWhatsAppWelcomeTemplate,
  type ActionResult,
  setWhatsAppSenderStatus,
  removeWhatsAppSender,
} from '@/lib/actions/admin-whatsapp-accounts'

// ─── Types ──────────────────────────────────────────────────────────────────

type ConfigRow = {
  id: string
  company_id: string
  status: string
  delivery_format: string
  review_reason: string | null
  welcome_sending_step: number | null
  welcomePhoneLast4: string | null
}

type SenderRow = {
  id: string
  company_id: string
  maskedPhone: string
  linkedAccountLabel: string | null
  needsPhoneOnlyConfirmation: boolean
  status: string
  created_by_admin: boolean | null
  verified_at: string | null
  welcome_template_claim_until: string | null
  welcome_template_needs_review: boolean
}

const DELIVERY_FORMATS = [
  { value: 'share_link', label: 'Share link' },
  { value: 'formatted_text', label: 'Formatted text' },
  { value: 'pdf_attachment', label: 'PDF attachment' },
]

const ACCOUNT_STATUS_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  active: [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }],
  suspended: [{ value: 'suspended', label: 'Suspended' }, { value: 'active', label: 'Active' }, { value: 'pending_review', label: 'Pending review' }],
  pending_review: [{ value: 'pending_review', label: 'Pending review' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }],
}

// ─── Status badge color ─────────────────────────────────────────────────────

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default'
    case 'suspended':
      return 'destructive'
    case 'pending_review':
    case 'pending':
      return 'secondary'
    default:
      return 'outline'
  }
}

// ─── Main component ─────────────────────────────────────────────────────────

interface AdminWhatsAppAccountsProps {
  companies: Array<{ id: string; name: string }>
  configs: ConfigRow[]
  senders: SenderRow[]
  companyId?: string
  companySearch: string
}

export function AdminWhatsAppAccounts({
  companies,
  configs,
  senders,
  companyId,
  companySearch,
}: AdminWhatsAppAccountsProps) {
  const router = useRouter()
  // Browser-local dates must not change the HTML during initial hydration.
  const clientReady = useClientReady()
  const companyConfig = configs.find((config) => config.company_id === companyId)
  const companySenders = senders.filter((sender) => sender.company_id === companyId)
  const welcomeTemplateReviews = companySenders.filter((sender) =>
    sender.welcome_template_needs_review && sender.welcome_template_claim_until,
  )
  const [configFields, setConfigFields] = useState<{ status: string; deliveryFormat: string } | null>(null)
  const status = configFields?.status ?? companyConfig?.status ?? 'pending_review'
  const deliveryFormat = configFields?.deliveryFormat ?? companyConfig?.delivery_format ?? 'share_link'
  const [addSenderOpen, setAddSenderOpen] = useState(false)
  const [editSenderPhone, setEditSenderPhone] = useState('')
  const [loading, setLoading] = useState(false)

  function selectCompany(id: string) {
    const params = new URLSearchParams({ companyId: id })
    if (companySearch) params.set('companySearch', companySearch)
    router.replace(`/admin/inbox/settings?${params}`, { scroll: false })
  }

  async function handleSaveAccount() {
    if (!companyId) return
    setLoading(true)
    try {
      const result = await saveWhatsAppAccount(companyId, { status, deliveryFormat })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(result.message)
      router.refresh()
    } catch {
      toast.error('Could not save the WhatsApp account.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddSender() {
    if (!companyId) return
    if (!editSenderPhone.trim()) {
      toast.error('Phone number is required')
      return
    }
    setLoading(true)
    try {
      const result = await saveWhatsAppSender(companyId, editSenderPhone)
      if (result.ok) {
        toast.success(result.message)
        setAddSenderOpen(false)
        setEditSenderPhone('')
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('An unexpected error occurred')
    }
    setLoading(false)
  }

  async function reconcileWelcomeDelivery(reconcile: () => Promise<ActionResult>) {
    setLoading(true)
    try {
      const result = await reconcile()
      if (!result.ok) toast.error(result.message)
      else {
        toast.success(result.message)
        router.refresh()
      }
    } catch {
      toast.error('Could not reconcile the welcome message.')
    } finally {
      setLoading(false)
    }
  }

  function recoverWelcome(resolution: 'sent' | 'unsent') {
    const step = companyConfig?.welcome_sending_step
    if (!companyId || step == null) return
    return reconcileWelcomeDelivery(() => resolveWhatsAppWelcomeStep(companyId, step, resolution))
  }

  function recoverWelcomeTemplate(sender: SenderRow, resolution: 'sent' | 'unsent') {
    const claimUntil = sender.welcome_template_claim_until
    if (!claimUntil) return
    return reconcileWelcomeDelivery(() => resolveWhatsAppWelcomeTemplate(sender.id, claimUntil, resolution))
  }

  async function handleStatusChange(sender: SenderRow, newStatus: string) {
    const confirmPhoneOnly = newStatus === 'active' && sender.needsPhoneOnlyConfirmation
    if (confirmPhoneOnly && !window.confirm('Authorize this phone number without a linked account?')) return
    setLoading(true)
    try {
      const result = await setWhatsAppSenderStatus(sender.id, newStatus, { confirmPhoneOnly })
      if (result.ok) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('An unexpected error occurred')
    }
    setLoading(false)
  }

  async function handleRemoveSender(senderId: string) {
    setLoading(true)
    try {
      const result = await removeWhatsAppSender(senderId)
      if (result.ok) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('An unexpected error occurred')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <Select value={companyId ?? ''} onValueChange={selectCompany}>
        <SelectTrigger className="w-full max-w-md" aria-label="WhatsApp company">
          <SelectValue placeholder="Select a company" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {companies.length === 0 && <p className="text-sm text-muted-foreground"><T>No matching companies.</T></p>}
      {/* Company Config section */}
      {companyId ? (
        <Card variant="glass" className="p-4">
          <h3 className="text-sm font-medium"><T>Account configuration</T></h3>
          {companyConfig?.review_reason && (
            <p className="mt-2 text-xs text-amber-600">
              <T>Review reason:</T> {companyConfig.review_reason}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {companyConfig ? (
              <div className="grid gap-1">
                <label htmlFor="whatsapp-account-status" className="text-xs text-muted-foreground"><T>Account status</T></label>
                <Select value={status} onValueChange={(value) => setConfigFields({ status: value, deliveryFormat })}>
                  <SelectTrigger id="whatsapp-account-status" className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(ACCOUNT_STATUS_OPTIONS[companyConfig.status] ?? []).map((option) => (
                      <SelectItem key={option.value} value={option.value}><T text={option.label} /></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : <p className="w-full text-sm text-muted-foreground"><T>New accounts start pending review.</T></p>}
            <div className="grid gap-1">
              <label htmlFor="whatsapp-delivery-format" className="text-xs text-muted-foreground"><T>Delivery format</T></label>
              <Select value={deliveryFormat} onValueChange={(value) => setConfigFields({ status, deliveryFormat: value })}>
                <SelectTrigger id="whatsapp-delivery-format" className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELIVERY_FORMATS.map((option) => (
                    <SelectItem key={option.value} value={option.value}><T text={option.label} /></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleSaveAccount}
              disabled={loading || (!!companyConfig && status === companyConfig.status && deliveryFormat === companyConfig.delivery_format)}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <T text={companyConfig ? 'Save account' : 'Provision account'} />
            </Button>
          </div>
          {companyConfig?.welcome_sending_step != null && (
            <div className="mt-4 space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">
                <T text="Welcome message {step}" values={{ step: companyConfig.welcome_sending_step + 1 }} />
                {companyConfig.welcomePhoneLast4 && <span className="text-muted-foreground"> ··{companyConfig.welcomePhoneLast4}</span>}
              </p>
              <p className="text-muted-foreground">
                <T>After five minutes, check the delivery with Meta or the recipient before selecting an outcome. Unsent messages resume on the next inbound WhatsApp message.</T>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => recoverWelcome('sent')}>
                  <T>Confirmed sent</T>
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => recoverWelcome('unsent')}>
                  <T>Confirmed unsent</T>
                </Button>
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {welcomeTemplateReviews.length > 0 && (
        <Card variant="glass" className="space-y-3 p-4">
          <h3 className="text-sm font-medium"><T>Welcome template delivery</T></h3>
          <p className="text-sm text-muted-foreground">
            <T>Wait five minutes, then check delivery with Meta or the sender before confirming an outcome.</T>
          </p>
          {welcomeTemplateReviews.map((sender) => (
            <div key={sender.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono">{sender.maskedPhone}</span>
              <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => recoverWelcomeTemplate(sender, 'sent')}>
                <T>Confirmed sent</T>
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => recoverWelcomeTemplate(sender, 'unsent')}>
                <T>Confirmed unsent</T>
              </Button>
            </div>
          ))}
        </Card>
      )}

      {/* Senders section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium"><T>Authorized Senders</T></h3>
          {companyConfig && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => setAddSenderOpen(true)}
              disabled={loading}
            >
              <Plus size={13} />
              <T>Add sender</T>
            </Button>
          )}
        </div>

        {companySenders.length === 0 ? (
          <Card variant="glass" className="p-4">
            <p className="text-sm text-muted-foreground">
              {companyId ? (
                <T>No authorized senders for this company.</T>
              ) : (
                <T>Select a company to view senders.</T>
              )}
            </p>
          </Card>
        ) : (
          <Card variant="glass" className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium"><T>Phone</T></th>
                    <th className="text-left px-4 py-3 font-medium"><T>Status</T></th>
                    <th className="text-left px-4 py-3 font-medium"><T>Verified</T></th>
                    <th className="text-left px-4 py-3 font-medium"><T>Member</T></th>
                    <th className="text-right px-4 py-3 font-medium"><T>Actions</T></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {companySenders.map((sender) => (
                    <tr key={sender.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs">
                        {sender.maskedPhone}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusBadgeVariant(sender.status)}>
                          <T text={sender.status} />
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {sender.verified_at ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle size={12} />
                            {clientReady ? new Date(sender.verified_at).toLocaleDateString() : '—'}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <XCircle size={12} />
                            <T>Not verified</T>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {sender.linkedAccountLabel ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(sender.status === 'pending_review' || sender.status === 'suspended') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => handleStatusChange(sender, 'active')}
                              disabled={loading || (!sender.verified_at && !sender.needsPhoneOnlyConfirmation)}
                              aria-label={sender.status === 'suspended' ? 'Reactivate sender' : 'Activate sender'}
                              title={sender.verified_at || sender.needsPhoneOnlyConfirmation ? 'Activate sender' : 'Verify phone before activating'}
                            >
                              <CheckCircle size={12} />
                            </Button>
                          )}
                          {sender.status === 'active' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => handleStatusChange(sender, 'suspended')}
                              disabled={loading}
                              aria-label="Suspend sender"
                            >
                              <XCircle size={12} />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs text-destructive"
                            onClick={() => handleRemoveSender(sender.id)}
                            disabled={loading || sender.status === 'suspended'}
                            aria-label="Remove sender"
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Add Sender Dialog */}
      <Dialog open={addSenderOpen} onOpenChange={setAddSenderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><T>Add Authorized Sender</T></DialogTitle>
            <DialogDescription>
              <T>
                Confirm that this phone number belongs to an authorized person. The number will have access to the WhatsApp assistant for this company without a linked account.
              </T>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium" htmlFor="sender-phone">
                <T>Phone number (E.164)</T>
              </label>
              <Input
                id="sender-phone"
                placeholder="+15551234567"
                value={editSenderPhone}
                onChange={(e) => setEditSenderPhone(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddSenderOpen(false)}
              disabled={loading}
            >
              <T>Cancel</T>
            </Button>
            <Button onClick={handleAddSender} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <T>Add sender</T>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
