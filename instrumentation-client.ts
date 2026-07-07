import * as Sentry from "@sentry/nextjs";
import { isBenignDomMutationError } from "@/lib/observability/sentry-filters";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Pre-launch audit fix: this app's users' screens routinely show job-site
  // photos and end-clients' names/addresses/phone numbers. sendDefaultPii
  // attaches IPs/headers/cookies to every event, and blockAllMedia:false let
  // Replay capture on-screen photos — both are unnecessary PII/CCPA exposure
  // for a bug-reporting tool. Text is still masked (maskAllText) for layout
  // debugging; only images/video are blocked.
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
    // Browser-extension noise (XTIMATOR-9): extensions calling their own
    // chrome.runtime APIs from content scripts injected into our pages. Not
    // reachable from application code.
    /runtime\.sendMessage/i,
    /Extension context invalidated/i,
    /chrome-extension|moz-extension|safari-extension|safari-web-extension/i,
  ],
  // Drop events whose stack originates inside an injected extension script.
  denyUrls: [
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari(-web)?-extension:\/\//i,
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
