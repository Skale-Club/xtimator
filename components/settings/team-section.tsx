'use client'

import { useState, useTransition } from 'react'
import { Users, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n/use-translation'
import { formatUSD } from '@/lib/utils/format'
import { removeMember, changeMemberRole, revokeInvite } from '@/lib/actions/team'
import type { RosterMember, RosterInvite } from '@/lib/queries/team'
import type { SeatCostSummary } from '@/lib/billing/seat-cost-summary'

type ManageableRole = 'admin' | 'member'

interface Props {
  companyId: string
  members: RosterMember[]
  invites: RosterInvite[]
  canManage: boolean
  seatCost: SeatCostSummary | null
}

export function TeamSection({ companyId, members: initialMembers, invites: initialInvites, canManage, seatCost }: Props) {
  const { t } = useTranslation()
  const [members, setMembers] = useState(initialMembers)
  const [invites, setInvites] = useState(initialInvites)

  const [isPending, startTransition] = useTransition()

  const roleLabel = (role: RosterMember['role']) => {
    if (role === 'owner') return t('Owner')
    if (role === 'admin') return t('Admin')
    return t('Member')
  }

  function handleChangeRole(userId: string, role: ManageableRole) {
    startTransition(async () => {
      const result = await changeMemberRole(companyId, userId, role)
      if (!('error' in result)) {
        setMembers((prev) =>
          prev.map((m) => (m.user_id === userId ? { ...m, role } : m)),
        )
      }
    })
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      const result = await removeMember(companyId, userId)
      if (!('error' in result)) {
        setMembers((prev) => prev.filter((m) => m.user_id !== userId))
      }
    })
  }

  function handleRevoke(inviteId: string) {
    startTransition(async () => {
      const result = await revokeInvite(inviteId)
      if (!('error' in result)) {
        setInvites((prev) => prev.filter((i) => i.id !== inviteId))
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* SEED-055 D9: one company + one user until add-ons exist. Inviting
          teammates is unavailable for everyone; the member list stays visible
          and existing members/invites can still be managed. */}
      {canManage && (
        <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {t('Inviting teammates is not available yet.')}
        </p>
      )}

      {/* Seat-cost summary (SEAT-08) — owner/admin only; null means do not show.
          Every figure comes from the seatCost prop via formatUSD — no hardcoded
          dollar amount or seat number in the copy. */}
      {seatCost && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {seatCost.activeSeats} {t('seats')} · {seatCost.includedSeats} {t('included')} ·{' '}
                {seatCost.billableSeats} {t('billable')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {t('Per seat')}: {formatUSD(seatCost.perSeatCents)}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-muted-foreground">
                {t('Estimated monthly seat cost')}
              </p>
              <p className="text-base font-semibold">{formatUSD(seatCost.monthlyCents)}</p>
            </div>
          </div>
          {!seatCost.enforcementEnabled && (
            <p className="text-xs text-muted-foreground">
              {t('Seat billing is not yet active — this is an estimate.')}
            </p>
          )}
        </div>
      )}

      {/* Members */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg text-center">
          <Users className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">{t('No members yet')}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Teammates will be able to join once add-ons are available.')}
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {members.map((member) => {
            const manageable = canManage && member.role !== 'owner'
            return (
              <div
                key={member.user_id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.display_name ?? member.email ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{member.email ?? '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {manageable ? (
                    <>
                      <Select
                        value={member.role === 'owner' ? 'admin' : member.role}
                        onValueChange={(v) =>
                          handleChangeRole(member.user_id, v as ManageableRole)
                        }
                      >
                        <SelectTrigger className="min-h-[44px] w-[120px]" aria-label={t('Role')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">{t('Member')}</SelectItem>
                          <SelectItem value="admin">{t('Admin')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
                            aria-label={t('Remove member')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t('Remove this member?')}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('They will lose access to this company. Estimates they created remain unchanged.')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="min-h-[44px]">
                              {t('Cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleRemove(member.user_id)}
                            >
                              {t('Remove')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    <span className="text-xs font-medium rounded-full border px-3 py-1 text-muted-foreground">
                      {roleLabel(member.role)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t('Pending invites')}</h3>
          <div className="divide-y rounded-lg border">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {invite.display_name ?? invite.email}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabel(invite.role)} · {t('Pending')}
                  </p>
                </div>
                {canManage && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
                        aria-label={t('Revoke invite')}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('Revoke this invite?')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('The invite link will stop working and the person will not be able to join.')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="min-h-[44px]">
                          {t('Cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleRevoke(invite.id)}
                        >
                          {t('Revoke')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
