'use client'

import { useState, useTransition } from 'react'
import { Users, UserPlus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { inviteMember, removeMember, changeMemberRole, revokeInvite } from '@/lib/actions/team'
import type { RosterMember, RosterInvite } from '@/lib/queries/team'

type ManageableRole = 'admin' | 'member'

interface Props {
  companyId: string
  members: RosterMember[]
  invites: RosterInvite[]
  canManage: boolean
}

export function TeamSection({ companyId, members: initialMembers, invites: initialInvites, canManage }: Props) {
  const { t } = useTranslation()
  const [members, setMembers] = useState(initialMembers)
  const [invites, setInvites] = useState(initialInvites)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<ManageableRole>('member')
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  const roleLabel = (role: RosterMember['role']) => {
    if (role === 'owner') return t('Owner')
    if (role === 'admin') return t('Admin')
    return t('Member')
  }

  function handleInvite() {
    if (!inviteEmail.trim()) {
      setFormError(t('Email is required.'))
      return
    }
    setFormError('')

    startTransition(async () => {
      const email = inviteEmail.trim()
      const role = inviteRole
      const result = await inviteMember(companyId, email, role)
      if ('error' in result) {
        setFormError(result.error ?? t('An unexpected error occurred.'))
        return
      }
      setInvites((prev) => [
        ...prev,
        { id: crypto.randomUUID(), email: email.toLowerCase(), role },
      ])
      setInviteEmail('')
      setInviteRole('member')
      setInviteOpen(false)
    })
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('Team')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('People in your company and their roles.')}
          </p>
        </div>
        {canManage && (
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="min-h-[44px]">
                <UserPlus className="w-4 h-4 mr-2" />
                {t('Invite')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('Invite a teammate')}</DialogTitle>
                <DialogDescription>
                  {t('They will receive an email with a link to join your company.')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">{t('Email')}</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="jane@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-role">{t('Role')}</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as ManageableRole)}
                  >
                    <SelectTrigger id="invite-role" className="min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">{t('Member')}</SelectItem>
                      <SelectItem value="admin">{t('Admin')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formError && <p className="text-sm text-destructive">{formError}</p>}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setInviteOpen(false)}
                >
                  {t('Cancel')}
                </Button>
                <Button className="min-h-[44px]" onClick={handleInvite} disabled={isPending}>
                  {isPending ? t('Sending…') : t('Send Invite')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Members */}
      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg text-center">
          <Users className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">{t('No members yet')}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Invite teammates so they can collaborate on estimates.')}
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
                  <p className="text-sm font-medium truncate">{invite.email}</p>
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
