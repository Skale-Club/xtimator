'use client'

import { useState, useTransition } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export type ConnectState =
  | { kind: 'not_configured' }
  | { kind: 'not_connected' }
  | { kind: 'connected'; displayName: string; email: string | null }

/**
 * Three-state card for the /settings/payments page. The `not_configured`
 * branch fires when the platform-level Connect Client ID is unset; the
 * `not_connected` branch shows the Connect CTA; the `connected` branch shows
 * the linked Stripe account + a Disconnect button (POST to disconnect API).
 */
export function StripeConnectCard({ state }: { state: ConnectState }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDisconnect() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/stripe/connect/disconnect', {
          method: 'POST',
        })
        const json = (await res.json()) as { ok: boolean; message?: string }
        if (!json.ok) {
          setError(json.message ?? 'Disconnect failed')
          return
        }
        window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Disconnect failed')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stripe payments</CardTitle>
        <CardDescription>
          Accept card payments from customers directly on your shared estimates.
          Funds settle to your own Stripe account — Xtimator never holds your money.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === 'not_configured' && (
          <p className="text-sm text-muted-foreground">
            Stripe Connect is not yet enabled on this platform. Please contact support.
          </p>
        )}
        {state.kind === 'not_connected' && (
          <p className="text-sm text-muted-foreground">
            Connect your Stripe account in one click. Test mode works for setup.
          </p>
        )}
        {state.kind === 'connected' && (
          <div className="text-sm">
            <p className="flex items-center">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 mr-2" />
              Connected as <strong className="ml-1">{state.displayName}</strong>
            </p>
            {state.email && (
              <p className="text-muted-foreground mt-1">{state.email}</p>
            )}
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive mt-3">{error}</p>
        )}
      </CardContent>
      <CardFooter>
        {state.kind === 'not_connected' && (
          <a href="/api/stripe/connect/initiate">
            <Button className="bg-[#406EF1] hover:bg-[#3558c2] text-white">
              Connect Stripe Account
            </Button>
          </a>
        )}
        {state.kind === 'connected' && (
          <Button
            variant="outline"
            onClick={handleDisconnect}
            disabled={isPending}
          >
            {isPending ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
