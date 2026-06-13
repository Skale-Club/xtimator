# Known Issues

> Bug + perf-regression registry for milestone v3.1.1 onwards. Each UAT or validation test produces an entry here with PASS / FAIL / DEFERRED verdict.

---

## Phase 68 — Hetzner Deploy Readiness (2026-05-15)

### HETZNER-06 — Local Docker validation: **DEFERRED**

**Reason:** Docker Desktop not installed on dev machine (Windows 11). Validation requires `docker --version` to succeed.

**What's shipped:** Dockerfile, docker-compose.yml, Caddyfile, .env.production.example — all syntax-validated by inspection. Multi-stage Node 22 alpine, non-root user, port 3000, restart unless-stopped, named volumes for cert persistence. Image size estimate ~300-400 MB based on similar Next.js standalone images.

**Deferred to:** v3.2 first deploy. The actual `docker build` + `docker run` + `/api/health` curl will happen on the Hetzner server itself per `docs/HETZNER-DEPLOY.md` Section 7. This is acceptable because:
- The Dockerfile patterns are well-understood (multi-stage Node alpine is standard)
- The smoke check is exactly what the runbook performs as Section 8
- Failure on first deploy is recoverable — `docker compose down && fix && docker compose up -d`

**To validate before v3.2:** Install Docker Desktop on dev machine OR run validation directly on the Hetzner server during the v3.2 first deploy.

### PERF-01 — Lighthouse audit: **DEFERRED**

**Reason:** Lighthouse CLI not installed. Chrome DevTools Lighthouse requires running `npm run dev` and manual operation.

**What we know:** Phase 17 (Navigation Performance) shipped React `cache()` + Skeleton loading + Suspense streaming + HoverPrefetchLink. Phase 13 (Visual Identity Polish) handled icon optimization. Baseline expected to be reasonable but not measured for v3.1.1.

**Deferred to:** v3.2 — Lighthouse will run against the deployed `https://xtimator.com` URL (more meaningful than localhost), captured as part of v3.2 Phase 64 (Monitoring) deliverables.

### PERF-02 — Bundle size: **DEFERRED**

**Reason:** `npm run build` fails with `ENOENT: .env.local` because `.env.local` is a symlink to `G:\My Drive\Dev\xtimator\.env.local` (Google Drive) which is currently unmounted on this machine. Build cannot proceed without env file.

**Workarounds tried:** None — fixing the Google Drive mount is out of scope for this plan.

**Deferred to:** v3.2 first deploy — `npm run build` succeeds on the Hetzner server (where the env file is a normal file, not a symlink). Bundle size captured from CI logs at that point.

---

## Phase 69 — UAT Validation (2026-05-15)

**All 13 UAT requirements DEFERRED to v3.2 first deploy.**

**Rationale:** Manual UAT against localhost requires real WhatsApp Business connection, real Stripe Checkout interaction, real audio recording with multiple takes, real client phone numbers, and ~1-2 hours of focused human time. User chose to defer the validation pass to coincide naturally with the v3.2 first deploy on Hetzner Cloud — testing the deployed app is more meaningful than testing localhost anyway, and avoids running the same UAT twice.

**v3.2 dependency:** Phase 69 work (the test plans 69-01/02/03) carries forward verbatim — same 13 UAT tests, just executed against `https://xtimator.com` instead of `http://localhost:3000`. Test plans remain in `.planning/phases/69-uat-validation-bug-triage-perf-audit/` for re-use.

### UAT-V22-01 — PDF Attachment Delivery: SKIPPED → v3.2
- Reason: requires real WhatsApp Business connection + real client phone
- Re-test in v3.2: Phase 64 UAT against `https://xtimator.com`

### UAT-V22-02 — WhatsApp Status Flow: SKIPPED → v3.2
- Reason: requires real WhatsApp Business connection
- Re-test in v3.2

### UAT-V30-01 — Tier Enforcement: SKIPPED → v3.2
- Reason: needs full setup (3 terminals, real Stripe, real signup flow); deferring with v22 since they share session
- Code is unit-tested (Phase 57); UAT validates real-world behavior in prod

### UAT-V30-02 — Stripe Checkout (test mode): SKIPPED → v3.2
- Reason: requires interactive Stripe Checkout with test card; deferring to prod where it'll be live mode anyway

### UAT-V30-03 — Trial Automation: SKIPPED → v3.2
- Reason: requires waiting for real cron timing or manual DB date manipulation; deferring

### UAT-V30-04 — Stripe Customer Portal: SKIPPED → v3.2
- Reason: same Stripe interactive blocker

### UAT-V30-05 — Admin Tooling: SKIPPED → v3.2
- Reason: needs full setup; deferred with batch

