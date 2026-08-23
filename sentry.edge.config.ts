import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Pre-launch audit fix: edge requests carry end-clients' PII (names/
  // addresses/phone) in the auth cookie and referral cookie; sendDefaultPii
  // would attach IPs/cookies/headers to every event by default. See the
  // matching change in instrumentation.ts / instrumentation-client.ts.
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enableLogs: true,
});
