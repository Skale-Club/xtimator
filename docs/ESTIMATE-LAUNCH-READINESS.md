# Estimate generation launch readiness

Implementation follows Journal XTM-68 (review) and XTM-69 (plan). The initial
patch covers persistence/recovery, financial and client correctness, and an
authenticated owner review summary. It is not public-launch certification.

## Database prerequisite

Apply these migrations manually before deploying the new callers:

- `20261118000001_atomic_estimate_activation.sql`
- `20261118000002_estimate_sequence_lock.sql`
- `20261118000003_scope_vague_discard.sql`

All three were applied and read back on the existing Supabase development database
on 2026-11-18. Production has not been changed. The new callers deliberately
fail closed if their RPC is missing; they never fall back to a non-transactional
pointer swap.

`activate_estimate_version` serializes by project, locks estimates before the
project (matching existing save/sign lock order), verifies tenant scope and the
expected current version, protects answered/signed versions, copies photos,
sets the current pointer and writes project fields atomically. Staged rows are
hidden from history, direct estimate loads and public token loaders. Cleanup
can delete only the same tenant/project's non-current, still-staged row.

`discard_vague_estimate` requires the server-trusted company as well as project
and estimate IDs (the scope-less overload is retired). It checks that the current estimate is genuinely
vague and restores an earlier committed usable unsigned draft when available.
Database read failures route to the error path instead of triggering discard.
Normal duplicate Inngest requests retain the existing request/attempt identity.
A lost activation response is reconciled before and after conditional cleanup.
Whole-graph retry after a process crash still uses the existing Inngest retry
boundary; live retry costs must remain part of pre-launch calibration.

Company estimate sequence allocation now has its own transaction advisory lock:
different projects can generate concurrently without racing `max(estimate_seq)`.

## Correctness and owner review

Global discounts are bounded by subtotal and only their taxable share reduces
taxable bases. Category discount allocation preserves residual pennies;
equivalent rates produce the same result in flat/category modes. Tax arithmetic
uses cents to avoid floating-point half-cent drift. Line discounts are bounded
by line value. This is application consistency, not jurisdictional tax advice.

Client names are suggestions until activation commits. Both the application
and database check uniqueness; the database checks the complete tenant dataset.
A concurrently selected client wins. Failed or vague generation never links a
suggested client.

The workspace receives only bounded questions, assumptions and line counts in
`owner_review`; raw `ai_meta` remains platform-admin-only. The review sits
outside paper/page preview, follows version changes and links to Edit with AI.
Public/share/MCP loaders strip the summary. Flags are described as generation
notes, not a certification of accuracy. No checkbox claims a review occurred.

## Verification recorded on 2026-11-18

- SQL suite: 25 actual PostgreSQL/PGlite assertions (24-case run took 2.79 seconds;
  the final additional tenant-scope case also passed).
- Development database: actual activation, deliberate mid-function failure and
  rollback, recovery, service-only function grants, and complete fixture rollback.
- Development concurrency: two connections contended on the company advisory
  lock and obtained distinct consecutive numbers; synthetic fixtures removed.
- Before migration: zero duplicate-current projects and zero tenant-mismatched
  estimates in development. This audit has not been run on production.
- Targeted service/action/billing recheck: 95 tests passed.
- Engine/evaluation/recovery batch: 139 passed, one opt-in live test skipped.
- Financial, new review component and PDF totals batch: 51 passed.
- Editor/version/review/privacy/recovery batch: 160 passed.
- Final scoped discard/routing/adapter compatibility batch: 72 passed.

These batches overlap and must not be added as a unique test count. Targeted
Node tests use one worker on the Surface; typical module-heavy batches take
about 45 seconds. GitHub Test run 44405363257 passed on exact candidate
0a90d20b: scoped application typecheck and both complete unit/eval passes. Its
non-blocking whole-repository check exposed ten new test-fixture typing errors;
the follow-up supplies explicit SQL row types and a complete editor fixture.
Browser/real-device checks, live AI calibration, credit policy, webhook probes
and public rollout remain pending.

## Controlled live evaluation

The owner approved an initial run of at most 18 synthetic cases and USD 5 total.
Use only repository secret `OPENROUTER_API_KEY_EVAL`, a dedicated OpenRouter
generation key with a provider-side total limit at most USD 5 and no reset.
Register it manually with `gh secret set`; never paste it into chat. The manual
workflow checks current key metadata before any paid call and rejects missing,
unlimited, resetting, exhausted or management keys. No platform/customer key or
database is used. Run only one mode for the initial authorized batch.

The canary retains normalized synthetic outputs and rubric findings for manual
scope/quantity review. Missing provider cost is unknown, never zero. Failed,
empty or schema-invalid outcomes cannot pass simply because the accepted
baseline is absent. An initial baseline-free run is calibration, not launch
approval; broad rubric quantity tolerance is insufficient for the 30-case gate.
Reconcile provider spending separately from reported response costs before
setting commercial credits. This harness does not exercise actual capture,
transcription, production persistence, customer debits or public/PDF surfaces.

Both iPhone and Android are available according to the owner. Their actual
Safari/Chrome recording, interruption/recovery and camera sessions are pending.

## Release and rollback

1. Run scoped typecheck and the required complete unit/eval CI on the exact
   release candidate. Keep live paid calls opt-in.
2. Audit duplicate-current/tenant mismatches on production read-only. Confirm
   migration names are absent/present as expected and take an appropriate schema
   rollback reference before applying the additive migration, with owner approval.
3. Apply all three migrations to production before shipping their dependent code.
   Verify service-only grants and PostgREST schema reload. Never deploy first.
4. After an approved release, verify exact health SHA, Inngest sync and a
   controlled workflow. Do not expand public access before the XTM-69 gates.
5. On a critical regression, pause expansion and restore the known application
   image; keep the additive column/functions in place. Do not drop schema objects
   while any container uses the new callers. Retain existing signed evidence.
