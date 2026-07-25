const SERVER_ACTION_MISMATCH =
  'Failed to find Server Action. This request might be from an older or newer deployment.'

const MALFORMED_FORM_DATA_PATTERNS = new Set([
  'Failed to parse body as FormData.',
  'no boundary found in multipart body',
])

// Browsers (and translation extensions) that rewrite React-owned text nodes
// into `<font>` wrappers corrupt the DOM tree React expects to reconcile
// against. React's own cleanup/reconciliation then throws one of these two
// messages when it tries to remove or reinsert a node translation already
// detached/replaced. `translate="no"` + a `notranslate` meta tag (see
// app/layout.tsx) stop Chrome's *automatic* translate offer, but not a user
// manually forcing translation (right-click menu, address-bar icon) or a
// third-party translation extension — so this benign, framework-external
// class of error can still occur (XTIMATOR-6). It has no actionable
// first-party stack frame; see facebook/react#11538.
const BENIGN_DOM_MUTATION_PATTERNS = [
  /Failed to execute 'removeChild' on 'Node'/,
  /Failed to execute 'insertBefore' on 'Node'/,
  /The node to be removed is not a child of this node/,
]

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

/**
 * Current Next.js versions report malformed multipart probes against `/` as
 * `POST /page` (XTIMATOR-2). Older versions classified the same scanner
 * traffic as `POST /_not-found/page`, which is already covered above.
 *
 * Keep this filter transaction- AND message-scoped: a genuine FormData
 * parsing failure on an application API route must remain reportable.
 */
export function isUnreportableRootPageFormDataProbe(
  event: SentryExceptionLike,
): boolean {
  return (
    event.transaction === 'POST /page' &&
    event.exception?.values?.some(
      ({ value }) => value != null && MALFORMED_FORM_DATA_PATTERNS.has(value),
    ) === true
  )
}

/**
 * Browser-translation / extension DOM mutation causing a benign React
 * removeChild/insertBefore NotFoundError (XTIMATOR-6). Not fixable in
 * application code — filter it so it doesn't reopen as a false-positive
 * regression. Matches on exception value since these throw with no
 * first-party frame.
 */
export function isBenignDomMutationError(event: SentryExceptionLike): boolean {
  return (
    event.exception?.values?.some(
      ({ value }) => value != null && BENIGN_DOM_MUTATION_PATTERNS.some((p) => p.test(value)),
    ) === true
  )
}
