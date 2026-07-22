---
phase: 172-template-engine-foundation
verified: 2026-07-21T22:10:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
requirements_verified:
  - TMPL-01
  - TMPL-06
  - TMPL-07
evidence:
  test_run: "npx vitest run tests/unit/notifications/ tests/unit/whatsapp/ — 55 files passed, 1 skipped; 480 tests passed, 14 todo"
  typecheck: "npx tsc --noEmit -p tsconfig.ci.json — exit 0"
  day_one_neutrality: "grep confirms zero production call sites pass copyContext; the only non-test/non-doc reference is the seam definition in dispatch.ts"
human_verification:
  - test: "Apply supabase/migrations/20260721000001 to prod (manual, per project convention) BEFORE Phase 174 wires any real call site"
    expected: "select count(*) from notification_templates where scope='tenant' and channel='in_app' returns 17"
    why_human: "Migrations are applied manually to prod (project_migrations_manual_apply memory); the table ships INERT this phase by design — not a Phase-172 acceptance requirement, an ops step for Phase 174 activation"
---

# Phase 172: Template Engine Foundation Verification Report

**Phase Goal:** DB-driven editable `{{var}}` copy + never-block fallback + per-channel escaping, with ZERO day-one behavior change (TMPL-01, TMPL-06, TMPL-07).
**Verified:** 2026-07-21T22:10:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `renderTemplate` substitutes every `{{var}}` escaping the VALUE (never template text) per channel; missing/undefined/null → `''` | ✓ VERIFIED | `template-engine.ts:96-107` — html→`escapeHtmlValue`, text→`escapeTextValue`; `raw===undefined\|\|null → ''`. 24 tests green. |
| 2 | `sanitizeWhatsAppParam` strips control chars, collapses 4+ spaces→3, trims; `sendWhatsAppTemplate()` applies it to header+body vars before building Meta components | ✓ VERIFIED | `template-engine.ts:66-71`; `client.ts:64-65` maps both arrays through it. `template-send.test.ts` corrupt-input test (`'Line1\nLine2   too...'`) green. |
| 3 | `notification_templates` table: `UNIQUE(scope,event_type,channel)`, CHECK scope/channel, service-role-only RLS (zero policies), NO `company_id` | ✓ VERIFIED | migration lines 41-68 — no `company_id` column, no `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY` only. `company_id` appears only in comment text. |
| 4 | Every EventType has a seeded `scope='tenant' channel='in_app'` row byte-derived from `copy.ts`; `Record<EventType,...>` gives compile-time exhaustiveness | ✓ VERIFIED | `template-seed.ts:64` `Record<EventType, TemplateSeedEntry>` (17 keys); tsc exit 0; drift-guard test asserts SQL contains each tuple+body verbatim. |
| 5 | `resolveNotificationCopy` renders an active DB row's `{{var}}` title/body with per-channel escaping (html for email, text otherwise) | ✓ VERIFIED | `template-resolver.ts:46-71`; mode `channel==='email'?'html':'text'`. "DB WINS" test green. |
| 6 | Any miss — no row / inactive / empty-render / thrown error / null client — falls back to `buildNotificationCopy` and NEVER throws, NEVER blank | ✓ VERIFIED | All branches wrapped in one outer try/catch returning `buildNotificationCopy` (`resolver:39-78`); title-blank safety net line 69. 6 fallback tests + `.resolves` (not `.rejects`) green. |
| 7 | `<script>` ctx value renders HTML-escaped for email, unescaped for in_app/sms (per-channel divergence) | ✓ VERIFIED | resolver tests: email → `&lt;script&gt;`, not `<script>`; in_app → `Acme & Co`, not `&amp;`. |
| 8 | `notify()` gains optional `copyContext`; omitted = byte-identical (zero call sites pass it); provided drives insert + downstream payloads via the resolver | ✓ VERIFIED | `dispatch.ts:52,96-115`; 3 seam tests (omitted/provided/rejecting) green; grep confirms zero production callers. Seed byte-equivalence green for all 17 events. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `lib/notifications/template-engine.ts` | 5 pure exports, no `server-only` | ✓ VERIFIED | 107 lines; exports `renderTemplate`, `escapeHtmlValue`, `escapeTextValue`, `sanitizeWhatsAppParam`, `extractVariables`; no server-only import. |
| `lib/whatsapp/client.ts` | `sendWhatsAppTemplate` sanitizes both var arrays | ✓ VERIFIED | Imports `sanitizeWhatsAppParam`; maps header+body arrays before component build; other 4 exports byte-untouched. |
| `supabase/migrations/20260721000001_...sql` | table + partial index + zero-policy RLS + 17-row seed, `ON CONFLICT DO NOTHING` | ✓ VERIFIED | All present; idempotent; `COMMENT ON TABLE`; no secrets. |
| `lib/notifications/template-seed.ts` | `EVENT_TEMPLATE_SEED: Record<EventType,...>`, 17 entries | ✓ VERIFIED | 17 keys; `admin.bonus_credits_granted` has `variables:[]` and no `{{}}` (CREDITUI-04 guard). |
| `types/database.types.ts` | `notification_templates` Row/Insert/Update/Relationships, alphabetical | ✓ VERIFIED | Line 1487, between `notification_preferences` (1486) and `notifications` (1532); columns match SQL. |
| `lib/notifications/template-resolver.ts` | `resolveNotificationCopy`, never-throws | ✓ VERIFIED | 79 lines; lazy service-client import; 4×`.eq()` + `.maybeSingle()`; outer try/catch. |
| `lib/notifications/dispatch.ts` | additive `copyContext?` seam, 4 downstream swaps | ✓ VERIFIED | +54 lines; minimal diff; `resolvedTitle/resolvedBody` default to params, reassigned only when copyContext set. |

