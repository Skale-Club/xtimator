# Retrospective: Xtimator

## Milestone: v4.15 — Credit UX Polish & Admin Support Tooling

**Shipped:** 2026-07-05
**Phases:** 4 (150-153) | **Plans:** 12 (incl. 1 gap-closure plan) | **Requirements:** 13/13
**Timeline:** same-day, fully autonomous execution (seeds planted → roadmap → 4 phases planned/executed/verified → milestone audit/completion, one continuous run)

### What Was Built

See `.planning/MILESTONES.md`'s v4.15 entry for the full phase-by-phase breakdown: Companies admin screen overhaul (search/filter/pagination), super-admin Support Mode (signed session-claim impersonation, audited), tenant usage progress bar + super-admin cost visibility, dollar-pack top-up + auto-top-up (off-session Stripe charging with an atomic concurrency lock).

### What Worked

- **Anchoring every CONTEXT.md decision to an existing in-codebase reference implementation** (Phase 93's Event Log for 150, `demo-banner.tsx`/`active-company.ts` for 151, `tier-card.tsx` for 153's pack picker) meant the plan-checker and executors had almost zero genuine ambiguity to resolve — most "grey areas" were "match this existing file's pattern," not open design questions.
- **Running independent phases in parallel** (152's two disjoint-file plans; 150/151/152/153's UI-SPEC generation) shortened wall-clock time significantly without any real file conflicts once a genuine shared-file risk (152 and 153 both touching `credit-balance-card.tsx`) was identified in advance and sequenced instead of parallelized.
- **The plan-checker caught 3 real, would-have-shipped bugs before any code was written**: a missing error-handling path on a row action, a missing `redirect()` on Support Mode exit, and a static-neutrality-test false positive that recurred once after an incomplete first fix — all fixed in 1-3 targeted revision rounds rather than discovered post-execution.
- **The milestone integration checker caught 1 real, if minor, cross-phase seam** (Support Mode's topbar hardcoded `percentUsed=0` instead of computing the impersonated tenant's real usage) that no single phase's own verification would have surfaced, since each phase's tests only exercised its own code path.
- **The Claude Code permission classifier correctly gated the one genuinely high-risk piece** (automatic off-session Stripe charging) and held the line even after a loosely-contextualized "autorizado" reply, only proceeding once given a precise, structured (AskUserQuestion), unambiguously-scoped confirmation — exactly the kind of safety behavior that should NOT be worked around.

### What Was Inefficient

- Three separate GSD housekeeping bugs consumed real turns this milestone: the `state`/`phase complete` commands repeatedly reverting `STATE.md`'s `milestone`/`milestone_name` frontmatter to a stale `v3.1.1` snapshot (re-asserted manually after nearly every state-mutating command); the `milestone complete` CLI's "accomplishments" extraction pulling one-liners from EVERY SUMMARY.md in the repo's history instead of scoping to the milestone's own phases; and `phases`/`plans`/`tasks` counts in that same output being whole-project totals, not milestone-scoped.
- `PROJECT.md`, `ROADMAP.md`'s milestone-list markers, and this retrospective had all silently fallen behind since v4.7/v3.0 respectively — several milestones (v4.8 through v4.14) shipped without a `/gsd:complete-milestone` pass ever updating them. This meant part of this milestone's own completion work was un-scoped "catch up the docs" effort layered on top of the actual v4.15 completion, and that backlog for v4.8-v4.14 was deliberately NOT retroactively fixed (flagged instead as a separate housekeeping item) to avoid uncontrolled scope creep on unrelated milestones.

### Patterns Established

- **Shared-file conflict pre-check before parallelizing phase executors**: before spawning two phases' executors concurrently, diff their planned `files_modified` lists for overlap; sequence (don't parallelize) when a real overlap exists, even if the phases are otherwise roadmap-independent.
- **Structured (AskUserQuestion) re-confirmation for classifier-blocked high-risk actions**, rather than retrying a denied action verbatim or accepting a loosely-contextualized chat reply as sufficient authorization.

### Key Lessons

- A generic multi-milestone workflow step (e.g. "delete ROADMAP.md/REQUIREMENTS.md and reorganize") should be checked against the PROJECT'S OWN established, already-observable convention before executing literally — this repo's real practice is "keep ROADMAP.md's full phase history forever, only collapse the just-shipped milestone's verbose section," which is not what the generic template's wording literally says to do.
- Not every autonomous-execution authorization is a blanket authorization — real-money/hard-to-reverse capabilities within an otherwise-authorized scope may still warrant (and got, correctly) a second, narrower, explicit confirmation.

