import * as Sentry from "@sentry/nextjs";

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
});

// Captures App Router client-side navigation transitions
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
