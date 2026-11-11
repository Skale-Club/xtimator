'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { deleteAccount } from '@/lib/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const CONFIRM_WORD = 'DELETE'

/**
 * Self-service account deletion (Google Play "account deletion" requirement).
 * Lives on the public /delete-account page, which the account settings link to,
 * so the same flow serves the in-app path and the web resource.
 */
export function DeleteAccountPanel({ accountLabel }: { accountLabel: string }) {
  const [confirmation, setConfirmation] = useState('')
  const [isPending, startTransition] = useTransition()
  const confirmed = confirmation.trim().toUpperCase() === CONFIRM_WORD

  function onDelete(event?: FormEvent) {
    event?.preventDefault()
    if (!confirmed) return
    startTransition(async () => {
      const result = await deleteAccount()
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Your account was deleted.')
      // Full navigation so no cached authenticated view survives the deletion.
      window.location.assign('/')
    })
  }

  return (
    // A real form: the phone keyboard's Go key submits it, and the keyboard
    // helper (lib/visual-viewport.ts) finds the submit button to keep it in view.
    <form onSubmit={onDelete} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{accountLabel}</span>.
      </p>
      <label htmlFor="delete-confirmation" className="block text-sm font-medium">
        Type {CONFIRM_WORD} to confirm
      </label>
      <Input
        id="delete-confirmation"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        enterKeyHint="go"
        disabled={isPending}
      />
      <Button
        type="submit"
        variant="destructive"
        className="w-full sm:w-auto"
        disabled={!confirmed || isPending}
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Delete my account permanently
      </Button>
    </form>
  )
}
