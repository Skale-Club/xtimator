# Public Demo Workspace

A public, read-only demo company that outside visitors can explore from the
landing page "See Demo" button before creating an account.

See Notion → *Xtimator Public Demo Workspace* (Final Spec + Decisions D01-D11)
for the full product context. This file tracks implementation status and the
manual provisioning steps the code depends on.

## How it works

1. The landing page "See Demo" buttons link to `/demo`.
2. `app/demo/route.ts` programmatically signs the visitor in as the shared demo
   user (credentials are server-only env vars) and pins the active company to
   the dedicated demo company, then forwards to `/dashboard`.
3. The visitor browses the real app scoped to the demo company. Read-only is
   enforced by an app-layer guard **and** restrictive RLS so nothing can be
   mutated and no external side effect can be triggered (later phases).

## Required environment variables (server-only)

Set these in `.env.local` for local dev and in the deployment env (Coolify /
Vercel) for staging/prod. Never commit real values.

| Variable             | Purpose                                              |
| -------------------- | --------------------------------------------------- |
| `DEMO_COMPANY_ID`    | UUID of the demo company. Defaults to the value below if unset. |
| `DEMO_USER_EMAIL`    | Email of the shared demo user (programmatic login). |
| `DEMO_USER_PASSWORD` | Password of the shared demo user.                   |

Default demo company id (deterministic): `0000de00-0000-0000-0000-000000000001`

If `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` are missing, `/demo` fails safe by
redirecting back to `/?demo=unavailable` instead of erroring.

## Manual provisioning (one-time, per environment)

The demo company and user are **not** created by a migration, because
`companies.user_id` and `company_members.user_id` reference `auth.users`, which
is managed by Supabase Auth (not SQL migrations).

1. **Create the demo auth user** via Supabase Auth (dashboard or admin API)
   with the email/password you put in the env vars above. Note its `user_id`.
2. **Seed the demo company + membership + sample data** with the seed script,
   which uses the service-role key and is idempotent (deterministic UUIDs):

   ```bash
   node scripts/seed-demo-workspace.mjs           # upsert
   node scripts/seed-demo-workspace.mjs --reset   # wipe demo data, then re-seed
   node scripts/seed-demo-workspace.mjs --dry-run # print plan, write nothing
   ```

   It resolves the demo user id from `DEMO_USER_EMAIL` and writes:
   - `companies` row (`id = DEMO_COMPANY_ID`, `user_id = <demo user>`)
   - `company_members(user_id, company_id)` and
     `demo_config(user_id, company_id)` — the `demo_config` row is what flips on
     the read-only DB trap for the demo user
   - fictional clients, projects, estimates (sections + items), and price book
3. **Apply migrations** (`supabase db push`) so `20260530000001_demo_readonly.sql`
   creates `demo_config`, `is_demo_user()`, and the restrictive write-block
   policies. (Until a `demo_config` row exists, `is_demo_user()` is false and
   nothing is blocked — safe default.)
4. **Redeploy** with the three env vars set.

## Read-only enforcement (defense-in-depth)

- **Database (hard guarantee):** `20260530000001_demo_readonly.sql` adds
  `RESTRICTIVE` INSERT/UPDATE/DELETE policies to every RLS-enabled public table,
  gated on `NOT is_demo_user()`. The demo user can read but never write, even via
  a direct API call. The service role bypasses RLS, so seeding/reset still work,
  and normal users / superadmins are unaffected.
- **Application (early, friendly, and for the paths RLS cannot see):**
  `lib/demo/guard.ts` provides `isDemoSession()`, `assertWritable()` (server
  actions returning `{ error }`), `DEMO_READONLY_MESSAGE` (friendly copy), and
  `demoGuardResponse()` (route handlers). Wired into:
  - **Route handlers** (403 via `demoGuardResponse()`): AI/Inngest dispatch
    (`generate-estimate`, `analyze-photos`, `transcribe`, `estimates/[id]/refine`),
    outbound sends (`estimates/[id]/send`, `send-sms`, `send-whatsapp`),
    payments/billing (`billing/create-checkout-session`,
    `billing/create-portal-session`, `stripe/connect/initiate`).
  - **Server actions**: the guard is folded into each file's `getAuthContext()`
    for the write-only action modules (`client`, `custom-domain`,
    `estimate-template`, `photo`, `recording`, `settings`, `tour`,
    `whatsapp-settings`), and applied per-function where a module also has read
    exports or uses the service client / storage (`price-book` image uploads,
    `whatsapp-inbox` sends). This matters most for the **service-client** paths
    (`whatsapp-settings`, `whatsapp-inbox`) and **storage uploads**, which
    bypass RLS and would otherwise be unguarded. Pure DB writes via the
    authenticated client are already a hard no-op under RLS; the app guard adds
    the friendly message and short-circuits before any work.
  - **Client-facing share routes** (`estimate/[token]/pay`, `estimates/[id]/sign`)
    are blocked at the **company** level via `isDemoCompany()` — the visitor
    there is the demo company's prospect, not the demo user.

## Implementation status

- [x] Phase 1 — Infra: `/demo` route, demo config helper, "See Demo" repointed.
- [x] Phase 2 — Read-only enforcement (app guard + restrictive RLS) + outbound block.
- [x] Phase 4 — Fixed demo banner + signup CTA + hide sensitive nav (Settings,
      WhatsApp) + redirect Settings/WhatsApp for demo sessions.
- [x] Phase 3 — Seed realistic fictional demo data
      (`scripts/seed-demo-workspace.mjs`, idempotent, `--reset` / `--dry-run`).

## Phase 4 surfaces

- `components/demo/demo-banner.tsx` + `lib/demo/actions.ts` (`exitDemoToSignup`):
  fixed read-only banner with a CTA that signs out and opens signup (`/?auth=signup`).
- `app/(app)/layout.tsx`: renders the banner and threads `isDemo` to the shell.
- `components/app-shell/nav-items.ts` + `sidebar.tsx` + `bottom-nav.tsx`: hide
  `demoHidden` entries (Settings, WhatsApp) and the Settings account-menu link in demo.
- `app/(app)/settings/layout.tsx` + `app/(app)/whatsapp/layout.tsx`: redirect demo
  sessions to `/dashboard` (admin already 404s for non-admins, which the demo user is).

> Validation: `npx tsc --noEmit` passes with 0 errors across the combined
> Phase 1–4 state (deps installed in this container). Still run `lint`/`build`
> in CI before deploy.
