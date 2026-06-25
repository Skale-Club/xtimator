---
phase: 136-invite-lifecycle
plan: 01
subsystem: email
tags: [email, resend, invites, seats]
requires:
  - "getIntegrationKey/getBranding from lib/platform-config"
  - "getCanonicalBaseUrl from lib/utils/site-url"
provides:
  - "sendInviteEmail() — team-invite Resend template (lib/email/invite-emails.ts)"
  - "InviteEmailContext interface — the call signature Plan 02's inviteMember uses"
affects:
  - "Phase 137 /invite/accept route consumes the emitted accept link shape"
tech-stack:
  added: []
  patterns:
    - "Self-contained Resend template mirroring account-emails.ts (escHtml + buildEmailShell + FROM_ADDRESS copied, not re-exported)"
    - "Never-throws / no-key-skip / empty-recipient-skip email contract"
key-files:
  created:
    - "lib/email/invite-emails.ts"
    - "tests/unit/notifications/invite-emails.test.ts"
  modified: []
decisions:
  - "Token confined to the accept link only (encodeURIComponent inside acceptUrl); never logged, never in subject"
  - "Expiry rendered via toLocaleDateString('en-US', { dateStyle: 'long' }) for a deterministic human-readable line"
metrics:
  duration: "~2 min"
  completed: "2026-06-25"
  tasks: 2
  files: 2
---

# Phase 136 Plan 01: Invite Email Template Summary

Shipped `sendInviteEmail` — a self-contained team-invite Resend template that emits exactly one absolute `${baseUrl}/invite/accept?token=...` link, names the company/role/expiry, and mirrors the account-emails never-throws contract.

## What Was Built

- **`lib/email/invite-emails.ts`** — exports `InviteEmailContext` + `sendInviteEmail(ctx)`. Copies `escHtml`, `buildEmailShell`, and `FROM_ADDRESS` from `account-emails.ts` (self-contained like `payment-emails.ts`). Builds the absolute accept link via `getCanonicalBaseUrl()`, escapes every interpolated value, and sends via dynamic `import('resend')` after `getIntegrationKey('resend')`. Early-returns on empty recipient and missing key; wraps the whole body in try/catch and never rethrows. The pre-generated token is taken as input (NOT generated here — that is Plan 02's action job) and surfaces only inside the link.
- **`tests/unit/notifications/invite-emails.test.ts`** — 5 behavioral cases mirroring the account-emails mock harness: (1) single send with the absolute link in html + text plus company/role, (2) token not in subject, (3) no-key skip, (4) empty-recipient skip, (5) never-throws when Resend rejects.

## Verification

- `npx vitest run tests/unit/notifications/invite-emails.test.ts` → 5 passed.
- `grep getCanonicalBaseUrl` and `grep invite/accept?token=` → both present at the single acceptUrl construction site (L119).
- Token-logging grep → `ctx.token` appears only inside `acceptUrl`; no console logs of the token.
- `tsc --noEmit` → no errors in the new files.
- gitleaks pre-commit → no leaks on both commits.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `49ca9d31` feat(136-01): add sendInviteEmail Resend template
- `9011837c` test(136-01): add invite-emails behavioral test

## Self-Check: PASSED

- FOUND: lib/email/invite-emails.ts
- FOUND: tests/unit/notifications/invite-emails.test.ts
- FOUND: commit 49ca9d31
- FOUND: commit 9011837c
