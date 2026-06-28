const SERVER_ACTION_MISMATCH =
  'Failed to find Server Action. This request might be from an older or newer deployment.'

interface SentryExceptionLike {
  transaction?: string
  exception?: {
    values?: Array<{
      value?: string
    }>
  }
}

/**
 * Next.js reports malformed or stale `Next-Action` request headers as an
 * uncaught framework error. They are client/scanner input and cannot be fixed
 * by an application stack trace. Keep every other exception reportable.
 */
export function isUnreportableServerActionMismatch(
  event: SentryExceptionLike,
): boolean {
  return (
    event.transaction === 'POST /_not-found/page' ||
    event.exception?.values?.some(
      ({ value }) => value === SERVER_ACTION_MISMATCH,
    ) === true
  )
}
