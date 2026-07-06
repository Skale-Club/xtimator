'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Send, Loader2 } from 'lucide-react'
import { handoffDemoCompany } from '@/lib/actions/admin-handoff'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface HandoffButtonProps {
  companyId: string
  companyName: string
}

export function HandoffButton({ companyId, companyName }: HandoffButtonProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(value: boolean) {
    if (!value) setEmail('')
    setOpen(value)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Email is required.')
      return
    }

    startTransition(async () => {
      const result = await handoffDemoCompany(companyId, email.trim())
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Invite sent to ${email}`)
      handleOpenChange(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
      >
        <Send className="h-3 w-3" />
        Hand off
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-sm glass-strong border border-[var(--glass-border)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" />
              Hand off account
            </DialogTitle>
            <DialogDescription className="sr-only">
              Send an owner invite to transfer this demo account to a prospect.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground -mt-2">
            Send an owner invite for <strong>{companyName}</strong> to the prospect.
            They become owner after accepting; you remain as admin.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="handoff-email">Prospect email *</Label>
              <Input
                id="handoff-email"
                type="email"
                placeholder="prospect@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !email.trim()}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending…
                  </>
                ) : (
                  'Send invite'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