### Key Link Verification

| From | To | Via | Status |
| --- | --- | --- | --- |
| `client.ts` sendWhatsAppTemplate | `template-engine.ts` sanitizeWhatsAppParam | `opts.{header,body}Variables?.map(sanitizeWhatsAppParam)` | ✓ WIRED |
| `dispatch.ts` notify | `template-resolver.ts` resolveNotificationCopy | `await resolveNotificationCopy('tenant', eventType, 'in_app', copyContext)` guarded by `if(params.copyContext)` | ✓ WIRED |
| `template-resolver.ts` | `copy.ts` buildNotificationCopy | fallback on every miss/inactive/empty/throw/null-client | ✓ WIRED |
| `template-resolver.ts` | `template-engine.ts` renderTemplate | `renderTemplate(row.body, ctx, channel==='email'?'html':'text')` | ✓ WIRED |
| `template-seed-completeness.test.ts` | migration SQL | `readFileSync` + verbatim tuple/body containment for all 17 | ✓ WIRED |
| `template-seed.ts` | `event-types.ts` EventType | `Record<EventType,...>` compile-time exhaustiveness | ✓ WIRED (tsc exit 0) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full notifications + whatsapp suites | `npx vitest run tests/unit/notifications/ tests/unit/whatsapp/` | 55 files passed / 1 skipped; 480 tests passed / 14 todo | ✓ PASS |
| CI typecheck (exhaustiveness gate) | `npx tsc --noEmit -p tsconfig.ci.json` | exit 0 | ✓ PASS |
| Corrupt-template genuinely corrupts | Read `template-resolver.test.ts:94-109` | Mock returns a real row with `body:'{{missingVar}}'` (not `data:null`) → renders `''` → fallback. Genuine corrupt, not mock-miss. | ✓ PASS |
| Throwing query genuinely throws | Read `template-resolver.test.ts:111-126` | `maybeSingle` rejects `Error('connection refused')` → catch → warn → fallback; asserted `.resolves` | ✓ PASS |
| Byte-equivalence spot-check (3 events by hand) | estimate.viewed / payment.received / system.maintenance | Fully-populated ctx: seed render === copy.ts output for all 3 | ✓ PASS |
| Frozen Phase-98 tests untouched | `git show 2b12616c -- template-send.test.ts` | Hunk `@@ -80,4 +80,61 @@` — pure append; 4 frozen tests (lines 23-82) byte-unchanged | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| TMPL-01 | 172-02 | `notification_templates` table + byte-equivalent 17-row seed | ✓ SATISFIED | Migration + seed + exhaustiveness (tsc) + drift-guard test + byte-equivalence test (all 17). |
| TMPL-06 | 172-03 | Fallback resolver; broken template never blocks | ✓ SATISFIED | Every resolver branch → `buildNotificationCopy`; never throws; triple-guarded in `notify()`. |
| TMPL-07 | 172-01, 172-03 | Per-channel escaping + `sendWhatsAppTemplate` sanitization gap closed | ✓ SATISFIED | Escaping at render boundary; WhatsApp sanitizer applied; HTML-injection test green. |

### TMPL-06 Never-Block Branch Trace

