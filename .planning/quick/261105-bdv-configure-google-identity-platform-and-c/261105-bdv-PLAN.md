---
task: 261105-bdv
date: 2026-11-05
status: in-progress
---

# Complete identity configuration and environment cutover

The owner authorized finishing using the connected Chrome session. Operate the
browser DOM, not native mouse automation. Keep phone first and Google secondary.

1. Inspect Google Identity Platform providers/domains in the existing skaleclub
   project and identify the application's public SDK configuration.
2. Inspect actual production runtime/data connections and development separation;
   confirm application database ownership, API signing/hook support and backups.
3. Configure only the Xtimator application/domain and environment settings needed
   by the new auth; avoid changing other applications' permissions or data.
4. Prepare a reviewable deploy, verify CI and backup/restore, apply only the
   reviewed identity migration, verify live API/hook, perform coordinated cutover.
5. Verify public readiness, production commit, phone/Google entry flow and account
   continuity as far as the available session permits. Record actual results and
   any concrete blockers without claiming unperformed live login.

## Verified preparation

- Google project `skaleclub`: Phone and Google already enabled; added only
  `xtimator.com` to authorized domains. Existing Gen2 blocking function is healthy
  and its deployed policy accepts Google/Phone; preserved the shared trigger.
- Actual production still uses the dedicated Xtimator Supabase project
  `prmqgcrnpuvpzruyzvuv`; all 71 public tables matched the reviewed allowlist.
- Restored the full public/auth/storage dump in a PostgreSQL 17/vector container
  with no network access. Restore and owned-identity migration both exited zero;
  preserved 24 accounts, 19 companies and 158 estimates, with activation false.
- Stored the snapshot in private R2 bucket `xtimator-db-backups`, object
  `xtimator-before-auth.dump`; downloaded it again and verified SHA256
  `97f615eb511b713761a0688ef1e102a3e323cd184c700ae65b16021d32fe3d6e`.
- Prepared production schema and migration history; installed the pre-request
  hook with an explicit guard against replacing an existing hook. Activation
  remains false while the release is prepared.
- Runtime provider settings and existing data signing key saved in Coolify;
  GitHub build variable is `owned`. Signing key accepted by the live Data API.
- Full Test workflow passed twice. Initial image build stopped at Docker's
  `SecretsUsedInArgOrEnv` false positive on `PUBLIC_AUTH_MODE`; rename to
  `PUBLIC_IDENTITY_MODE` passed `docker buildx build --check` with no warnings.
- Excluded every `.env*` operator file from Docker contexts.
