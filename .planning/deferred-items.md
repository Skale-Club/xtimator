# Deferred Items

Operational / scope deferrals surfaced during execution. Each carries forward with its rationale; none is silently dropped.

## Phase 109 — Durability + Cost-Control Hardening

### Item 5 — `step.run('price-research')` retry isolation via the StepRunner seam — DEFERRED (109-02)

**What:** Give price research its own Inngest retry unit (`runner.run('price-research', …)`) so a research-source timeout retries the research alone, without re-invoking the already-succeeded LLM generate step.

**Why deferred (not forced):** `generateEstimateForProject(companyId, projectId, options)` takes NO `StepRunner` today — `GenerateEstimateOptions` carries only `language` / `userAppLanguage` / `prompts` / `channel` / `createdByUserId` (`lib/services/generate-estimate.ts`). The price-research call is an INLINE `await researchUnmatchedPrices(...)` already wrapped in a non-fatal `try/catch` (the 108-04 wire). Giving research its own retry unit would require threading a real `StepRunner` (`lib/estimate/graph/types.ts`) through `GenerateEstimateOptions` → `generateEstimateForProject` → the research call site — an invasive change to the freshly-wired 108 service path. Per CONTEXT decision #4 and the phase scope guardrails ("DEFER IF RISKY … the inline call is already non-fatal"), this is deferred rather than forced.

**Durability intent already met at the never-throw level:** the inline `try/catch` already guarantees a research failure never blocks or fails the estimate. The finer `step.run` resume (research retried in isolation from generate) is the deferred enhancement, to be picked up when a `StepRunner` is threaded through the service path in a dedicated (non-risky) refactor.

**Pickup condition:** when `generateEstimateForProject` next gains a threaded `StepRunner` (or the service path is otherwise refactored to expose the runner seam at the research call site), wrap the `researchUnmatchedPrices` call in `runner.run('price-research', …)`.

## Phase 160 — URL Contract & Public Access Security

### Item 1 — `tests/unit/env-var-sweep.test.ts` borderline against vitest's 5s default test timeout — OBSERVED, OUT OF SCOPE (160-04)

**What:** While building the new `tests/unit/estimates/no-hardcoded-share-url.test.ts` repo-wide static sweep (Plan 160-04, Task 3 — mirrors this file's `walk()` pattern), a cold run of the NEW test timed out at vitest's default 5000ms (`tests` phase took 6242ms). Re-running the pre-existing `env-var-sweep.test.ts` standalone for comparison showed it passing but at 4.93s — right at the edge of the same 5000ms default, on this now much-larger `app/components/lib` tree than when that test was authored.

**Why deferred (out of scope):** `env-var-sweep.test.ts` is a pre-existing file untouched by this plan's task list (`files_modified` in 160-04-PLAN.md's frontmatter does not include it) — per the SCOPE BOUNDARY rule, only issues directly caused by this plan's own changes are auto-fixed. The new sweep test in this plan was given an explicit `20000`ms per-test timeout to fix its own instance of the same problem (in-scope, since it's a file this plan creates).

**Pickup condition:** if `env-var-sweep.test.ts` starts flaking on CI/local due to the 5s default timeout as the codebase keeps growing, add the same explicit longer per-test timeout (e.g. `it('...', () => {...}, 20000)`) to that file.

### Item 2 — pre-existing `chatEnabled` fixture drift in WhatsApp handler tests — RESOLVED 2026-07-16 (fixed by commit `ef5cc1bf`, quick-260715-aa1; verified: bare `tsc --noEmit` clean, all whatsapp handler tests green)

**What:** The plan's own verification command (`npx tsc --noEmit -p tsconfig.json | grep -E "send-sms|whatsapp|connect-webhook"`) also surfaces 5 pre-existing `TS2345` errors in `tests/unit/whatsapp/handler.test.ts`, `handler-intent-routing.test.ts`, and `handler-inngest-dispatch.test.ts` — inline `Entitlements` test fixtures missing the `chatEnabled` field.

