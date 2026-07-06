import 'server-only'
import * as Sentry from '@sentry/nextjs'

/**
 * lib/observability/capture.ts
 *
 * Report a swallowed background / fire-and-forget error to Sentry instead of
 * dropping it with a bare `.catch(() => undefined)`. Use for non-critical side
 * effects (welcome email, price-book seed, CRM sync) that must not block or fail
 * the main flow but should still be OBSERVABLE when they fail silently —
 * otherwise a broken side effect (e.g. onboarding never seeds the price book)
 * is invisible.
 *
 * Returns a `.catch()` handler and never throws:
 *   somePromise.catch(captureBackgroundError('company.welcomeEmail'))
 */
export function captureBackgroundError(context: string): (err: unknown) => void {
  return (err: unknown) => {
    try {
      Sentry.captureException(err, { tags: { background: context } })
    } catch {
      // Reporting itself must never crash a fire-and-forget path.
    }
  }
}
