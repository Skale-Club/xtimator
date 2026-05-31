---
phase: 93
slug: super-admin-event-log
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-30
---

# Phase 93 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 93-RESEARCH.md "## Validation Architecture" (HIGH confidence).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `^4.1.4` (`package.json:77`) |
| **Config file** | `vitest` config present; `include` scoped to `tests/unit/**` (STATE.md:159 — avoids Playwright import collisions) |
| **Quick run command** | `npm test` (= `vitest run`, `package.json:11`) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds (full unit suite) |

**Mocking patterns (established):**
- **Static source-read assertions** (no DB): `readFileSync(resolve(process.cwd(), 'path'))` + `expect(src).toMatch(/regex/)` — precedent `tests/unit/inngest/transcribe-audio-job.test.ts:33-49`. Used for "requireAdmin present", "no transcript/audio/payload token", "view DDL has security_invoker".
- **Mocked supabase client**: `vi.mock('@/lib/supabase/service', ...)` returning a chainable mock whose `.from().select().or().eq().order().range()` record calls — mirrors `tests/unit/api/transcribe-dispatch.test.ts:52-70` (`makeSupabaseMock` builder). Used to assert the query builder emits the right `.or()` string / `.eq()` filters / count queries.
- **No live DB in unit tests.** DB-state behaviors (view returns correct groups; RLS) are integration/manual.

---

## Sampling Rate

- **After every task commit:** Run `npm test` (fast — no scoped runner needed)
- **After every plan wave:** Run `npm test` (all green)
- **Before `/gsd:verify-work`:** Full suite must be green + manual smoke (see below)
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| ADMINLOG-01 | Attempt grouping/pagination query builds `.range()` + `order('last_at',desc)` + `count:'exact'` | unit (mocked supabase) | `npm test -- tests/unit/admin/pipeline-attempts-query.test.ts` | ❌ W0 | ⬜ pending |
| ADMINLOG-01 | View DDL static contract: `security_invoker = on`, `GROUP BY attempt_id`, derived cols present | unit (static source read of migration .sql) | `npm test -- tests/unit/admin/pipeline-attempts-view.test.ts` | ❌ W0 | ⬜ pending |
| ADMINLOG-01 | View returns one row per attempt w/ correct precedence | manual/integration (DB state) | manual query after `apply-migration-93-00.mjs` | n/a manual | ⬜ pending |
| ADMINLOG-02 | `buildSearchOr` emits ILIKE for text + `.eq` for UUID only; strips meta-chars | unit (pure fn) | `npm test -- tests/unit/admin/pipeline-attempts-query.test.ts` | ❌ W0 | ⬜ pending |
| ADMINLOG-02 | email term (`@`) triggers `listUsers` path; non-email does not | unit (mocked `svc.auth.admin`) | same file | ❌ W0 | ⬜ pending |
| ADMINLOG-03 | filter param→`.eq()` mapping (status/input_type/step); count queries use `head:true` per status | unit (mocked supabase) | same file | ❌ W0 | ⬜ pending |
| ADMINLOG-03 | Refresh control calls `router.refresh()` | unit (static source read) OR manual | `npm test -- tests/unit/admin/events-controls.test.ts` | ❌ W0 | ⬜ pending |
| ADMINLOG-04 | `terminalStatus` precedence (failed>started>succeeded); `formatDuration(null)='—'` | unit (pure fn) | `npm test -- tests/unit/admin/event-step-timeline.test.ts` | ❌ W0 | ⬜ pending |
| ADMINLOG-04 | Detail fetch orders `created_at ASC`; `notFound()` on empty | unit (static source read) | `npm test -- tests/unit/admin/events-detail.test.ts` | ❌ W0 | ⬜ pending |
| ADMINLOG-05 | `EventStepTimeline` source references ONLY `SAFE_EVENT_COLUMNS`; NO `transcript`/`audio`/`apiKey`/`payload`/`raw` token | unit (static source read — structural guard) | `npm test -- tests/unit/admin/event-step-timeline.test.ts` | ❌ W0 | ⬜ pending |
| ADMINLOG-05 | Detail query select list ⊆ 15 safe columns (no unsafe `select('*')`) | unit (static source read) | `npm test -- tests/unit/admin/events-detail.test.ts` | ❌ W0 | ⬜ pending |
| cross-cutting | `requireAdmin()` called in both `events/page.tsx` and `events/[attemptId]/page.tsx` before any read | unit (static source read) | `npm test -- tests/unit/admin/events-route-gate.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/admin/pipeline-attempts-query.test.ts` — covers ADMINLOG-01/02/03 (query builder: `.or` construction, filter→`.eq` mapping, `.range`, count queries, email-lookup branch)
- [ ] `tests/unit/admin/pipeline-attempts-view.test.ts` — static contract on the migration `.sql` (security_invoker, GROUP BY, derived columns)
- [ ] `tests/unit/admin/event-step-timeline.test.ts` — whitelist guard (ADMINLOG-05) + status precedence + duration format
- [ ] `tests/unit/admin/events-detail.test.ts` — ASC order, notFound, safe select list
- [ ] `tests/unit/admin/events-route-gate.test.ts` — requireAdmin presence on both routes
- [ ] `tests/unit/admin/events-controls.test.ts` — refresh/`router.refresh()` (optional; may fold into manual)
- [ ] No framework install needed — vitest present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `pipeline_attempts` view returns one row per attempt with correct status precedence (failed>started>succeeded) and step_reached | ADMINLOG-01 | View grouping/precedence is DB-state behavior; no live DB in unit tests; no in-repo view precedent (MEDIUM) | Apply via `node scripts/apply-migration-93-00.mjs`; run `SELECT attempt_id, terminal_status, step_reached, total_duration_ms FROM pipeline_attempts LIMIT 20` and confirm one row per attempt, precedence correct |
| End-to-end `/admin/events` UX | ADMINLOG-01..05 | Full SSR + navigation + visual timeline | Click through `/admin/events`: list paginates, filters (status/input_type/step) apply, search (uuid/email/error text) works, counts reflect filtered set, detail timeline renders, NO payload/transcript/audio anywhere |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-30
