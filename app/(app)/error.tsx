'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { isRecoverableChunkError, recoverFromStaleChunkError } from '@/lib/pwa/chunk-recovery'

// Pre-launch audit fix: previously the authenticated app shell relied solely
// on the root app/error.tsx, whose only recovery action is "Try again" — for
// a signed-in user mid-workflow, a link back to the dashboard is a more
// useful escape hatch than reloading the same broken page.
export default function AppShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
    recoverFromStaleChunkError(error).catch(() => {})
  }, [error])

  const isChunkError = isRecoverableChunkError(error)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-medium text-foreground">Something went wrong.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        We hit an unexpected error loading this page. Your data is safe — try again or head back to your dashboard.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground/60">Error ID: {error.digest}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (isChunkError) {
              recoverFromStaleChunkError(error).catch(() => reset())
              return
            }
            reset()
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-accent"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
