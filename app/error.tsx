"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { isRecoverableChunkError, recoverFromStaleChunkError } from "@/lib/pwa/chunk-recovery";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    recoverFromStaleChunkError(error).catch(() => {});
  }, [error]);

  const isChunkError = isRecoverableChunkError(error);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-muted-foreground">Something went wrong.</p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground/60">
          Error ID: {error.digest}
        </p>
      )}
      <button
        onClick={() => {
          if (isChunkError) {
            recoverFromStaleChunkError(error).catch(() => reset());
            return;
          }
          reset();
        }}
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}
