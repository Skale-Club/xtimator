'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { saveAutoTopupSettings, disableAutoTopup } from '@/lib/actions/auto-topup'

/**
 * Phase 153 Plan 03 (CREDITUI-07) — Manage auto top-up modal + its launcher
 * button. Client component (form state + server-action calls). Structural
 * precedent: app/admin/companies/handoff-button.tsx's
 * Dialog/DialogContent/DialogHeader/DialogFooter shape.
 *
 * The threshold is entered in DOLLARS (CONTEXT.md's dollar-first UI
 * instruction) and converted to credits at this call site only — 1 credit
 * === 1 cent of billing_config.creditUnitUsd's implied denomination, mirrored
 * from the same $-to-credits convention used by the top-up packs.
 */

interface AutoTopupDialogLauncherProps {
  enabled: boolean
  packs: Array<{ priceCents: number; credits: number }>
  currentThresholdCredits: number | null
  currentPackIndex: number | null
  hasPaymentMethod: boolean
}

export function AutoTopupDialogLauncher({
  enabled, packs, currentThresholdCredits, currentPackIndex, hasPaymentMethod,
}: AutoTopupDialogLauncherProps) {
  const [open, setOpen] = useState(false)
  const [thresholdDollars, setThresholdDollars] = useState(
    currentThresholdCredits ? currentThresholdCredits / 100 : 0
  )
  const [packIndex, setPackIndex] = useState(currentPackIndex ?? 1)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const thresholdCredits = Math.round(thresholdDollars * 100)
      const result = await saveAutoTopupSettings({ thresholdCredits, packIndex })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Auto top-up settings saved.')
      setOpen(false)
    })
  }

  function handleTurnOff() {
    startTransition(async () => {
      const result = await disableAutoTopup()
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Auto top-up turned off.')
      setOpen(false)
    })
  }

  return (
    <>
      <Button variant={enabled ? 'outline' : 'primary'} size="sm" onClick={() => setOpen(true)}>
        {enabled ? 'Manage' : 'Enable auto-top-up'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md glass-strong border border-[var(--glass-border)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              Manage auto top-up
            </DialogTitle>
            <DialogDescription className="sr-only">
              Configure the balance threshold, purchase amount, and payment method for automatic credit top-up.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="autotopup-threshold">When balance drops below</Label>
              <MoneyInput
                id="autotopup-threshold"
                value={thresholdDollars}
                onValueChange={setThresholdDollars}
                currencyCode="USD"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">We&rsquo;ll check this every time credits are used.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="autotopup-pack">Purchase this amount</Label>
              <Select
                value={String(packIndex)}
                onValueChange={(v) => setPackIndex(Number(v))}
                disabled={isPending}
              >
                <SelectTrigger id="autotopup-pack" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {packs.map((pack, i) => (
                    <SelectItem key={i} value={String(i)}>
                      ${pack.priceCents / 100} (&asymp;{pack.credits.toLocaleString()} credits)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              {hasPaymentMethod ? (
                <p className="text-sm text-muted-foreground">Payment method on file.</p>
              ) : (
                <PaymentMethodSetupButton />
              )}
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            {enabled && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                onClick={handleTurnOff}
                disabled={isPending}
              >
                Turn off auto top-up
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={isPending || !hasPaymentMethod}>
                {isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save changes'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PaymentMethodSetupButton() {
  const [loading, setLoading] = useState(false)
  async function handleAdd() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/create-autotopup-setup-session', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        toast.error('Could not start payment method setup. Please try again.')
        return
      }
      window.location.href = data.url
    } catch {
      toast.error('Could not start payment method setup. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">No payment method on file. Add one to enable auto top-up.</p>
      <Button type="button" variant="outline" size="sm" onClick={handleAdd} disabled={loading}>
        {loading ? 'Redirecting…' : 'Add payment method'}
      </Button>
    </div>
  )
}