### UAT-V30-06 — 402 Upgrade Modal: SKIPPED → v3.2
- Reason: needs quota-exhausted state; deferred with batch

### UAT-INNGEST-01 — 2-min audio: SKIPPED → v3.2
- Reason: requires Inngest dev running + real audio recording
- Code is unit-tested (Phase 67, 17 GREEN tests); real flow validated in v3.2

### UAT-INNGEST-02 — 8-min audio (timeout-killer): SKIPPED → v3.2
- Reason: same as above; the critical "would-have-timed-out-on-Vercel-Free" assertion happens naturally in v3.2 first paying customer flow

### UAT-STORAGE-01 — All upload paths post-refactor: SKIPPED → v3.2
- Reason: 7 sub-paths × ~2 min each = ~15 min UAT; deferring with batch
- Code is unit-tested (Phase 66, 45 GREEN tests across 4 providers); refactor mechanical and grep-verified

### UAT-E2E-01 — Full happy path: SKIPPED → v3.2
- Reason: needs end-to-end signup flow; deferring to prod

### UAT-E2E-02 — Multi-modal capture: SKIPPED → v3.2
- Reason: 3 capture modes × estimate generation; deferring

### UAT-E2E-03 — i18n smoke (PT-BR + ES): SKIPPED → v3.2
- Reason: deferring with batch

### FIX-01 — Critical bug fixes: N/A (no UAT bugs to triage)
### FIX-02 — known-issues.md exists: PASS (this file)

---

## Milestone v3.1.1 Closeout

- **Total UAT tests:** 13 (UAT-V22 ×2, UAT-V30 ×6, UAT-INNGEST ×2, UAT-STORAGE ×1, UAT-E2E ×3)
- **PASS:** 0
- **FAIL→FIXED:** 0
- **DEFERRED → v3.2:** 13 (all UAT — explicit user choice 2026-05-15)
- **DEFERRED → v3.2 (Phase 68):** 3 (HETZNER-06, PERF-01, PERF-02 — Docker/Lighthouse/build env unavailable)
- **Critical bugs at milestone close:** ZERO observed (no UAT performed)

**v3.1.1 ships its code artifacts (Inngest + Storage + Hetzner Docker + /api/health + runbook).** The validation gate that proves these work end-to-end is consciously moved to v3.2 first deploy — a single UAT pass against the real Hetzner-deployed `https://xtimator.com` covers both the runtime artifact validation (Phase 68 deferrals) AND the feature UAT (Phase 69 deferrals) with the same effort.

**Risk acknowledged:** code may have undiscovered bugs that would have been caught by localhost UAT but won't surface until v3.2 deploy. Mitigation: known-issues.md inherits cleanly to v3.2; first deploy includes a smoke pass; Hetzner runbook supports rapid rollback (`docker compose down`).

**Milestone v3.1.1 ready to archive: YES (with explicit UAT debt logged).**

---

## Phase 75 — Tour & Tooltip QA (2026-05-19)

**UAT auto-approved per orchestrator instruction + project memory** ("treat all human-verify checkpoints as auto-approved; never pause to ask for confirmation during phase runs").

**Verdict:** No findings — clean automated verification pass in EN/PT/ES on 2026-05-19 (Phase 75).

**Basis for clean pass:**

- **i18n wrapping verified (automated grep, 75-04 Task 1):** Every `ContextualTooltip` call site passes a plain English string literal as `text`. All translation goes through `t(text)` inside `ContextualTooltip` (line 70) and `t(currentStep.title|description)` plus `t('Back'|'Next'|'Done'|'Skip tour')` inside `TourSpotlight`. No bare-English DOM rendering anywhere in `components/tour/` or at the 5 mount sites (`topbar.tsx:70`, `sidebar.tsx:95-96`, `estimate-totals.tsx:128`, `plain-text-card.tsx:73`).
- **Tour unit suite GREEN (16/16 — verified 75-03):** state machine + persistence pass under `xtimator:tour:v1:*` namespace.
- **Playwright spec discovered (15 tests — verified 75-03):** auth-gated, will run end-to-end once shared auth fixture lands; covers TOUR-FIX-02 (no unprompted tooltips, hover reveals, hover-away dismiss) + TOUR-FIX-05 (ESC dismiss, reduced-motion walkthrough).
- **No legacy keys in `components/tour/` (verified 75-03):** no `tooltip_seen_`, `tour_completed`, or `tour_spotlight_pending` references remain.
- **No new npm deps across Phase 75 (verified 75-03):** `package.json` unchanged.

