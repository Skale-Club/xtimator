'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { isRecoverableChunkError, recoverFromStaleChunkError } from '@/lib/pwa/chunk-recovery'

// Pre-launch audit fix: the public share-link page previously fell back to
// the root app/error.tsx for any render error — generic copy aimed at a
// signed-in app user. This page is viewed by anonymous clients following a
// link from their contractor, so the message avoids technical language and
// never suggests logging in.
export default function ShareLinkError({
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
    <div data-theme="light" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
      <p className="text-lg font-medium">We couldn&apos;t load this estimate.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Something went wrong on our end. Please try again, or contact the business that sent you this link.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground/60">Error ID: {error.digest}</p>
      )}
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
    </div>
  )
}
