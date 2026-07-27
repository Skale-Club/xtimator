# Public Demo Workspace

A public, read-only demo company that outside visitors can explore from the
landing page "See Demo" button before creating an account.

Since Phase 180/181 the demo is **not a separate mini-app**. Visitors land in
the *real* Xtimator application, signed in as a dedicated demo user, scoped to a
dedicated demo company, on a **separate hostname** so a demo session can never
collide with a real logged-in session in the same browser.

See Notion → *Xtimator Public Demo Workspace* (Final Spec + Decisions D01-D11)
for the full product context. This file tracks the architecture, the env/DNS
setup the code depends on, and implementation status.

## How it works (3-hop handoff)

The demo runs on a **second hostname served by the same deployment**. Cookies are
host-only, so the demo session lives entirely on the demo host and the visitor's
real session on the apex host is never touched.

| | Host | What happens |
| - | ---- | ------------ |
| 1 | apex (`xtimator.com` / `localhost:<port>`) | The landing page's "See Demo" buttons link to `/demo/entry`. `proxy.ts` calls `classifyDemoEntryRequest()` (`lib/demo/session.ts`), gets `kind: 'apex'`, and issues a **303 redirect** to the demo host's `/demo/entry`. No Supabase client is constructed and no cookie is read or written on this hop. |
| 2 | demo (`demo.xtimator.com` / `demo.localhost:<port>`) | `app/demo/entry/route.ts` classifies the request as `kind: 'demo-host'` and calls `establishDemoSession()` (`lib/demo/session.ts`). |
| 3 | demo | `establishDemoSession()` creates **or repairs** a host-only session for the dedicated demo user (`DEMO_USER_EMAIL`), verifies that user is a member of the demo company and is *not* a platform admin, pins the deterministic demo company via a host-only `active_company_id` cookie, and 303-redirects to the real `/dashboard`. |

From `/dashboard` onward the visitor is simply using the real app — same layout,
same navigation, same components — with `DemoBanner`
(`components/demo/demo-banner.tsx`, rendered by `app/(app)/layout.tsx`) pinned to
the top and every write path denied.

Notes on the implementation that are easy to get wrong:

- **Host classification reads the `Host` header**, via `getRequestOrigin()` in
  `lib/demo/session.ts` — *not* `request.nextUrl.origin`. `nextUrl.origin` only
  reflects the real per-request host on Vercel; on this self-hosted stack it is
  always the server's own bind address, so using it makes every demo-host
  request misclassify as apex and `/demo/entry` redirect to itself forever.
- **Sign-in uses the Supabase Admin API, not a password grant.** This project's
  Supabase Auth enforces CAPTCHA (Turnstile) project-wide, and there is no
  browser widget in a server-side handoff to solve it, so
  `signInWithPassword()` always fails. `establishDemoSession()` instead calls
  `auth.admin.generateLink({ type: 'magiclink' })` with the service-role client
  and redeems the returned `hashed_token` with `verifyOtp()` on the
  request-scoped client, which writes real session cookies. One bounded retry
  covers a transient `otp_expired` observed right after a local `signOut()` on
  the repair path.
- **There is exactly one success redirect and no failure redirects.** Any
  misconfiguration returns a terminal `503`, so a broken setup can never loop
  between `/dashboard` and the entry route.
- **Re-entry is idempotent.** Hitting `/demo/entry` again with a healthy session
  reuses it; with a stale or foreign session it signs out locally, expires the
  observed `sb-*` / `active_company_id` cookies, and mints a fresh one — both
  paths settle in ≤2 hops.

## Required environment variables (server-only)

Set these in `.env.local` for local dev and as Coolify runtime env vars for
staging/prod. **Never commit real values** — use placeholders in every doc,
example, and planning artifact.