**Manual UAT runbook shipped:** `tests/visual/tour-uat-runbook.md` (110 lines, EN/PT/ES checklist across tooltips, spotlight, a11y, persistence). Available for any future regression pass on a dev box with seed auth — it will fill in the runtime visual verification that the auth-gated Playwright spec doesn't yet cover.

**No blocker-severity issues identified. Phase 75 cleared to close.**

---

## Triage rules

- **PASS** — verified working, no follow-up
- **FAIL** — blocking, must fix before milestone close
- **FLAGGED** — works but with caveats; documented for future improvement
- **DEFERRED** — out of scope for this milestone, passed forward with explicit rationale and target milestone

---

## GSD Health Check Noise (2026-05-26)

`/gsd:health` (`node gsd-tools.cjs validate health`) currently reports **52 warnings** that are all
expected behavior, not real drift. They are documented here so future readers don't waste cycles
chasing them.

### W007 × 34 — "Phase NN exists on disk but not in ROADMAP.md" (false positive)

Phases `01-23`, `34-37`, `55-61` shipped in earlier milestones (v1.0..v3.0) whose roadmaps were
archived to `.planning/milestones/v1.x-ROADMAP.md`, `v3.0-ROADMAP.md`, etc. The current
`.planning/ROADMAP.md` only lists phases for in-flight milestones (v3.1.1 + v4.0). The validator
checks the live ROADMAP.md only and doesn't know about archived milestone roadmaps. Safe to ignore.

The 4 phases that WERE genuinely missing from the live roadmap (73, 79, 80, 999.1) were added
on 2026-05-26 and are no longer flagged.

### W002 × 14 — "STATE.md references phase 6X" (intentional)

Phases 62, 63, 64, 65 are documented in [STATE.md](STATE.md) and [PROJECT.md](PROJECT.md) as
**deferred placeholders for v3.2** (Vercel→Hetzner deploy, Stripe live mode, monitoring, prod UAT).
They have no directory because the work hasn't started. Removing the references would lose
important context. Safe to ignore until v3.2 activates.

### W009 × 0 — VALIDATION.md backfilled for phases 70, 71, 75

Originally 3 phases had a "Validation Architecture" section in their RESEARCH.md without a
matching VALIDATION.md. Stub VALIDATION.md files were added on 2026-05-26 that point at the
existing VERIFICATION.md / per-plan SUMMARYs which carried the actual validation work. No more
W009 should fire.

### W005 × 1 — "999.1-* doesn't follow NN-name format" (intentional)

`.planning/phases/999.1-migrate-inngest-self-hosted-hetzner/` uses the GSD parking-lot
convention: `999.x` numbers mark phases that are out-of-sequence backlog ideas surfaced for
visibility but not yet ready to start. The convention is intentional and the validator's
NN-name strict-format check is too narrow. Safe to ignore.

### Action

These remaining warnings are baseline noise; the next /gsd:health cleanup pass should be a no-op
unless real new drift appears. If a future GSD release tightens the validator to understand
archived milestones + deferred placeholders + `.x` decimals, these counters will go to zero
automatically.

---

## Unit Test Suite — residual after mock-drift fix (2026-06-13, quick task 260613-aoe)

Quick task **260613-aoe** repaired the vitest **mock-drift** failures (`npx vitest run`: **54 → 10
failing**, 1498 passing). The 10 tests below (8 files) are **NOT mock drift** — each is a test
correctly catching a **product change**. They are left red on purpose: resolving them needs either a
test **rewrite** for intentionally-changed behavior, or a **product-owner decision** (the change may
be intentional evolution _or_ a regression). Per the task rules we don't edit product code to satisfy
tests, nor silently flip assertions that could mask a regression.

> **Update (2026-06-13, quick task 260613-coj):** TEST-ENV-01 below is now **RESOLVED** — it was the
> one genuine product fix. **9 tests / 7 files** remain red, all FLAGGED test-rewrite / design-decision
> items (no product gaps).

### Category A — stale tests for intentional product changes (rewrite, then PASS)

#### TEST-AI-01 — `ai/provider-factory.test.ts` (3 tests): **FLAGGED**
- Asserts `getAIProvider()` returns `AnthropicAdapter`/`GeminiAdapter` by `selected_ai_provider`.
- `lib/ai/index.ts` is now **OpenRouter-only** ("Anthropic/Gemini SDKs are no longer used here");
  `getAIProvider()` always returns an `OpenRouterAdapter`, resolving the model from company
  `ai_model_override` → platform `ai_config.openrouter_default_model` → `OR_DEFAULTS.chat`.
- **Action:** rewrite to assert `OpenRouterAdapter` + that resolution order (mock
  `@/lib/ai/providers/openrouter`), or delete if covered elsewhere.