### Cost Observations

Not tracked this session (no per-agent cost/token instrumentation surfaced to the orchestrator). Approximate scale: ~50 subagent spawns across research/UI-spec/plan/execute/verify roles for a 4-phase, 13-requirement, ~40-file milestone.

---
*Note: this retrospective had no entries between v3.0 (below) and this v4.15 entry — milestones v1.4 through v4.14 shipped without a retrospective section being added. Not retroactively backfilled here (same reasoning as the ROADMAP.md/PROJECT.md gaps above).*

## Milestone: v1.3 — Smart Pricing

**Shipped:** 2026-05-08
**Phases:** 5 (Phases 19-23) | **Plans:** 13 | **Tasks:** 30
**Timeline:** 2026-05-06 → 2026-05-08 (3 days)
**Files changed:** 97 (+16,806 / -319)

### What Was Built

1. **Phase 19 — Price Book DB Foundation:** `company_price_book` table with 4-policy RLS (SELECT/INSERT/UPDATE/DELETE scoped to company_id), `estimate_items.price_source` TEXT CHECK column, TypeScript types regenerated from live Supabase OpenAPI endpoint (15 tables)
2. **Phase 20 — Price Book CRUD UI:** `/settings/price-book` with alphabetical category grouping, search (`useMemo`), add/edit Dialog (Combobox category autocomplete), AlertDialog delete, optionality EmptyState, Settings entry card
3. **Phase 21 — CSV Import:** papaparse client-side parse (BOM-aware), two-stage Dialog (pick→preview), per-row error indicators, server-side dedup by (name, category), single bulk `supabase.insert()`, downloadable 4-column template at `/price-book-template.csv`
4. **Phase 22 — AI Price Anchoring + Multi-provider:** `lib/ai/` abstraction layer — `AIProvider` interface, `AnthropicAdapter` (Claude `claude-sonnet-4-20250514`), `GeminiAdapter` (`gemini-2.5-flash`, `@google/genai@2.0.0`). `getAIProvider()` factory reads `platform_integrations` where `provider='ai_config'` (zero env vars). Price book injected as system prompt context; `price_source` required in tool/function schema; `normalizeOutput()` defensive fallback. Admin panel: Gemini key card + `AIProviderSelector` radio for live provider switch without redeploy.
5. **Phase 23 — Estimate Editor Price Badges:** `EditorItem` extended with `price_source` + `isManuallyEdited` flag. `item-row.tsx` new `<td>` with ternary badge (isManuallyEdited → "Edited" outline, price_book → "Price book" secondary+CheckCircle2, ai_estimate → "AI estimate" outline+Zap, null → nothing). `saveEstimate` writes `price_source: null` for manually-edited items across all 4 DB paths.

### What Worked

- **Sequential wave execution with dependency guard:** Index tool grouped 20-01/20-02 in the same wave, but the plan frontmatter's `depends_on` was respected — executor ran sequentially rather than hitting a missing-import race. Plans-as-source-of-truth beats index tool grouping.
- **Phase 22 researcher catching deprecated SDK:** `@google/generative-ai` was deprecated November 2025; the researcher found this in npm registry before the planner could hard-code the wrong package. Research phase saved a likely execution failure.
- **Shared `normalizeOutput()` helper:** Extracting the defensive `price_source` fallback to `lib/ai/normalize.ts` solved the plan-checker blocker about untestable private functions while also removing duplication across two adapters. Clean feedback loop: checker → planner → clean solution.
- **`ai_config` row pattern for provider selection:** Using a special `platform_integrations` row with `provider='ai_config'` and `metadata.selected_ai_provider` avoided any DB migration, leveraged the existing encrypted-key table's metadata column, and kept the admin panel pattern consistent. No new table needed.
- **3-day milestone:** 5 phases, 13 plans, 97 files in 3 days. The GSD scaffold (CONTEXT → RESEARCH → PLAN → EXECUTE → VERIFY) kept each phase focused with zero scope creep across phases.

### What Was Inefficient

