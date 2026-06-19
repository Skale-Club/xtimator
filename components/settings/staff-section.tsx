'use client'

import { useState, useTransition } from 'react'
import { Users, Plus, Trash2, Eye, EyeOff, Copy, Check } from 'lucide-react'
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
import { createStaffMember, removeStaffMember, type StaffMember } from '@/lib/actions/staff'

interface Props {
  staff: StaffMember[]
}

export function StaffSection({ staff: initialStaff }: Props) {
  const [staff, setStaff] = useState(initialStaff)
  const [addOpen, setAddOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [tempPassword, setTempPassword] = useState('')
  const [createdName, setCreatedName] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    if (!name.trim() || !email.trim()) {
      setFormError('Name and email are required.')
      return
    }
    setFormError('')

    startTransition(async () => {
      const result = await createStaffMember(name.trim(), email.trim())
      if ('error' in result) {
        setFormError(result.error)
        return
      }
      const addedName = name.trim()
      const addedEmail = email.trim()
      setTempPassword(result.tempPassword)
      setCreatedName(addedName)
      setName('')
      setEmail('')
      setAddOpen(false)
      setPasswordOpen(true)
      setStaff((prev) => [
        ...prev,
        {
          user_id: crypto.randomUUID(),
          display_name: addedName,
          email: addedEmail,
          created_at: new Date().toISOString(),
        },
      ])
    })
  }

  function handleCopy() {
    navigator.clipboard.writeText(tempPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleRemove(userId: string) {
    startTransition(async () => {
      const result = await removeStaffMember(userId)
      if (!('error' in result)) {
        setStaff((prev) => prev.filter((s) => s.user_id !== userId))
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Staff Members</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Team members who can create clients and estimates. Their name appears as
            &ldquo;Prepared by&rdquo; on estimates they generate.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Staff Member</DialogTitle>
              <DialogDescription>
                A first-access password will be generated for them to log in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="staff-name">Full Name</Label>
                <Input
                  id="staff-name"
                  placeholder="Jane Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-email">Email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={isPending}>
                {isPending ? 'Creating…' : 'Create Account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg text-center">
          <Users className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No staff members yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add team members so they can create estimates under their own name.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {staff.map((member) => (
            <div key={member.user_id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{member.display_name ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{member.email ?? '—'}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {member.display_name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      They will lose access to this company. Estimates they created remain
                      unchanged.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => handleRemove(member.user_id)}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account created for {createdName}</DialogTitle>
            <DialogDescription>
              Share this temporary password with them. It is shown only once — they can change it
              after logging in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Temporary Password</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                type={showPassword ? 'text' : 'password'}
                value={tempPassword}
                className="font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPasswordOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