`resolveNotificationCopy` (entire body inside one `try`):
1. `createServiceClient()===null` → `buildNotificationCopy` — no throw
2. query rejects → outer `catch` → `console.warn` + `buildNotificationCopy` — no throw
3. `row===null || !row.body` → `buildNotificationCopy` — no throw
4. `renderTemplate(body).trim()===''` → `buildNotificationCopy` (Pitfall 2 corrupt-template) — no throw
5. rendered title empty → title falls back to `buildNotificationCopy(...).title`, DB body kept — no throw
6. success → `{title, body}` (DB wins)

`buildNotificationCopy` is an exhaustive `switch` over `EventType` (no `default`), returns on every arm, never throws. In `notify()`, the `copyContext` block has its own `try/catch` (defaults `resolvedTitle/resolvedBody` to `params.title/body`), inside `notify()`'s top-level `try/catch`. **No throw path from the resolver can reach or block `notify()`'s send** — confirmed structurally and by the `dispatch.test.ts` "resolver REJECTS → insert uses caller title/body, ok:true" test.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder in the phase files. No `return null`/`return []` stubs in delivery paths. The `return ''` in `renderTemplate` is the intended missing-var contract, not a stub. Empty-value patterns (`variables:[]`, `data:null` handling) are deliberate design (CREDITUI-04 guard, fallback branches), each covered by a test.

### Phase-174 Prerequisite Documentation (verified present)

| Prerequisite | Documented in | Status |
| --- | --- | --- |
| Sparse-ctx default-strings gap (interpolator renders `''` where `copy.ts` uses `'A client'` etc.) | `172-02-SUMMARY.md:113-121` AND `172-03-SUMMARY.md:159-161` AND `template-seed.ts:24-41` doc header | ✓ DOCUMENTED |
| Email double-escape trap (resolver output already HTML-escaped; must not re-escape in `notification-emails.ts`) | `172-03-SUMMARY.md:162-163` | ✓ DOCUMENTED |

### Human Verification Required

1. **Apply the migration to prod (Phase 174 activation, not a Phase-172 gate)**
   - Test: Manually apply `supabase/migrations/20260721000001_phase172_notification_templates.sql` to the Xtimator prod Supabase (`prmqgcrnpuvpzruyzvuv`) per `project_migrations_manual_apply` convention.
   - Expected: `select count(*) from notification_templates where scope='tenant' and channel='in_app'` returns 17.
   - Why human: Migrations are applied manually. The table intentionally ships INERT this phase (zero day-one change is the goal), so this is a Phase-174 activation step, not a Phase-172 acceptance requirement — it does not block this phase's PASS.

### Gaps Summary

No gaps. All three requirements (TMPL-01, TMPL-06, TMPL-07) are satisfied in code and proven by a green test suite (480 passing) and a clean CI typecheck (exit 0). The phase goal — DB-driven editable `{{var}}` copy, never-block fallback, per-channel escaping, ZERO day-one behavior change — is fully achieved:

- **Day-one neutrality:** grep confirms the only non-test, non-doc reference to `copyContext` is the seam itself in `dispatch.ts`; no production call site passes it. Pre-existing dispatch behavior (dedupe, `resolveChannels`, 4-channel routing, WhatsApp/SMS best-effort) is untouched and its 7 original tests plus the 2 Phase-104 EXTEND blocks stay green.
- **Byte-equivalence:** all 17 events render identically to `copy.ts` under a fully-populated ctx (hand spot-check of 3 + the 17-event test both pass).
- **Never-block:** every resolver branch degrades to `buildNotificationCopy`; the function never throws; `notify()` triple-guards it.
- **Escaping:** applied at the render boundary per channel; `sendWhatsAppTemplate`'s previously-unsanitized pass-through is closed; the frozen Phase-98 WhatsApp suite is a pure append with zero deletions.

**Notes (informational, not gaps):**
- Plan 172-01's frontmatter `files_modified` named `tests/unit/whatsapp/client.test.ts`, but the sanitization tests were correctly placed in the pre-existing `tests/unit/whatsapp/template-send.test.ts` (its natural home; `client.test.ts` was not touched). This is a documented, plan-checker-approved deviation (172-01-SUMMARY) — the tests exist and pass.
- The migration ships INERT and is not yet applied to any Supabase environment — by design and required for the "zero day-one change" goal. Flagged above as a Phase-174 ops step.

---

_Verified: 2026-07-21T22:10:00Z_
_Verifier: Claude (gsd-verifier)_
