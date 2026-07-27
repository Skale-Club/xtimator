---
phase: 180-isolated-demo-session-read-only-foundation
plan: 14
status: stopped
checkpoint: production-schema-authorization
decision: stop
recorded: 2026-07-26
---

# Phase 180 Plan 14: Preflight and Stop Checkpoint

Plan 180-14 is intentionally incomplete. The safe local/static portion of Task 1
was executed, Task 2 recorded `stop`, and Task 3 was not run. No linked or remote
Supabase command, production schema mutation, DNS change, deployment, or other
external-service mutation occurred.

## Task 1 — Safe Preflight Evidence

### Target and migration identity

- Local Supabase configuration: project ID `xtimator`, API
  `http://127.0.0.1:54321`, database `127.0.0.1:54322`.
- Local linkage metadata exists, but the linked project was not contacted:
  `prmq************zvuv`.
- The linked production project name was not retrieved because this execution
  was not authorized to contact or mutate the remote project.
- Migration:
  `supabase/migrations/20260726000001_demo_readonly_foundation.sql`.
- SHA-256:
  `affa5e2c9084ac23ca43b2cbc25de904a16747f2ed2956b49968abde11475232`.

### Static and local results

| Check | Result |
| --- | --- |
| `npx vitest run tests/unit/demo/rls-migration-contract.test.ts` | PASS — 1 file, 7 tests |
| Atomic migration boundary | PASS — one `BEGIN`, one `COMMIT` |
| Static policy structure | PASS — 9 `CREATE POLICY` statements/templates; user triplet per current public RLS table, company triplet per compatible table, 3 fixed `companies` policies, and 6 Storage policies |
| Docker CLI | PRESENT — 29.2.1 |
| Docker engine | UNAVAILABLE — Docker Desktop Linux engine pipe absent |
| `supabase status` | BLOCKED — local containers cannot be inspected while Docker is stopped |
| `supabase db lint` | BLOCKED — local Postgres at `127.0.0.1:54322` refused the connection |
| Disposable reset/application | NOT RUN — no disposable local Supabase engine was available |
| `npx vitest run tests/integration/demo-readonly-rls.test.ts` | COLLECTED — 1 file and 6 tests skipped because the explicit local/disposable live opt-in and environment were absent |

Task 1's completion criteria are not satisfied: the migration was not applied to
a disposable local database, database lint did not run successfully, and no live
RLS case executed. The static contract is evidence only and is not production
SAFE-03/SAFE-04 proof.

## Task 2 — Recorded Decision

**Decision:** `stop` — Do not push.

Exact-target production schema authorization was not granted. The command
`supabase db push --linked` was not run. Credentials, local linkage metadata,
`workflow.auto_advance`, and prior CI state were not treated as authorization.

## Task 3 — Not Run

Task 3 is prohibited after the `stop` decision. No production push, post-push
live RLS verification, Chromium cross-host test, deployment, or external
configuration change was attempted.

## Remaining Blocker

Before this plan can resume, a disposable/local Supabase stack must be available
so reset/application, `supabase db lint`, and all six opt-in live RLS cases can
pass without skips. A later production push additionally requires a new,
explicit authorization naming the exact verified target and the migration
checksum above.

## Preservation Check

- `app/globals.css` was not edited or staged.
- The pre-existing trailing-newline-only `.planning/config.json` change was not
  edited or staged.
- No `180-14-SUMMARY.md` was created.

## Session 2 — Environment Investigation (2026-07-26)

Attempted to unblock Task 1's live environment requirement two ways; both are
genuinely unavailable right now, not a retry-able flake.

1. **Local Docker.** Docker Desktop was not running. Launched it manually;
   it crashed on startup with `initializing Inference manager: listening on
   unix://...dockerInference: remove ...dockerInference: The file cannot be
   accessed by the system (listener: The filename, directory, or volume label
   syntax is incorrect.)` — a stale/locked socket file blocking Desktop's own
   startup. Left unfixed at the operator's request ("segue sem ele"); the
   Supabase CLI's local stack (`supabase start`, `db lint` without `--linked`,
   disposable reset) has no non-Docker alternative on this stack.
2. **Supabase preview branch (cloud, no Docker needed).** `create_branch` is
   reachable via MCP and CLI (`supabase branches create`) once authenticated
   with the project-scoped `SUPABASE_ACCESS_TOKEN` from `.env.local` — the
   global CLI login on this machine is a *different* Supabase account that
   cannot even see project `prmqgcrnpuvpzruyzvuv`. With the correct token,
   `supabase branches create --project-ref prmqgcrnpuvpzruyzvuv` returned
   **HTTP 402** — `Branching is supported only on the Pro plan or above`
   (org `tsybxxlhruvgviewclbl` is not on that plan). No branch was created,
   nothing was charged.

**Operator decision (2026-07-26):** park this plan as-is. Revisit once either
Docker Desktop is repaired locally, or the Supabase org is upgraded to a plan
with branching — operator's choice, to be made later. No further attempts
should be made to route around this without a new explicit decision.