| Variable | Purpose |
| -------- | ------- |
| `DEMO_APP_ORIGIN` | The **only** origin allowed to host a demo session. Validated by `getDemoAppOrigin()` in `lib/demo/config.ts`. |
| `DEMO_APEX_ORIGIN` | The apex origin the "Create a free account" CTA exits to. Validated in `lib/demo/actions.ts`; `exitDemoToSignup()` **throws** if it is unset or invalid. |
| `DEMO_COMPANY_ID` | UUID of the demo company. Defaults to the deterministic value below if unset. |
| `DEMO_USER_EMAIL` | Email of the dedicated demo user. Drives the Admin-API magic link and is re-checked against the returned identity. |
| `DEMO_USER_PASSWORD` | Still **required to be present** (a half-configured demo returns 503), even though the login itself no longer uses a password grant. Placeholder in docs only. |
| `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | Service-role key used by `requireServiceClient()` for `generateLink()` and by the seed script. Server-only, never exposed to the browser. |

Default demo company id (deterministic):
`0000de00-0000-0000-0000-000000000001`

### `DEMO_APP_ORIGIN` accepted values

`getDemoAppOrigin()` is deliberately strict — request headers, query parameters,
and public env vars must never be able to influence a demo redirect destination
or the cookie security policy. It returns `null` (→ terminal 503) unless the
value is a bare root origin with no credentials, query, hash, or path, **and**:

- `http://demo.localhost:<port>` — the only `http:` hostname accepted. Local dev
  value: `http://demo.localhost:9633`, matching `playwright.config.ts`'s default
  and the dev server port. **No `/etc/hosts` entry is needed** — Chromium (and
  the other supported browsers) resolve any `*.localhost` name to loopback
  automatically.
- `https://demo.xtimator.com` — the only `https:` hostname accepted. Production
  value.

Limiting `http:` to the explicit local host means a production deployment cannot
silently lose `Secure` cookies by changing only an environment value.

`DEMO_APEX_ORIGIN` mirrors this: only `https://xtimator.com` or
`http://localhost:<port>`, and it must not equal `DEMO_APP_ORIGIN` or be a
`demo.*` hostname.

### Supabase Auth redirect allow-list

Add **both** demo origins to the Supabase project's Auth redirect allow-list,
alongside the apex origins:

- `http://demo.localhost:9633` (dev)
- `https://demo.xtimator.com` (prod)

The demo host serves the whole application, so any auth flow a visitor starts
there (the banner's "Create a free account" exit, signup, password reset, the
`/callback` handler) resolves against that origin. The current
`generateLink()` + `verifyOtp({ token_hash })` handoff redeems its token
server-side and does not itself depend on the allow-list — but every other auth
flow on the demo host does, and any future switch to a redirect-style magic link
would break immediately without it.

## Deployment: DNS + Coolify domain setup (operator action)

Production is **GitHub Actions → Docker/GHCR → Coolify** (self-hosted). It is
**not** Vercel. A `.vercel/project.json` exists in the repo root as a stale
artifact; it controls nothing.

