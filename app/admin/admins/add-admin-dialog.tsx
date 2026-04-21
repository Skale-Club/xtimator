'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
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
import { addAdminSchema } from '@/lib/schemas/admin'
import { addPlatformAdmin } from './actions'

type FormValues = { email: string }

/**
 * Add-admin dialog (UI-SPEC §AddAdminDialog + Copywriting Contract).
 *
 * - Dialog opens via "Add admin" trigger button.
 * - react-hook-form + zod (addAdminSchema from lib/schemas/admin).
 * - On submit: calls addPlatformAdmin server action; surfaces inline error from
 *   the action result message (matches "No user registered…" / "already a
 *   platform admin." copy verbatim).
 * - Success: toast "{email} is now a platform admin." + close + reset form.
 */
export function AddAdminDialog() {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    // zodResolver cast to any matches the project-wide pattern for zod v4
    // optional/default mismatches with react-hook-form (see 02-02 decisions).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(addAdminSchema as any),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null)
    startTransition(async () => {
      const result = await addPlatformAdmin({ email: values.email })
      if (result.ok) {
        toast.success(`${values.email} is now a platform admin.`)
        form.reset()
        setOpen(false)
      } else {
        setServerError(result.message)
      }
    })
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setServerError(null)
          form.reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Add admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add platform admin</DialogTitle>
          <DialogDescription>
            Enter the email of a user who has already signed up. They&apos;ll gain
            access to /admin on their next navigation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="owner@example.com"
              {...form.register('email')}
            />
            {form.formState.errors.email ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.email.message}
              </p>
            ) : null}
            {serverError ? (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add admin'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
