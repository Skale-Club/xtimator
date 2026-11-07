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
import { SettingsCard, SettingsStack } from '@/components/settings/settings-ui'

type ManageableRole = 'admin' | 'member'

interface Props {
  companyId: string
  /** The signed-in person, marked "You" in the list. */
  currentUserId?: string
  members: RosterMember[]
  invites: RosterInvite[]
  canManage: boolean
  seatCost: SeatCostSummary | null
}

export function TeamSection({ companyId, currentUserId, members: initialMembers, invites: initialInvites, canManage, seatCost }: Props) {
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

  const seatWord = (n: number) => (n === 1 ? t('seat') : t('seats'))

  return (
    <SettingsStack>

      {/* Seat-cost summary (SEAT-08) — owner/admin only; null means do not show.
          Every figure comes from the seatCost prop via formatUSD — no hardcoded
          dollar amount or seat number in the copy. */}
      {seatCost && (
        <SettingsCard title={t('Seats')} bodyClassName="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {seatCost.activeSeats} {seatWord(seatCost.activeSeats)} · {seatCost.includedSeats} {t('included')} ·{' '}
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
              {t('Seat billing is not active yet. This is an estimate.')}
            </p>
          )}
        </SettingsCard>
      )}

      {/* Members */}
      <SettingsCard
        title={t('Members')}
        description={
          canManage
            ? t('Inviting teammates is not available yet. You can still manage the people already here.')
            : undefined
        }
        bodyClassName="p-0 sm:p-0"
      >
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">{t('No members yet')}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Teammates will be able to join once add-ons are available.')}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--glass-border)]">
          {members.map((member) => {
            const manageable = canManage && member.role !== 'owner'
            return (
              <div
                key={member.user_id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3.5 sm:px-6"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                  >
                    {(member.display_name || member.email || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">
                        {member.display_name ?? member.email ?? (member.role === 'owner' ? t('Account owner') : t('Team member'))}
                      </span>
                      {member.user_id === currentUserId && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {t('You')}
                        </span>
                      )}
                    </p>
                    {member.display_name && member.email && (
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    )}
                  </div>
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

      </SettingsCard>

      {/* Pending invites */}
      {invites.length > 0 && (
        <SettingsCard title={t('Pending invites')} bodyClassName="p-0 sm:p-0">
          <div className="divide-y divide-[var(--glass-border)]">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-3.5 sm:px-6"
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
        </SettingsCard>
      )}
    </SettingsStack>
  )
}
