import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  includeLocalVariables: true,
  enableLogs: true,
  beforeSend(event) {
    // Drop framework noise from bots/scanners that POST garbage to non-existent
    // Server Action / RSC endpoints. Next.js routes these bogus POSTs to the
    // not-found page and throws "Failed to find Server Action" / "Failed to parse
    // body as FormData" — not app bugs. Real Server Actions never target
    // /_not-found/page, so this filter is precise and does NOT suppress genuine
    // Server Action errors on real routes. (Sentry XTIMATOR-2, XTIMATOR-3)
    if (event.transaction === 'POST /_not-found/page') return null
    return event
  },
});