The demo host is not a second deployment — it is a second domain pointed at the
**same running container**. Requirements (perform these in DNS + the Coolify
dashboard; they are outside the application's control):

1. **DNS:** a `CNAME` (or `A`) record for `demo.xtimator.com` pointing at the
   same Coolify-managed origin that already serves `xtimator.com`.
2. **Coolify:** add `demo.xtimator.com` as an additional domain on the Xtimator
   application (app UUID `cf1cqh0bq8jyw91e78tcw8c6`), so both hostnames route to
   the same container and both get TLS certificates.
3. **Coolify env:** set `DEMO_APP_ORIGIN=https://demo.xtimator.com` and
   `DEMO_APEX_ORIGIN=https://xtimator.com` as runtime environment variables,
   along with `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` / `DEMO_COMPANY_ID`.
4. **Supabase:** add `https://demo.xtimator.com` to the Auth redirect allow-list
   (see above).

Until steps 1-3 are done, `/demo/entry` on the apex fails closed: `getDemoAppOrigin()`
returns `null`, `classifyDemoEntryRequest()` returns `reject`, and the route
returns `503` rather than redirecting anywhere unsafe.

## Local dev setup

1. In `.env.local`:

   ```
   DEMO_APP_ORIGIN=http://demo.localhost:9633
   DEMO_APEX_ORIGIN=http://localhost:9633
   DEMO_USER_EMAIL=<demo-user-email>
   DEMO_USER_PASSWORD=<demo-user-password>
   ```

   Use whatever port the dev server actually runs on; `9633` is the project
   default and what `playwright.config.ts` assumes.

2. Start the dev server and either:
   - click **See Demo** on `http://localhost:9633` (the landing CTAs link to
     `/demo/entry` on the apex, which hands off automatically), or
   - go straight to `http://demo.localhost:9633/demo/entry`.

3. No `/etc/hosts` edit is required for `demo.localhost`.

The cross-host proof lives in `tests/e2e/demo-session-isolation.spec.ts`
(Playwright, run across the `chromium`, `mobile-safari`, and `mobile-chrome`
projects). It exercises the full apex → demo → apex narrative in one real cookie
jar: the redirect chain, real `/dashboard` reach with the banner visible,
host-only cookie isolation, a blocked write returning the `demo_readonly` 403,
the apex identity surviving the excursion, bounded re-entry, the read surfaces,
the settings exposure, and mutation-control suppression.

## Seeding the demo workspace

The demo company and user are **not** created by a migration, because
`companies.user_id` and `company_members.user_id` reference `auth.users`, which
is managed by Supabase Auth (not SQL migrations).

1. **Create the demo auth user** via Supabase Auth (dashboard or admin API) with
   the email/password you put in the env vars above. Note its `user_id`.
2. **Seed the demo company + membership + sample data** with the seed script,
   which uses the service-role key and is idempotent (deterministic UUIDs):

   ```bash
   npm run db:seed:demo          # upsert
   npm run db:seed:demo:reset    # wipe demo data, then re-seed

   # or directly, for the dry run:
   node --env-file=.env.local scripts/seed-demo-workspace.mjs --dry-run
   ```

   It resolves the demo user id from `DEMO_USER_EMAIL` and writes:
   - `companies` row (`id = DEMO_COMPANY_ID`, `user_id = <demo user>`)
   - `company_members(user_id, company_id)` and `demo_config(user_id, company_id)`
     — the `demo_config` row is what flips on the read-only DB trap for the demo
     user
   - fictional clients, projects, estimates (sections + items), and price book
3. **Apply migrations.** The deploy pipeline ships code only and never runs
   migrations, so `supabase/migrations/*` must be applied to the target project
   by hand and the resulting schema verified. The two that matter here are
   `20260530000001_demo_readonly.sql` (creates `demo_config`, `is_demo_user()`,
   and the first write-block policies) and
   `20260726000001_demo_readonly_foundation.sql` (the Phase 180 RESTRICTIVE
   policy sweep). Until a `demo_config` row exists, `is_demo_user()` is false and
   nothing is blocked — a safe default.
4. **Redeploy** with the env vars set.

## What a demo visitor sees

Core read surfaces render the real pages over the deterministic demo data:
`/dashboard`, `/clients`, `/projects` (+ project detail), `/price-book`.

**Settings** is reachable and renders the real settings shell, with the nav
filtered to exactly three tabs:

| Tab | Exposed | Behavior in demo |
| --- | ------- | ---------------- |
| Company | yes | read-only — `CompanyInfoForm` receives `readOnly` |
| Team | yes | read-only — `canManage` forced false, so no Invite button and no member management |
| Notifications | yes | read-only — `NotificationsForm` wraps its switches and both buttons in a disabled `<fieldset>` and shows an explanatory footer note |
| Account, Estimates, Plans, Message Template, Knowledge, Integrations (+ their sub-pages) | no | hidden from `SettingsNav` **and** guarded at the URL level — each page redirects a demo session to `/settings/company`, so a bookmarked or guessed URL discloses nothing |

`Trash` stays hidden from the demo in both the sidebar and the mobile account
menu. The gate actually in force is the explicit `{!isDemo && (` wrapper around
each entry (`sidebar.tsx:119`, `mobile-account-menu.tsx:88`) — Trash also carries
`demoHidden: true` in `components/app-shell/nav-items.ts`, but that flag is inert
for it, since both list consumers filter `userMenu` items out of the main nav
before the `demoHidden` check ever applies.

The banner's CTA calls `exitDemoToSignup()` (`lib/demo/actions.ts`), which signs
out locally and sends the visitor to `DEMO_APEX_ORIGIN` + `/?auth=signup`.

## Read-only enforcement (defense-in-depth)

- **Database (hard guarantee):** `20260530000001_demo_readonly.sql` plus the
  Phase 180 sweep `20260726000001_demo_readonly_foundation.sql` add
  `RESTRICTIVE` INSERT/UPDATE/DELETE policies to every RLS-enabled public table
  (plus `companies` and `storage.objects`), gated on `NOT is_demo_user()`. The
  demo user can read but never write, even via a direct API call. The service
  role bypasses RLS, so seeding/reset still work, and normal users /
  superadmins are unaffected. Proven live against production with a
  `BEGIN … ROLLBACK` transaction: an UPDATE matched 0 rows, an INSERT was
  rejected with `42501`, reads kept working, nothing was permanently changed.
- **Application (early, friendly, and for the paths RLS cannot see):**
  `lib/demo/guard.ts` provides `isDemoContext()`, `isDemoSession()`,
  `assertWritable()` / `assertCompanyWritable()` (server actions returning
  `{ error }`), `DEMO_READONLY_MESSAGE` (friendly copy), and
  `demoGuardResponse()` (route handlers, 403).
  - **Route handlers** are guarded with `demoGuardResponse()` across AI/Inngest
    dispatch (`app/api/generate-estimate`, `app/api/analyze-photos`,
    `app/api/transcribe`, `app/api/translate`, `app/api/chat`,
    `app/api/estimates/[id]/refine`), outbound sends
    (`app/api/estimates/[id]/send`, `.../send-sms`, `.../send-whatsapp`),
    client-facing signing (`app/api/estimates/[id]/sign`), notifications
    (`app/api/notifications/*`), and payments/billing
    (`app/api/billing/*`, `app/api/stripe/connect/*`).
  - **Server actions** call `assertWritable()` / `assertCompanyWritable()`. This
    matters most for the **service-client** paths and **storage uploads**, which
    bypass RLS and would otherwise be unguarded. Pure DB writes via the
    authenticated client are already a hard no-op under RLS; the app guard adds
    the friendly message and short-circuits before any work.
  - **Company-level blocks** use `isDemoCompany()` (`lib/demo/config.ts`) where
    the actor is the demo company's *prospect* rather than the demo user.
- **Drift gate:** `tests/unit/demo/mutation-boundary-sweep.test.ts` is the
  authoritative census of every mutation boundary and its guard. Adding an
  unguarded write surface fails that test rather than silently shipping. The
  rest of `tests/unit/demo/` covers the per-area boundaries, the RLS migration
  contract, host routing, and the entry route.

## Implementation status

- **Phase 180 — Isolated demo session & read-only foundation (complete).**
  Configured demo-host handoff (`DEMO_APP_ORIGIN`, `proxy.ts`,
  `app/demo/entry/route.ts`, `lib/demo/session.ts`), host-only dedicated-user
  Supabase session + deterministic active-company cookie, idempotent
  stale-cookie recovery, deny-write enforcement across server actions, route
  handlers, external side effects and RLS, plus the automated isolation/security
  coverage. Two production-only bugs were found and fixed here: `Host`-header
  origin detection (see above) and the CAPTCHA-blocked password grant.
- **Phase 181 — Real-product cutover & verification (complete).** The real
  settings shell exposed to demo with Company/Team/Notifications read-only and
  every other tab hidden *and* URL-guarded; browser verification across
  `chromium` / `mobile-safari` / `mobile-chrome`; the landing "See Demo" CTAs
  repointed to `/demo/entry`; the retired standalone `/demo/*` UI deleted; this
  document rewritten to match.

The old standalone demo (a separate `/demo/dashboard`, `/demo/clients`,
`/demo/projects`, `/demo/price-book` mini-app with its own nav, reading via the
service-role client) no longer exists. `app/demo/` now contains only
`entry/route.ts`.