- **Plan checker required 2 iterations for Phase 22:** 3 blockers found on first check (deprecated SDK in CONTEXT.md, `normalizeOutput` untestable, `server-only` in index.ts). All were legitimate — but a pre-planning review of the CONTEXT.md wording against the research findings would have caught the SDK name error before the planner ran.
- **SUMMARY.md one-liner extraction still noisy:** The CLI extracted raw `"Commit:"` lines from some SUMMARY.md files instead of clean one-liners. The SUMMARY.md frontmatter `one_liner:` field needs to be consistently populated by executors.
- **Wave 0 "server-only" pitfall:** The planner added `import 'server-only'` to `lib/ai/index.ts` (a reasonable pattern for a server module), but this would crash `provider-factory.test.ts` in vitest. The RESEARCH.md didn't flag this pitfall. Adding a "vitest environment compatibility" section to research prompts for lib/ modules would catch this earlier.

### Patterns Established

- **`lib/ai/` provider interface pattern:** `AIProvider` interface + factory + per-provider adapter is the right abstraction for any AI call in this codebase. Future providers (OpenAI, Mistral) just add a new file in `lib/ai/providers/`.
- **`getAuthContext` duplicated per-action file:** The Phase 20 pattern (not exported, duplicated in each action file) was consistently applied in Phase 21 and 22. This is a known convention (STATE.md decision) — follow it, don't consolidate.
- **`ai_config` row for platform-level non-secret config:** `platform_integrations` with null `ciphertext` but non-null `metadata` is a clean pattern for storing platform configuration that doesn't need encryption. Reusable for any future platform-level toggle.
- **Defensive fallback pattern for required AI fields:** `item.price_source === 'price_book' ? 'price_book' : 'ai_estimate'` (not `?? 'ai_estimate'`) — stronger than null coalescing; handles any unexpected model output safely.
- **`isManuallyEdited` client-only flag for optimistic badge UX:** Rather than re-fetching after every keystroke, a client-side boolean tracks "user touched this price" and drives the "Edited" badge immediately. Persisted to DB only on save (price_source = null). Clean separation of client state from server state.

### Key Lessons

1. **Validate CONTEXT.md package names against RESEARCH.md before spawning the planner.** The `@google/generative-ai` vs `@google/genai` error slipped through because CONTEXT.md was written before research, then never re-validated. Add a "reconcile CONTEXT with RESEARCH" step before planning.
2. **Research prompts for lib/ modules should include "vitest compatibility" target.** When researching how to implement a server-only utility that also needs unit tests, explicitly ask: "How does this module behave in vitest's jsdom environment?" Catches `server-only` import issues before planning.
3. **The multi-provider architecture decision mid-discussion is the right time to scope it in.** The user surfaced the Gemini requirement during discuss-phase (not mid-execution), which meant CONTEXT, RESEARCH, and PLAN all accounted for it. Discuss-phase is the correct gate for architectural surprises.
4. **`gsd-tools milestone complete` produces noisy accomplishments** — the CLI pulls from SUMMARY.md files whose one-liner field varies in quality. Executors should always write a clean `one_liner:` in the SUMMARY.md frontmatter as part of plan completion.

### Cost Observations

- Model: claude-sonnet-4-6 (user switched mid-session)
- Sessions: 1 long session (2026-05-08)
- Notable: Phase 22 was the most architecturally complex (multi-provider abstraction + price injection + admin UI + new external SDK) — completed in ~3 hours with 3 plan-checker iterations total. Phase 23 (badges) was the fastest — 2 plans, 3 hours end-to-end.

---

## Milestone: v1.2 — Brand Identity & Global Reach

**Shipped:** 2026-05-06
**Phases:** 9 (Phases 10-18) | **Plans:** 27 | **Tasks:** 34
**Timeline:** 2026-04-22 → 2026-05-06 (14 days)

### What Was Built

