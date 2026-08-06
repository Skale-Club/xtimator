# Cloudflare CDN — xtimator.com

**Status:** live since 2026-08-05.
**Zone:** `xtimator.com` (id `f4526407a944ec6098b4c1e951c0e8cd`), Free plan.
**Origin:** Hetzner `188.245.112.3` (Coolify / Traefik).

Before this, `xtimator.com` resolved straight to the Hetzner IP: the zone was
on Cloudflare nameservers but every record was grey (DNS-only), so there was
no edge cache and no edge TLS.

## What is proxied

| Record | Type | Proxied |
|---|---|---|
| `xtimator.com` | A → 188.245.112.3 | yes |
| `www.xtimator.com` | CNAME → xtimator.com | yes |

That is the whole zone — there are only two A/CNAME records.

## Settings changed

| Setting | Before | After | Why |
|---|---|---|---|
| SSL/TLS mode | **Flexible** | **Full (strict)** | See "the Flexible trap" below |
| Email Obfuscation | on | **off** | Rewrites emails in HTML + injects JS → React hydration mismatch |
| CAA | 12 records | +`ssl.com` (issue + issuewild) | `ssl.com` is a Universal SSL CA and was the one gap |

Everything else was already safe and was left alone: Rocket Loader off (it
breaks React hydration), Auto Minify all off, Polish/Mirage off.

### The Flexible trap — the reason ordering matters

The zone was set to SSL mode **Flexible**, which makes Cloudflare speak plain
HTTP to the origin. The origin answers `http://xtimator.com` with a **302 to
HTTPS** (verified). Proxying in that state produces an infinite redirect loop
and takes the whole site down.

The fix is free *only if done in the right order*: change the SSL mode while
the records are still grey, where the setting has no effect at all, then
proxy. Doing it the other way round means the loop is live while you fix it.

Full (strict) requires a publicly-valid origin certificate. Verified before
switching (`curl https://xtimator.com/` with verification on, from the origin
IP) — Coolify's Let's Encrypt cert is valid, so strict validates.

## Caching

**No cache rule was needed, and none was added.** Unlike the xkedule setup,
there is nothing here to rescue with a custom rule:

- `/_next/static/*` carries real extensions and `immutable`, so Cloudflare's
  default rules already cache it — verified MISS → HIT.
- App HTML is `Cache-Control: private, no-cache, no-store` and comes back
  `DYNAMIC`. Correct: this is an authenticated SaaS, HTML must never cache.
- **Images are NOT on the CDN yet — but a same-origin route now exists.**
  Phase 187 shipped `GET /storage/{bucket}/{key}` (see
  `docs/STORAGE-MIGRATION.md`): `platform-brand` is served
  `public, max-age=31536000, immutable` and `logos`
  `public, max-age=300, stale-while-revalidate=86400` — both cacheable by
  Cloudflare's default rules, `logos` deliberately revalidating because logo
  URLs are overwritten in place. Tenant-private buckets (`photos`, `audio`,
  `pdfs`) are served `private, no-store` and must never be edge-cached.
  **No image URL has been repointed at the route yet** — the 41 landing-page
  image references still come from `*.supabase.co`, so they still bypass the
  edge entirely today. The MISS→HIT proof on real landing images is PROXY-05
  in Phase 192. No Cloudflare cache rule was added for this route; none is
  needed.

## Verified after cutover

- `xtimator.com`, `www.xtimator.com`, `/api/health` → 200 with `CF-RAY`
- No redirect loop: 0 hops from `https://`, 1 hop from `http://`
- Authenticated `/dashboard` renders fully through the edge, no console errors
- `/api/inngest` returns 401 on **both** origin and edge — pre-existing
  signature check, not a Cloudflare effect (checked explicitly because a
  broken Inngest sync fails silently)
- Stripe webhook reaches the app (400 = signature rejected by the app itself)
  **even with no User-Agent**, so Browser Integrity Check is not blocking
  server-to-server callers
- `/signup`, `/pricing` 404 identically on origin and edge — those routes
  simply do not exist

## Failure mode to know about

Full (strict) means **the origin certificate must stay valid**. If Coolify's
Let's Encrypt renewal ever breaks, nothing happens for up to 90 days and then
every request becomes a `526 Invalid SSL certificate` at once. If you ever see
mass 526s, the problem is the origin cert in Coolify — not Cloudflare.

## Credentials

The cutover used a scoped API token (`xtimator cdn cutover 2026-08`:
xtimator.com only, DNS + Zone Settings + Cache Rules, Edit). It lives only in
the operator's scratchpad, never in the repo. Revoke it once the setup is
confirmed stable — it has no ongoing job.
