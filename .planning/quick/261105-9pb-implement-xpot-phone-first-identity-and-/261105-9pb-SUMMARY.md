---
task: 261105-9pb
date: 2026-11-05
status: complete
scope: implementation
deployment_status: not-activated
---

# Phone-first owned authentication implemented

Implemented the owner-authorized migration in the real Xtimator checkout,
`C:/Users/Vanildo/Dev/xtimator`, preserving phone/SMS as primary and Google as
secondary. Work was performed inline through GSD quick; no agents were spawned.

## Delivered

- Verified Google Identity Platform/Firebase tokens, in-memory browser SDK,
  local accounts/identity bindings, opaque PostgreSQL-backed revocable sessions.
- Legacy UUID/Google subject import, verified-email account recovery, safe
  phone replacement, local profile/admin/deletion, verified invitation email.
- Shared phone/code UI in modal/login, account security settings, cookie/session
  adapters, logout/keepalive/proxy and isolated native demo sessions.
- Existing PostgREST/Storage/Realtime transport retained with short scoped JWTs,
  existing tenant RLS plus restrictive session checks, and a mandatory verified
  pre-request hook protecting SECURITY DEFINER RPCs.
- Explicit schema/configuration activation and an operator preflight that checks
  expected host, API/database instance equality, signing key and live hook.
  Migration refuses unfamiliar public tables to avoid modifying a shared app DB.
- Docker/GitHub Actions build flag and readiness check; default delivery mode
  remains legacy until the environment is prepared and cut over deliberately.

Runbook and actual activation requirements: `docs/AUTH-CUTOVER.md`.

## Verification

- Final focused run: **148 tests passed in 18 files**, including **46 new auth
  tests across seven files**. Includes every file that failed the earlier broad
  run, plus affected build helpers, auth HTTP/SQL/UI and health/demo contracts.
- Earlier broad unit/eval run: 714 files passed, 6 files failed, 1 skipped;
  6,860 tests passed and 7 failed. All failure classes were fixed and retested;
  the full suite was not repeated after the corrections.
- Production Next.js webpack build with `NEXT_PUBLIC_AUTH_MODE=owned` succeeded,
  including production-source TypeScript and all 98 static pages. Data requests
  were served by a temporary local offline fixture; no Google login/SMS was run.
- Actual Chromium mobile-viewport smoke against the production build: login
  HTTP 200, phone before Google, recovery field visible, owned config HTTP 200,
  anonymous session has no token, dashboard HTTP 307 to `/?auth=login`, no client
  errors and no `/auth/v1` requests. Screenshot inspected at:
  `C:/Users/Vanildo/.codex/visualizations/2026/11/05/01a1ab7e-fd35-7f13-a072-6c6db4982134/xtimator-phone-login.png`.
- Staged whitespace checks and existing commit secret scans passed.
- Temporary browser/server/build helpers were stopped after verification.

## Necessary deviations discovered by validation

The previous source could not build because a browser-shared URL helper imported
`node:crypto` and route/page modules exported non-handler helpers. Moved pure
helpers into libraries and used Web Crypto for the same fixed-length random token.
Aligned Next's type boundary with the existing blocking CI production config;
the existing bare advisory check still reports unrelated test-fixture type drift.

Normalized CRLF/LF in two existing SQL contract-test readers without weakening
assertions. The photo dispatch test's wall-clock failure came from an unmocked
service-role ownership request; it now mocks that unit-test dependency and the
original sub-second assertion passes. Registered the new auth boundaries in the
existing explicit demo authority manifest and supplied accessible descriptions.

## Commits and activation limits

- `aa67770e` — build boundaries and test portability/isolation prerequisites.
- `fda23e2b` — owned authentication implementation, migration and cutover docs.

No remote schema migration, hook installation, Google configuration, push or
deployment was performed. Local Google/signing configuration is absent. A
read-only inventory attempt through the existing transaction pooler did not
complete and was terminated; schema isolation is not claimed as verified.
Real-provider SMS/Google, database/hook preflight and cutover remain environment
activation work, not completed deployment. No real SMS or recovery email was
requested by the new tests or browser smoke.