1. **Phase 10 — Global Brand Tokens:** #406EF1 applied as `--primary`/`--platform-primary` across all CSS scopes (landing, authenticated app, admin)
2. **Phase 11 — Marketing Landing Page:** Public dark-mode landing at `/` — Hero (#406EF1 glow), How It Works, Features/Benefits, fully responsive on iOS Safari + Android Chrome with Playwright mobile coverage
3. **Phase 12 — i18n Translation System:** EN/PT-BR/ES language switching — `LanguageContext` + `useTranslation()`, 192-entry static dict, `/api/translate` (Claude Haiku + DB cache), `LanguageToggle` in navbar + mobile bottom-nav, `TranslationLoadingOverlay`
4. **Phase 13 — Visual Identity Polish:** App Router-owned favicon, SVG/PNG app icons, manifest metadata, auth-safe metadata routes, regression test suite
5. **Phase 14 — Auth System Hardening:** Unified /login, /signup, /reset-password URLs; updatePassword company-check; OAuth loading-state reset; middleware fail-close; full Playwright auth coverage
6. **Phase 15 — Owner Admin Panel:** Customer dashboard (/admin), SEO editor, landing page CMS, blog CRUD (/admin/blog) + public /blog/[slug], favicon upload; extended platform-config with 5 new Branding fields
7. **Phase 16 — Sidebar Projects Panel:** Paginated projects list in sidebar, SidebarProjectItem with status dots and active highlight, empty state, load-more with useTransition, real-time sync via revalidatePath on project creation
8. **Phase 17 — Navigation Performance:** loading.tsx skeleton states, Suspense streaming for dashboard + workspace, React cache() for auth/company queries, HoverPrefetchLink for nav prefetch, revalidateTag('company') wired on settings save
9. **Phase 18 — Voice-First Project Onboarding:** 1-step wizard (client only, eager draft creation), full-screen `/projects/[id]/capture` route group escaping app shell, 10-min hard cap with color-escalating timer + SVG progress ring, multi-stage stepper (Saving → Transcribing → Analyzing → Generating), Whisper transcript reveal mid-flow, auto-fire estimate generation, skip escape hatch, AI-suggested project name patcher, pg_cron + Vercel cron orphan cleanup

### What Worked

- **Route group isolation for voice capture:** The `(capture)` route group as a sibling to `(app)` gave the recorder a clean full-screen layout escape without any app shell contamination. The pattern was clean and obvious in hindsight — should be remembered for any future "immersive mode" surface.
- **React cache() for auth/company:** Deduplicating server component data fetching with `React.cache()` + `unstable_cache` eliminated redundant Supabase round-trips across the authenticated shell without any new infrastructure. The pattern is portable to any server-component tree.
- **Wave 0 test scaffold pattern:** Creating failing `it.todo()` stubs in the first plan of each phase kept the test infrastructure compile-ready before implementation started. Eliminated "tests won't compile yet" friction in executor subagents.
- **Per-language batch accumulator for i18n:** The `Map<lang, batch>` pattern in the translation debouncer prevented language-switch mid-debounce from mixing PT and ES batches — a subtle race condition that a simple array approach would have missed.
- **pg_cron primary + Vercel cron fallback:** The dual-path orphan cleanup worked around pg_cron extension availability uncertainty without requiring infrastructure decisions. The DO $do$ idempotency guard made it safe to fire both.

### What Was Inefficient

- **Phase scope creep:** v1.2 started as 3 phases (10-12) and grew to 9 (13-18). The original requirements only covered brand/landing/i18n; phases 13-18 were added opportunistically as the milestone ran. This is fine for execution quality but makes milestone reporting harder — requirements never covered phases 13-18 formally.
- **STATE.md active-phase drift:** STATE.md showed Phase 13 as "active" long after phases 14-18 had completed. The state file lagged execution reality by ~2 weeks. A periodic state sync step would help.
- **MILESTONES.md one-liners raw:** The CLI-extracted accomplishments included raw debug lines ("One-liner:", "[Rule 3 - Blocking] ...") instead of clean summaries. The summary-extract CLI relies on consistent SUMMARY.md frontmatter format — some phases had it, some didn't.
- **Auth URL inconsistency discovered in Phase 14:** 32+ code sites used `/auth/login` (non-existent — route group name bleeds into URL) vs `/login`. This was a latent bug from Phase 1 that should have been caught by a URL consistency lint step at scaffold time.

### Patterns Established

- **Full-screen route group pattern:** `app/(capture)/projects/[id]/capture/layout.tsx` with its own layout escaping the app shell — reuse for any immersive surface (recording, camera, onboarding flows).
- **Eager draft creation pattern:** Create the DB record at the start of the wizard (step 1 client select), then redirect to the experience. Avoids the wizard needing to pass all data through query params or state.
- **PLACEHOLDER_PREFIX guard for AI-suggested names:** AI-generated names use a sentinel prefix; a patcher overwrites them post-generation only if the user hasn't yet set their own name. Clean "AI default, user override" pattern.
- **`getCachedCompany` with service role:** `unstable_cache` callbacks cannot call `cookies()` (async context missing); using service role + userId arg scopes correctly without needing session context inside the cache boundary.
- **`getLandingContent()` delegates to `getBranding()`:** Avoids a second TTL cache layer; landing content and branding share the 60s TTL cache. Reuse the existing loader pattern rather than adding a parallel one.

### Key Lessons

1. **Formalize phase additions into REQUIREMENTS.md when scope grows.** Phases 13-18 were shipped without formal requirements. Next milestone, each added phase should have at least one REQ-ID so the traceability table stays honest.
2. **Run a URL consistency check at scaffold time.** A grep for `/auth/` strings at Phase 1 would have caught the route-group URL bleed before 32 sites accumulated it. Add to Phase 1 checklist.
3. **Extract SUMMARY.md one-liners as part of plan execution.** If the executor always writes `one_liner:` in SUMMARY.md frontmatter, the milestone archive CLI can extract clean accomplishments without raw debug noise.
4. **Track active phase in STATE.md as part of plan completion.** The executor should update `Current Position` in STATE.md when a plan finishes, not just write SUMMARY.md. Keeps state file accurate without a separate sync pass.
5. **The voice-first UX is the core differentiator.** Phase 18 removed the most friction from the core user journey (buried Audio tab → buried Generate button → manual navigation). This pattern of "find the biggest UX bottleneck and make it the first surface" is worth repeating at each milestone.

### Cost Observations

- Sessions: multiple across 14 days
- Model: Claude Opus 4.7 (orchestrator) + balanced subagents
- Notable: 9 phases shipped in 14 days; Phase 18 alone was 20+ files in Plan 01 — the most complex single plan in any milestone so far

---

## Milestone: v1.1 — Dark-first UX & Modern Redesign

**Shipped:** 2026-04-22
**Phases:** 1 (Phase 9) | **Plans:** 8 | **Commits:** ~38
**Timeline:** 2026-04-21 → 2026-04-22 (1 day)

### What Was Built

1. **Plan 01 — Theme persistence:** `companies.theme_preference` column + `eb-theme` SSR cookie + `saveThemePreference` server action with discriminated-union result
2. **Plan 02 — Root layout dark default:** Cookie-hydrated `defaultTheme`, forced-light `/estimate/*` scope with `[data-theme="light"]` wrapper, per-request DB→cookie sync in the authenticated shell
3. **Plan 03 — 3-way theme toggle:** Dark/light/system toggle in Topbar + MobileHeader + new `/settings/appearance` page; instant via `setTheme()` + persistent via `saveThemePreference()`
4. **Plan 04 — Semantic status palette:** `--success/--warning/--info/--danger` token trio added to all theme blocks; 5 Tier-1 hardcoded-color violators migrated
5. **Plan 05 — Survey-style onboarding:** 10-step one-question-per-screen survey with `useSurveyState` hook replacing the 3-step react-hook-form wizard; submission contract unchanged
6. **Plan 06 — Design token foundation:** Radius/shadow/typography scale in `globals.css` as additive token vocabulary for Wave 2+3
7. **Plan 07 — UI primitives redesign:** Button, Input, Textarea, Select, Label, Card, Badge, Skeleton all on Plan-06 tokens; unified h-10 form control height, shimmer skeleton animation
8. **Plan 08 — Overlays + nav shells:** Dialog, AlertDialog, Sheet, DropdownMenu, Table, Sonner redesigned on token vocabulary; Topbar/Sidebar/MobileHeader/BottomNav refined; shared `empty-state.tsx` consolidated

### What Worked

- **Token-first approach:** Defining the full radius/shadow/typography vocabulary in Plan 06 before touching any component eliminated repeated token lookups in Plans 07-08. Wave 2+3 executed cleanly with zero token collisions.
- **`[data-theme]` scoped approach:** Forced-light estimate scope and scoped-dark admin/auth inherited from Phase 8 pattern — no new abstraction needed, just `data-theme="light"` wrapper around `/estimate/*`.
- **`useSurveyState` hook isolation:** Owning all step navigation and form data in one hook let the server-action submission contract from Phase 2 stay untouched. Zero regression risk on existing onboarding data.
- **SSR cookie hydration pattern:** `readThemeCookie()` in root layout `async` RSC eliminates FOUC at the framework level — no JS-before-paint flicker tricks needed.
- **Validate-before-auth pattern:** Checking theme value validity before opening a DB connection short-circuits invalid inputs cheaply. Carried forward as a server-action convention.

### What Was Inefficient

- **Tier-1 scope boundary:** The hardcoded-color audit scoped to 5 files left `estimate-preview.tsx:127` with one `text-red-600` outside the declared scope. A full grep-driven audit at plan time would have included all violators rather than requiring a follow-up.
- **E2E tests blocked by environment:** Playwright E2E specs for dark mode and onboarding survey were written correctly but auto-skip without a live Supabase environment. The structural coverage is there but observable behavior cannot be verified programmatically in this setup.
- **Lighthouse a11y deferred:** DARK-06 was declared optional at research time. In hindsight, wiring a minimal axe-core check in Playwright (even against a static server) would have closed this gap within the phase rather than deferring it indefinitely.

### Patterns Established

- **SSR cookie hydration for theme:** `readThemeCookie()` in async RSC root layout + `writeThemeCookie()` in authenticated shell layout on DB mismatch — two-layer sync keeps cookie and DB in agreement cross-device.
- **Token-first primitive redesign:** Define the full token vocabulary in `globals.css` first, then migrate components to consume via Tailwind arbitrary-value syntax. Never mix `dark:*` and `[data-theme]` approaches on the same token.
- **`useSurveyState` hook pattern:** For multi-step flows, isolate step index + per-step data in a hook; let the server action see only the final assembled payload. Avoids coupling navigation state to server concerns.
- **Forced-light scope via `data-theme`:** Public-facing pages (estimate view, PDF) wrapped in `<div data-theme="light">` with a full light-palette CSS rule — immune to the signed-in user's preference without any conditional rendering.

### Key Lessons

1. **Write grep-driven scope for color migrations.** "All files containing `text-red-*`" is a more defensible scope boundary than a named list. Catches stragglers automatically.
2. **Wire axe-core in Playwright at Phase 1, not at audit time.** A single `checkA11y(page)` call in a Playwright fixture closes DARK-06-type gaps for every future feature with zero per-phase overhead.
3. **One migration per theme-related column.** The `theme_preference` column is the only theme-state that lives in the DB. Future theme extensions (per-page overrides, tenant defaults) should extend this column pattern rather than adding new tables.
4. **The token vocabulary file is load-bearing.** `globals.css` token scales defined in Plan 06 were consumed by Plans 07-08 without modification. Treat this file as a contract — changes need a deliberate review pass.

### Cost Observations

- Sessions: 1 focused session
- Model: Claude Opus 4.7 (orchestrator) + executor subagents (balanced profile)
- Notable: Single-phase milestone executed in one day; 8 plans across 3 waves (01-04 → 05-06 → 07-08) with clean git history

---

## Milestone: v1.0 MVP

**Shipped:** 2026-04-21
**Phases:** 8 | **Plans:** 32 | **Commits:** 151
**Timeline:** 2026-04-09 to 2026-04-21 (12 days)

### What Was Built

1. **Phase 1 — Foundation & Auth:** Next.js 16 + TypeScript strict + Tailwind 4 + 29 shadcn/ui components, 9-table Supabase schema with RLS, full auth flow (email/password + Google OAuth)
2. **Phase 2 — Company Onboarding:** Multi-step wizard capturing business identity (name, industry, logo, color, address, defaults)
3. **Phase 3 — Dashboard & Client Management:** App shell + project list with search/filter/sort + full client CRUD with logo upload
4. **Phase 4 — Project Creation & Workspace:** 3-step project wizard + 5-tab workspace with overview tab and activity timeline
5. **Phase 5 — Audio Recording & Photo Management:** MediaRecorder waveform + Whisper transcription + photo pipeline with drag-and-drop, captions, 20-photo limit, mobile camera capture
6. **Phase 6 — AI Estimate Generation & Editor:** Claude Vision photo analysis + Claude tool_use estimate generation + inline editor with real-time math recalculation + auto-save
7. **Phase 7 — PDF, Sharing, Email & Settings:** @react-pdf/renderer PDF + public share page with accept/decline + Resend email delivery + settings page
8. **Phase 8 — Platform Admin Panel:** AES-256-GCM encrypted API credential store + super-admin gate + /admin/integrations + /admin/branding + /admin/admins + auth dark pass + full env-var/identity sweep

### What Worked

- **Wave-based parallel execution:** Plans with no mutual dependencies ran simultaneously (e.g., 08-01 + 08-02, 08-04 + 08-05 + 08-06 + 08-07). Reduced total wall-clock time significantly vs sequential.
- **GSD plan quality:** Detailed PLAN.md files with explicit , , and  let executor agents operate independently without orchestrator context leakage.
- **TDD discipline on Phase 8:** Writing failing tests first caught a real bug in the plan-provided AES test fixture (34-byte key vs required 32-byte) before it could silently corrupt encrypted data in production.
- **Verifier agent catching build regressions:** The Phase 8 verifier caught the  boundary violation in  that 08-08 had unknowingly introduced — saved a broken production deploy.
- **Singleton platform_branding pattern:** Seeding  at migration time eliminated null-safety branches across every page that reads branding. The pattern proved cleaner than a separate bootstrap step.
- ** marker + vitest alias combination:** Enforced server/client module boundary at both build time (Next.js) and test time (vitest jsdom), catching real violations that would have been runtime errors.

### What Was Inefficient

- **REQUIREMENTS.md tracking drift:** Individual requirement checkboxes were not updated during phases 5-7 execution, requiring a reconciliation pass at milestone close. Traceability fell behind the actual implementation.
- **Usage quota interruptions:** Both Wave 1 agents in Phase 8 hit the Anthropic usage limit mid-task. One agent completed (08-02 SUMMARY.md written), one was partial (08-01 Task 2 artifacts on disk but uncommitted). Required main-thread recovery pass.
- **Checkpoint pattern friction:**  plans with human-verify checkpoints created unnecessary wait points. User pre-approved all checkpoints; the checkpoint mechanism added round-trips that could have been skipped with an explicit  flag.
- ** /  CLI gaps:** Executor agents repeatedly hit errors on these two commands because STATE.md lacked the expected field format and REQUIREMENTS.md did not contain ADMIN-* IDs. Both are pre-existing format gaps that added noise to summaries.

### Patterns Established

- **Page + form server/client split:** Server page fetches branding (or other server-only data) and passes it as props to a  wizard/form. Established in auth pages (Phase 8-07) and onboarding (gap fix).
- ** for integration tests:** Reads  before tests run; keeps  working in vitest without manual shell exports. Committed as a shared setup file.
- ** helper on Supabase BYTEA:** Supabase-js s Buffer values returned from queries. Added  to  to normalise the roundtrip. Required for AES decrypt to work with stored ciphertext.
- **Deny-all RLS by omission:** Tables with no RLS policies (but RLS enabled) are accessible only via service role key. Used for  and  — cleanest posture for platform secrets.
- ** as first line + vitest alias:** Enforces module boundary at both build and test layer. All server-only lib files use this pattern.

### Key Lessons

1. **Mark requirements complete per phase, not at milestone close.** Deferring requirement checkbox updates to the end creates reconciliation debt and makes mid-milestone progress reporting inaccurate.
2. **Pre-approve checkpoints explicitly in config when in auto mode.** Rather than relying on the user to respond to each human-verify gate, a  config flag would eliminate round-trips.
3. **Vitest + server-only requires alias setup upfront.** Add the  alias to  at project scaffold time (Phase 1), not when the first server-only module is introduced (Phase 8). Retrofitting it required updating all existing test runs.
4. **Run the build after every parallel wave.** The 08-07 build passed, but 08-08 broke it by converting  to an async server component. A wave-end build check would have caught this immediately rather than at verification.
5. **The singleton DB pattern eliminates null branching everywhere downstream.** Any data that every page needs (branding, config) should be seeded at migration time to guarantee a row exists from day one.

### Cost Observations

- Sessions: multiple across 12 days
- Model: Claude Opus 4.7 (orchestrator) + executor subagents
- Notable: Parallel Wave 3 (4 agents simultaneously) completed all 4 plans without merge conflicts — git worktrees and  commit discipline kept the index clean

## Milestone: v3.0 — Monetization

**Shipped:** 2026-05-14
**Phases:** 6 (Phases 55-60) | **Plans:** 11 | **Tasks:** ~22
**Timeline:** 2026-05-13 → 2026-05-14 (2 days)
**Files changed:** 46 files, ~2,870 lines added

### What Was Built

1. **Phase 55 — Schema + Tier Definitions:** 6 new `companies` columns + `usage_events` table (deny-all RLS, partial unique index for idempotency). `lib/entitlements.ts` with `number | null` limits (not `Infinity`). Trial start wired to INSERT branch of `createOrUpdateCompany()` only.
2. **Phase 56 — Usage Tracking:** `lib/quota.ts` — `checkQuota()` (monthly + daily DB count) + `recordUsage()` (upsert ON CONFLICT DO NOTHING via idempotency key). 7 unit tests, no live DB needed.
3. **Phase 57 — Enforcement Layer:** `checkQuota` before + `recordUsage` after in `generate-estimate` and `analyze-photos` routes. WhatsApp handler gates on `whatsappEnabled` entitlement before first Meta download. HTTP 402 with `{ error: 'plan_limit_reached', upgradeUrl: '/settings/billing' }` across all endpoints.
4. **Phase 58 — Stripe Integration:** `stripe@22.1.1` installed. `IntegrationProvider` extended with `'stripe'`. Checkout + portal routes. Webhook handler with `processed_stripe_events` idempotency table (mirrors `whatsapp_processed_messages`). 4 lifecycle events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed` (no DB write), `customer.subscription.deleted`.
5. **Phase 59 — Billing UI:** `getBillingData()` with service-role for deny-all `usage_events`. `/settings/billing` page + settings entry card. `UpgradeButtons` + `ManageSubscriptionButton` → Stripe. `TrialBanner` (server-side, < 3 days). `UpgradeModal` (`window.fetch` interceptor → sonner toast on 402).
6. **Phase 60 — Trial Automation + Admin Tooling:** `expire-trials` cron (hourly) + `trial-warning-emails` cron (daily 9am UTC). `forceTier` + `grantBonusCredits` server actions. `/admin/billing` page with MRR stat and company table.

### What Worked

- **STATE.md milestone field reversion:** A recurring issue where worktree executor agents reverted STATE.md `milestone:` to an old value. Pattern identified: always fix STATE.md milestone before init on every phase. Could be automated in the workflow.
- **Parallel Wave 1 in Phase 60:** Both plans (cron routes + admin page) ran in parallel with no conflicts — completely independent file sets.
- **`number | null` instead of `Infinity`:** Critical research finding that saved a silent JSON serialization bug.
- **Proxy bypass pre-wired:** `/api/webhooks/stripe` already covered by existing `pathname.startsWith('/api/webhooks/')` bypass — zero proxy.ts changes needed.

### What Was Inefficient

- **STATE.md milestone drift:** Every phase start required manually fixing `milestone: v1.5 → v3.0` due to worktree isolation. Cost ~2-3 minutes per phase (15 phases = ~30-45 minutes lost).
- **ROADMAP.md gsd-tools parser issue:** Phase detail sections placed outside the current milestone's extraction window caused `get-phase` to fail. Required manual ROADMAP restructuring for Phases 53 and 54 before planning could proceed.
- **SUMMARY.md file loss in worktree merges:** Phase 59 SUMMARY files were present in git history but missing from working tree after merge conflict resolution. Recovery required `git checkout HEAD --` to restore.

### Patterns Established

- `number | null` (not `Infinity`) for unlimited tier limits — JSON-safe, semantically clear
- `processed_stripe_events` idempotency table pattern (mirrors `whatsapp_processed_messages`)
- Stripe SDK initialized per-request via `getIntegrationKey('stripe')` — not module-level (ADMIN-06 pattern)
- Phase detail sections must be placed immediately after their milestone checklist in ROADMAP.md for gsd-tools extraction to work correctly
- Bonus credits via negative `usage_events` rows (stays within existing CHECK constraint)

### Key Lessons

- Fix STATE.md milestone before every init call when worktrees are in use
- Phase detail sections in ROADMAP.md belong inside the current milestone section, not in a global Phase Details area
- `request.text()` must be the absolute first await in Stripe webhook handlers (before any JSON parsing)
- Stripe Checkout metadata (`plan: 'pro' | 'business'`) is more reliable than `line_items` in webhook payloads

### Cost Observations

- Sessions: 2 sessions across 2 days
- Model: Claude Sonnet 4.6 (orchestrator + executors)
- Notable: 6 phases executed with research + planning + execution + verification cycle in ~2 days — monetization system from zero to complete
