import 'server-only'

/**
 * Pre-launch audit fix — boot-time env validation. Before this, a missing
 * env var only surfaced the first time the code path that reads it ran (a
 * "verde" deploy that passes the Docker healthcheck, then breaks the moment
 * a real user hits the affected feature — e.g. rate limiting silently
 * fail-opening because UPSTASH_* was mistyped in Coolify).
 *
 * Split into two tiers, matching this codebase's established fail-visible
 * (not fail-hard) philosophy:
 *   - CRITICAL: nothing works without these (DB connectivity). Throwing here
 *     crashes the boot — appropriate, since every request needs Supabase
 *     anyway and a crash-on-boot is far more actionable than a slow cascade
 *     of "supabaseUrl is required" errors on the first request.
 *   - IMPORTANT: features degrade gracefully today (Stripe returns 503,
 *     Redis rate-limiting fails open, Inngest jobs never start) rather than
 *     crash — so these are reported LOUDLY (console.error + Sentry) but do
 *     NOT stop the server, preserving uptime for the parts that DO work.
 */
const CRITICAL_VARS = ['NEXT_PUBLIC_SUPABASE_URL'] as const

/** At least one of these must be set (checked as a group, not individually). */
const CRITICAL_VAR_GROUPS = [
  ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  // getCanonicalBaseUrl()/resolveBaseUrl() (lib/utils/site-url.ts) resolve every
  // Stripe redirect URL from APP_ORIGIN → NEXT_PUBLIC_SITE_URL → (legacy)
  // NEXT_PUBLIC_APP_URL → the hardcoded xtimator.com fallback. Neither of the
  // first two is declared in the Dockerfile today — missing BOTH silently
  // degrades every checkout/portal/setup redirect to the hardcoded fallback
  // domain rather than failing loudly, so it's checked here as a group.
  ['APP_ORIGIN', 'NEXT_PUBLIC_SITE_URL'],
] as const

const IMPORTANT_VARS = [
  'OPENROUTER_API_KEY',
  'INNGEST_SIGNING_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  // Stripe webhook signature verification fails closed without this — every
  // checkout.session.completed / invoice.paid event silently stops crediting.
  'STRIPE_WEBHOOK_SECRET',
  // lib/crypto/aes (BYOK keys, other encrypted platform_integrations rows)
  // throws on every encrypt/decrypt call without this — degrades a specific
  // feature set rather than the whole app, so IMPORTANT not CRITICAL.
  'APP_ENCRYPTION_KEY',
] as const

export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return

  const missingCritical: string[] = CRITICAL_VARS.filter((name) => !process.env[name])
  for (const group of CRITICAL_VAR_GROUPS) {
    if (!group.some((name) => process.env[name])) {
      missingCritical.push(`one of [${group.join(', ')}]`)
    }
  }

  if (missingCritical.length > 0) {
    throw new Error(
      `[env-check] Missing required production env var(s): ${missingCritical.join(', ')}. ` +
        'The app cannot serve any request without these — refusing to boot.'
    )
  }

  const missingImportant = IMPORTANT_VARS.filter((name) => !process.env[name])
  if (missingImportant.length > 0) {
    // Loud, but non-fatal — these features degrade gracefully (see file
    // docstring). console.error is picked up by the platform's log
    // aggregation regardless of Sentry configuration.
    console.error(
      `[env-check] Missing important production env var(s): ${missingImportant.join(', ')}. ` +
        'Affected features will silently degrade (rate limiting fails open without ' +
        'UPSTASH_*, AI generation fails without OPENROUTER_API_KEY, background jobs ' +
        'never run without INNGEST_SIGNING_KEY). Boot continues.'
    )
  }
}
