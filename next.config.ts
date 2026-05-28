import type { NextConfig } from "next";

// Baseline security headers (Security Review S10 / B03 — "zero headers" finding).
// CSP and Permissions-Policy are intentionally deferred: this app uses the
// microphone (audio capture), camera (photos), and Stripe payment surfaces, so
// both require feature-aware testing in a real browser before they can ship
// without breaking core flows.
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
];

const nextConfig: NextConfig = {
  output: 'standalone',
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

export default nextConfig;
