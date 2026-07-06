import * as Sentry from "@sentry/nextjs";
import { isBenignDomMutationError } from "@/lib/observability/sentry-filters";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  sendDefaultPii: true,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: false }),
  ],
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
  ],
  beforeSend(event) {
    // Browser translation (manual/forced, or a translation extension)
    // rewrites React-owned text nodes and can make React's own cleanup throw
    // a benign removeChild/insertBefore NotFoundError (XTIMATOR-6). Not an
    // application bug — see lib/observability/sentry-filters.ts.
    if (isBenignDomMutationError(event)) return null;
    return event;
  },
});

// Captures App Router client-side navigation transitions
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
