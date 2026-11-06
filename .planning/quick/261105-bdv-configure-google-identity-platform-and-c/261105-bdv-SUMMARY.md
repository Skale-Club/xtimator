---
task: 261105-bdv
date: 2026-11-05
status: in-progress
deployment_status: active-phone-verified-pending-email-recovery
---

# Production owned-auth cutover

The owner authorized implementation and finishing configuration in the connected
Chrome browser. All browser actions use DOM locators, without native mouse input.

## Verified preparation

- Google Identity Platform project `skaleclub`: Phone/Google enabled; added
  `xtimator.com`. Preserved the healthy shared Gen2 `xpeedBeforeSignIn` function
  and its Google/Phone policy despite the console's stale deleted-function warning.
- Actual production and the existing local environment both target the Xtimator
  Supabase project `prmqgcrnpuvpzruyzvuv`. All 71 public tables passed the reviewed
  exclusive-database allowlist. No other application/database was migrated.
- PostgreSQL 17 public/auth/storage snapshot restored successfully in an isolated
  PostgreSQL/vector container with networking disabled; full migration rehearsal
  exited zero, preserving 24 accounts, 19 companies and 158 estimates. Removed
  that temporary container after verification.
- Snapshot preserved at `/root/codex-backups/xtimator-auth-20261105/before-auth.dump`
  (mode 600) and in private R2 `xtimator-db-backups/xtimator-before-auth.dump`.
  Downloaded from R2 and verified SHA256
  `97f615eb511b713761a0688ef1e102a3e323cd184c700ae65b16021d32fe3d6e`.
  Removed temporary app-container and local Downloads copies afterward. The
  existing storage credential was not expanded; upload used authenticated UI.
- Applied only `20261105000001_owned_identity.sql` in an explicit transaction;
  recorded its version in `supabase_migrations.schema_migrations`. Installed the
  PostgREST hook only after checking that no unknown hook would be overwritten.
- Live preflight: 24 accounts, 9 identities, 19 companies, 158 estimates, zero
  remaining public FKs to `auth.users`, matching API/database instance, installed
  hook. A correctly signed phantom-session token received 403 / 42501 /
  `Session is no longer valid`. Repeated these checks immediately before
  activation at **2026-11-05 14:30:43 UTC**; activation is now true.
- Saved provider config and existing data signing key in Coolify. Key is runtime
  only. GitHub `NEXT_PUBLIC_AUTH_MODE=owned` selects the owned-mode image.
- Coolify readiness now checks `/api/health` (timeout 15s, retries 12, start 30s)
  instead of pure liveness, so the owned image cannot receive traffic while the
  activation flag is still false. Persisted values verified after reload.

## Release verification

- 43 central auth tests passed again locally in this task.
- Full CI on `3934f5ed`: production-source typecheck passed; both deterministic
  unit/eval passes succeeded: **6,877 passed, 6 skipped, 20 todo; 722 files passed,
  1 skipped** per run. The existing bare advisory typecheck still has fixture drift.
- First image run on `41538bac` stopped at Docker's secret-name lint false positive
  for `PUBLIC_AUTH_MODE`. Commit `3934f5ed` uses `PUBLIC_IDENTITY_MODE`, keeps the
  secret detector enabled, and excludes every `.env*` operator file from contexts.
  `docker buildx build --check --build-arg PUBLIC_IDENTITY_MODE=owned .` passed with
  no warnings. Gitleaks passed.
- Corrected Build and Deploy run: `42043253481` succeeded on its second attempt.
  The first rollout could not connect through `localhost`; explicitly setting the
  Coolify health host to `127.0.0.1` fixed the IPv6/IPv4 probe mismatch. The old
  container kept serving throughout that failed rollout.
- Verified new container before activation: correct commit, owned provider config,
  signing key present, DB/storage OK, and readiness 503 solely for inactive auth.
- Production now serves `3934f5ed4dc0f026d80c96449e0c3e92e4362e61`, readiness 200
  with `auth=ok`, and `/api/auth/config` reports `owned` with project `skaleclub`.
  CI completed its post-deploy Inngest sync successfully.
- Anonymous session endpoint returns no token; dashboard redirects to
  `/?auth=login` with HTTP 307. A correctly signed legacy-format user data token
  is now rejected with HTTP 403 / 42501 by the live hook.
- Updated the authoritative `.env.local` auth mode/provider/signing settings;
  verified all five values and preserved its Google Drive symlink.

## Live account verification findings

- The owner specified the existing account and phone to link. Confirmed that the
  account exists, its email is verified, and its Google subject was imported. It
  now has the requested verified local phone. Do not record private contact details here.
- Production UI shows phone first and Google second. Google popup reaches the
  existing signed-in account chooser, but account selection remained loading
  through browser DOM attempts; owner assistance was requested for that step.
- Real recovery attempt found **no Resend integration or env key**, and the old
  Supabase Auth configuration has no custom SMTP credentials to reuse. Thus email
  recovery currently returns unavailable. Requested the owner's Resend sign-in or
  key in the env (never in chat). No verification email was delivered.
- After the owner's PC restart, Chrome was unavailable to browser automation.
  Resumed in the integrated browser using DOM controls. Google authenticated the
  intended imported account; the server challenge matched both its existing UUID
  and verified email. The owner supplied the real SMS OTP and the normal identity
  exchange linked the requested phone; no manual verification flag was written.
- The authenticated dashboard opened with the existing six projects. A fresh
  database check confirmed one matching account, preserved legacy UUID, verified
  requested phone, one company and one active owned session.
- Signed out through the UI and confirmed zero active owned sessions. Started a
  new phone-only login, requested a second real SMS, and verified the owner's new
  OTP. The same dashboard and account opened again. This proves independent
  phone entry after the Google-to-phone link, rather than only the initial link.
- Live readiness remains HTTP 200 with DB/storage/auth OK. Production had advanced
  to `2a422f37f8f3a5b27322e96cd701aee5c3e044e9` during this later validation.
- Resend remains absent in both the integration table and local authoritative env.
  Recovery email delivery is still pending; do not mark this whole quick complete.
- After another logout, the owner selected the Google account in the provider
  window. Standalone Google re-entry opened the same account and six-project
  dashboard without requesting another SMS. Both primary phone entry and secondary
  Google entry have now been exercised independently against production.
- Reloading the final dashboard preserved the authenticated session and existing
  projects. Final database verification again found one matching legacy account,
  the requested verified phone and one active session. No OTPs were retained.

## Remaining execution

1. Configure Resend with a verified sending domain and verify real recovery email
   delivery through the application. This is the remaining configuration blocker.
2. Preserve the verified Google/SMS/account-continuity evidence. Do not record
   private contacts, OTPs, tokens or signing credentials in the repository.
