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
import { Loader2, Plus, Pencil, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
}

type SenderRow = {
  id: string
  company_id: string
  config_id: string
  user_id: string | null
  phone_e164: string
  status: string
  created_by_admin: boolean | null
  verified_at: string | null
}

// ─── Masking helper ─────────────────────────────────────────────────────────

function maskPhone(e164: string): string {
  if (e164.length <= 6) return e164
  return `${e164.slice(0, 4)}****${e164.slice(-2)}`
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
  configs: ConfigRow[]
  senders: SenderRow[]
  companyId?: string
}

export function AdminWhatsAppAccounts({
  configs,
  senders,
  companyId,
}: AdminWhatsAppAccountsProps) {
  const [addSenderOpen, setAddSenderOpen] = useState(false)
  const [editSenderPhone, setEditSenderPhone] = useState('')
  const [loading, setLoading] = useState(false)

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
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('An unexpected error occurred')
    }
    setLoading(false)
  }

  async function handleStatusChange(senderId: string, newStatus: string) {
    setLoading(true)
    try {
      const result = await setWhatsAppSenderStatus(senderId, newStatus)
      if (result.ok) {
        toast.success(result.message)
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
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('An unexpected error occurred')
    }
    setLoading(false)
  }

  const companyConfig = configs.find((c) => c.company_id === companyId)
  const companySenders = senders.filter((s) => s.company_id === companyId)

  return (
    <div className="space-y-6">
      {/* Company Config section */}
      {companyConfig ? (
        <Card variant="glass" className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-sm font-medium"><T>Account Configuration</T></h3>
              <p className="text-xs text-muted-foreground">
                <T>Delivery format and status for this company.</T>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusBadgeVariant(companyConfig.status)}>
                <T text={companyConfig.status.replace('_', ' ')} />
              </Badge>
              <span className="text-xs text-muted-foreground">
                <T text={companyConfig.delivery_format} />
              </span>
            </div>
          </div>
          {companyConfig.review_reason && (
            <p className="mt-2 text-xs text-amber-600">
              <T>Review reason:</T> {companyConfig.review_reason}
            </p>
          )}
        </Card>
      ) : companyId ? (
        <Card variant="glass" className="p-4">
          <p className="text-sm text-muted-foreground">
            <T>No WhatsApp configuration for this company yet.</T>
          </p>
        </Card>
      ) : null}

      {/* Senders section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium"><T>Authorized Senders</T></h3>
          {companyId && (
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
                        {maskPhone(sender.phone_e164)}
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
                            {new Date(sender.verified_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <XCircle size={12} />
                            <T>Not verified</T>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {sender.user_id ? sender.user_id.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {sender.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => handleStatusChange(sender.id, 'active')}
                              disabled={loading || !sender.verified_at}
                              title={!sender.verified_at ? 'Verify phone before activating' : 'Activate'}
                            >
                              <CheckCircle size={12} />
                            </Button>
                          )}
                          {sender.status === 'active' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => handleStatusChange(sender.id, 'suspended')}
                              disabled={loading}
                            >
                              <XCircle size={12} />
                            </Button>
                          )}
                          {sender.status === 'suspended' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => handleStatusChange(sender.id, 'active')}
                              disabled={loading || !sender.verified_at}
                              title={!sender.verified_at ? 'Verify phone before activating' : 'Reactivate'}
                            >
                              <CheckCircle size={12} />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs text-destructive"
                            onClick={() => handleRemoveSender(sender.id)}
                            disabled={loading || sender.status === 'suspended'}
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
                Add a new phone number that can send WhatsApp messages on behalf of this company.
                The number must be in E.164 format (e.g. +15551234567).
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