#### TEST-AI-02 — `translate-route.test.ts` (1 test "calls Claude and inserts…"): **FLAGGED**
- Same OpenRouter migration. `app/api/translate/route.ts` calls `translateTextsOR()` from
  `@/lib/ai/openrouter-client`; the test mocks `@anthropic-ai/sdk` (never called) and `getIntegrationKey`
  (unused), so the real client throws → route returns **503** instead of 200. The DB-cache tests in the
  file are still valid.
- **Action:** replace the `@anthropic-ai/sdk` mock with `vi.mock('@/lib/ai/openrouter-client', …)`;
  make the "AI unavailable" test reject it and the cache-miss test resolve it; assert `translateTextsOR`.

#### TEST-ICONS-01 — `app-icons.test.ts` (whole suite fails to collect): **FLAGGED**
- `readFileSync(resolve(root, 'proxy.ts'))` → `ENOENT` at module load (line 10). Only
  `lib/supabase/proxy.ts` exists now; there is no root `proxy.ts`/`middleware.ts` — the middleware /
  metadata-matcher layout changed.
- **Action:** re-point the test at the current `manifest.webmanifest|icon|apple-icon` matcher location,
  or drop the root-`proxy.ts` assertions.

### Category B — product-owner decision needed (intentional vs regression)

#### TEST-ENV-01 — `env-var-sweep.test.ts` (1 test): **RESOLVED (2026-06-13, quick task 260613-coj)** ✅
- Was a real ADMIN-06 violation — provider API key read directly from `process.env` outside
  `lib/platform-config.ts`:
  - `lib/whatsapp/agent.ts:111` → `apiKey: process.env.OPENAI_API_KEY`
  - `lib/whatsapp/intent-router.ts:171` and `:234` → `apiKey: process.env.OPENAI_API_KEY`
- The WhatsApp AI agent + intent-router were not migrated to `getIntegrationKey()` like the rest of the
  app. The test was correct; this was a **product fix** (out of scope for the test-infra task).
- **Fix (260613-coj, commit `fc266ff`):** all three call sites now use
  `apiKey: (await getIntegrationKey('openai')) ?? undefined`. `env-var-sweep` passes; full WhatsApp unit
  suite green (189 passed). Artifacts: `.planning/quick/260613-coj-route-whatsapp-openai-key-reads-through-/`.

#### TEST-WIZ-01 — `wizard-client-only.test.ts` (2 tests): **FLAGGED**
- Asserts `projectSchema` rejects empty `clientId` and `STEP_FIELDS` maps only `[1]`. Now empty
  `clientId` is accepted and `STEP_FIELDS` is `[1, 2]`. File header says it's a "Wave 0 scaffold — RED
  until Phase 18 plan 01" — the scaffold spec diverged from the shipped implementation.
- **Decision:** is required-`clientId` + single-step the intent (→ product regression), or did Phase 18
  intentionally keep `clientId` optional + a step 2 (→ update scaffold)?

#### TEST-BRAND-01 — `globals-brand-tokens.test.ts` (1 test): **FLAGGED**
- BRAND-03 asserts `app/(auth)/layout.tsx` uses `SYSTEM_COLORS.primaryHsl` (#406EF1). The auth layout
  was redesigned to a dark shell (`bg-[#08090A]` + indigo glow) and no longer references it.
- **Decision:** does the dark redesign supersede BRAND-03 (→ update/remove assertion) or should the auth
  primary still be enforced (→ product fix)?

#### TEST-LAND-01 — `components/landing-page.test.tsx` (1 test): **FLAGGED (verify — possible regression)**
- With `?auth=login`, `LandingPage` should open `AuthDialog` (`/welcome back/i` heading) and strip the
  param via `router.replace('/', { scroll:false })`. The heading is never found.
- **Decision:** verify the `?auth=login` deep link still opens the login dialog in a real browser. Copy
  change → update matcher; dialog no longer auto-opens → UX bug.

#### TEST-PB-01 — `price-book/bulk-adjust-dialog.test.tsx` (1 test): **FLAGGED**
- `getByText('Adjust prices — Labor')` (em dash). `bulk-adjust-dialog.tsx:104` renders
  `Adjust prices | {folderName}` (pipe), and `{folderName}` is a separate node so the full-string match
  fails either way.
- **Decision:** confirm intended separator, then switch to a function / `textContent` matcher.

### Verdict tally (this section)
- **RESOLVED (product fix):** 1 — TEST-ENV-01 (WhatsApp keys now routed through platform-config loader; quick task 260613-coj, commit `fc266ff`).
- **FLAGGED (test rewrite or design decision):** 7 files / 9 tests.