**Why deferred (out of scope):** `chatEnabled` was added to `Entitlements` in Phase 126 (commit `6c0cf457`); these 3 test files were last touched in the unrelated "Billing v2" commit `f455ac16`, predating (and unrelated to) Phase 160. None of the 4 files this plan (160-04) actually modified (`app/api/estimates/[id]/send-sms/route.ts`, `lib/whatsapp/send-estimate.ts`, `lib/whatsapp/confirm-actions.ts`, `lib/billing/connect-webhook.ts`) have any type errors — confirmed via the plan's exact per-file acceptance-criteria greps. The broader `whatsapp` grep in the plan's overall `<verification>` block incidentally also matches these unrelated pre-existing fixture files. Per the SCOPE BOUNDARY rule, this pre-existing drift (not caused by this plan's changes) is logged, not fixed.

**Pickup condition:** next time `tests/unit/whatsapp/handler*.test.ts` is touched for an unrelated reason, add `chatEnabled: false` (or `true` per fixture intent) to each inline `Entitlements` object at handler.test.ts:142/289, handler-intent-routing.test.ts:130, handler-inngest-dispatch.test.ts:132/231.

## Phase 171 — Structured Photo Extraction

### Item 1 — pre-existing bare `tsc --noEmit` drift in unrelated test files — OBSERVED, OUT OF SCOPE (171-01)

**What:** 171-01's own acceptance criteria (`npx tsc --noEmit -p tsconfig.ci.json`) is clean, but running the BARE `npx tsc --noEmit` (per tsconfig.ci.json's own header note, to catch tests/** drift invisible to the scoped CI config) surfaces 7 pre-existing errors, all in files this plan never touches: `tests/unit/ai/vision-truncation.test.ts:28`, `tests/unit/billing/derived-duration.test.ts:136`, `tests/unit/billing/transcribe-short-circuit.test.ts:61`, `tests/unit/inngest/analyze-photos-cost.test.ts:81`, `tests/unit/inngest/analyze-photos-coverage.test.ts:53` (all `TS2556` — a spread argument must have a tuple type), and `tests/unit/schemas/estimate-bounds.test.ts:132,154` (`TS2322` — `unit: null` not assignable where fixture expects `unit: string`).

**Why deferred (out of scope):** Verified via `git stash -u` that all 7 errors are present identically on the pre-171-01 tree — none are caused by `lib/ai/photo-extraction-schema.ts`, the `photos.ai_extraction` migration, or the `database.types.ts` hand-add. Per the SCOPE BOUNDARY rule, pre-existing failures in files this plan doesn't modify are logged, not fixed.

**Pickup condition:** next time any of the 7 listed test files is touched for an unrelated reason, fix its own drift (spread-argument tuple typing / `unit: null` vs `string` fixture mismatch) as part of that change.

## Phase 180 — Isolated Demo Session & Read-Only Foundation

### Item 1 — pre-existing ambient-guard setup drift in notification event-source tests — OBSERVED, OUT OF SCOPE (180-11)

**What:** A whole-file run of `tests/unit/notifications/event-sources.test.ts` has three existing failures in the anonymous public-estimate cases (`logEstimateView`, accepted response, declined response). Those tests call newly guarded public-estimate actions without a Next request cookie scope, so the real ambient `assertWritable()` reaches `cookies()` and throws. The two Stripe Connect cases relevant to Plan 180-11 pass when selected and now pass the normal trusted company as the handler's fourth argument.

**Why deferred (out of scope):** Plan 180-11 changes signed Stripe/Connect and shared service funnels; it does not own public-estimate action authentication or those three anonymous test setups. The failing stacks stop in `app/estimate/[token]/actions.ts` before notification dispatch and are independent of every file changed by this plan. Focused Plan 180-11 coverage is green (323 tests), and `tsconfig.ci.json` is clean.

**Pickup condition:** when the public-estimate action tests are next maintained, provide the same request/guard mock context used by the dedicated Phase 180 public-estimate boundary suite, then restore the whole `event-sources.test.ts` file to green.

## PDF-LOGO-01 follow-up work (2026-08-07)

### Item 1 — attached job-site PHOTOS are WebP too, and also never render in a PDF — OBSERVED, OUT OF SCOPE

**What:** while fixing PDF-LOGO-01 (company logos stored as WebP, which
`@react-pdf/image` cannot decode), the identical failure was found one layer
over on estimate photos. `lib/actions/photo.ts:144` runs `convertImageToWebp`
and uploads `{companyId}/{projectId}/{photoId}.webp` with
`contentType: 'image/webp'`. `lib/pdf/render-estimate-pdf.ts` hands those to
`components/pdf/shared/pdf-photo-grid.tsx` as short-lived **signed remote URLs**,
and react-pdf's `resolveImageFromUrl`
(`node_modules/@react-pdf/image/lib/index.js:193`) sniffs the fetched bytes with
`getImageFormat`, which recognises only `JPEG.isValid` / `PNG.isValid`. A WebP
body therefore throws `Not valid image extension`, is swallowed by
`@react-pdf/layout`'s `fetchImage` catch, and the photo grid renders blank —
while `blocksFromModel` has already charged the page budget for the photo grid.
Same bug class as PDF-LOGO-01, same silent signature.

**Why deferred (out of scope):** PDF-LOGO-01's scope is the company logo. The
photo path is a different resolution mechanism (signed remote URL, not the
in-process `resolveAssetForRenderer` inline path), so the fix is materially
different and materially more expensive: the server would have to READ every
attached photo's bytes and transcode them per render, instead of emitting a
signed URL react-pdf fetches itself. That is a real bandwidth/memory decision
(N photos x full resolution per PDF) and deserves its own plan, its own size
caps and its own measurement of the page-budget impact. Nothing in the
PDF-LOGO-01 change touches `lib/actions/photo.ts`, `pdf-photo-grid.tsx`, or the
photo signed-URL block of `render-estimate-pdf.ts`.

**Pickup condition:** schedule as PDF-PHOTO-01. `lib/pdf/resolve-pdf-logo.ts`'s
`transcodeToPdfSafeDataUri` is the reusable half; the open question is only
whether photos get transcoded in-process on every render, get a stored
PDF-safe variant at upload time, or get a transcoding read path on the asset
proxy. Note that unlike logos, photos are NOT publicly readable, so a
`/storage/` proxy path is not an option for them.
