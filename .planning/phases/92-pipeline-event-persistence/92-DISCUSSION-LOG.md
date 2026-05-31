# Phase 92: Pipeline Event Persistence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 92-pipeline-event-persistence
**Mode:** Auto (--auto) — recommended defaults auto-selected
**Areas discussed:** Table shape & granularity, Instrumentation strategy, Failure isolation, Input-type & attempt lineage, RLS posture

---

## Table shape & granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Append-only, one row per step execution | Each step transition writes its own row; per-attempt timeline is an ordered SELECT | ✓ |
| One mutable row per attempt | Single row updated as the attempt progresses | |

**User's choice:** Append-only, one row per step execution (auto: recommended)
**Notes:** Matches EVENT-01 "per-attempt, per-step records"; simplest read path for Phase 93 ADMINLOG-04 timeline.

---

## Instrumentation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Single `recordPipelineEvent()` helper | One shape, called from routes + Inngest functions via service client | ✓ |
| Inline inserts at each step | Duplicated insert logic per site | |

**User's choice:** Single helper (auto: recommended)
**Notes:** One place to harden best-effort/failure-isolation; reused across 3 routes + 3 jobs.

---

## Failure isolation

| Option | Description | Selected |
|--------|-------------|----------|
| Swallow + warn | Logging failure never throws / never affects pipeline | ✓ |
| Propagate | Logging failure surfaces as pipeline error | |

**User's choice:** Swallow + warn (auto: recommended)
**Notes:** Observability must not regress the reliability hardened in Phase 91.

---

## Input-type & attempt lineage

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse Phase 91 attemptId + thread inputType | Mint attemptId at each entrypoint (recording/photo/manual), thread inputType on payload | ✓ |
| New per-phase correlation id | Separate id scheme just for events | |

**User's choice:** Reuse attemptId + thread inputType (auto: recommended)
**Notes:** Recording flow already mints attemptId; photo + manual-text entrypoints mint the same way. Server fallback uuid if missing. retry_count increments per re-executed step within an attempt.

---

## RLS posture

| Option | Description | Selected |
|--------|-------------|----------|
| Deny-all client + super-admin SELECT | No client policies; service-role writes; super-admin reads via platform_admins predicate | ✓ |
| Company-scoped read | Tenants can read their own events | |

**User's choice:** Deny-all client + super-admin SELECT only (auto: recommended)
**Notes:** Matches EVENT-01 "super-admin read only" and the usage_events/processed_stripe_events deny-all convention.

## Claude's Discretion

- Helper file location; `attempt_id` column type (uuid vs text); started/terminal vs single-row event modeling; exact `retry_count` computation.

## Deferred Ideas

- Phase 93 Super Admin UI; retention/TTL cleanup; external APM; alerting — all out of scope for Phase 92.
