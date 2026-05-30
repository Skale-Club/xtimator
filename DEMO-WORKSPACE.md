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
2. **Seed the demo company + membership + sample data** with the seed script
   (added in the seeding phase), which uses the service-role key:
   - inserts `companies` row with `id = DEMO_COMPANY_ID`, `user_id = <demo user>`
   - inserts `company_members(user_id = <demo user>, company_id = DEMO_COMPANY_ID)`
   - inserts fictional clients / projects / estimates / price book / etc.
3. **Apply the read-only enforcement migration** (added in the enforcement
   phase) and `supabase db push`.
4. **Redeploy** with the three env vars set.

## Implementation status

- [x] Phase 1 — Infra: `/demo` route, demo config helper, "See Demo" repointed.
- [ ] Phase 2 — Read-only enforcement (app guard + restrictive RLS) + outbound block.
- [ ] Phase 3 — Seed realistic fictional demo data (script, idempotent, `--reset`).
- [ ] Phase 4 — Fixed demo banner + signup CTA + hide sensitive areas + QA.
