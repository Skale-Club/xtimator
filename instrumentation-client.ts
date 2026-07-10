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
  // Session Replay is loaded lazily AFTER init (see loadReplay below) so its
  // ~50-70KB integration bundle stays out of the initial client payload for
  // every visitor. The sample rates above still gate whether it records.
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

// Lazy-load Session Replay: fetch the integration bundle from the Sentry CDN
// only after init instead of shipping it in the initial chunk. The sample rates
// set in Sentry.init still control recording. Guarded + silent so a blocked/
// failed CDN load (ad blocker, offline, CSP) never affects the app.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void (async () => {
    try {
      const replayIntegration = await Sentry.lazyLoadIntegration("replayIntegration");
      Sentry.addIntegration(replayIntegration({ maskAllText: true, blockAllMedia: true }));
    } catch {
      // Best-effort — Replay is a debugging aid, not a critical path.
    }
  })();
}

// Captures App Router client-side navigation transitions
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
