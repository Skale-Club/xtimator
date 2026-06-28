import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const deploymentId = process.env.DEPLOYMENT_VERSION
  ?.trim()
  .replace(/[^a-zA-Z0-9_-]/g, '-');

// Content-Security-Policy (Security Review S10). Shipped in REPORT-ONLY mode:
// it surfaces violations in the browser console / report stream WITHOUT blocking
// anything, so the policy can be validated against the real app (Supabase,
// Stripe, Cloudflare Turnstile, Vercel) before being switched to enforcing.
// 'unsafe-inline' on script-src is currently required by Next.js + Stripe embeds;
// tighten to a nonce-based variant before flipping to enforce.
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.openai.com https://openrouter.ai https://api.stripe.com https://api.inngest.com",
  "frame-src https://js.stripe.com https://challenges.cloudflare.com",
  "media-src 'self' blob: https://*.supabase.co",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Baseline security headers (Security Review S10 / B03 — "zero headers" finding).
const securityHeaders = [
  // Force HTTPS for two years incl. subdomains. Prod is HTTPS-only on Vercel.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Block MIME-type sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Clickjacking defense — app is not embedded cross-origin.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Don't leak full URLs to third parties.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Permissions-Policy: allow the capture features Xtimator's core flow needs
  // (microphone for audio, camera for photos, geolocation for job sites) only
  // for same-origin, and disable powerful APIs the app never uses.
  {
    key: 'Permissions-Policy',
    value:
      'camera=(self), microphone=(self), geolocation=(self), payment=(self), accelerometer=(), gyroscope=(), magnetometer=(), usb=(), serial=(), bluetooth=()',
  },
  // CSP in report-only mode — see cspReportOnly note above.
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  output: 'standalone',
  // Self-hosted skew protection: navigation from a browser running an older
  // build hard-reloads instead of sending stale RSC / Server Action references
  // to the newly deployed container.
  deploymentId: deploymentId || undefined,
  experimental: {
    serverActions: {
      // 3 step images (4MB each) + hero image (4MB) + JSON content
      bodySizeLimit: '20mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // Proxy errors through /monitoring to bypass ad-blockers
  tunnelRoute: "/monitoring",
  disableLogger: true,
});
