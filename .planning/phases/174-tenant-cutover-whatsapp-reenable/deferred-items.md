# Deferred Items — Phase 174

Out-of-scope discoveries logged during plan execution, per the executor's
SCOPE BOUNDARY rule (fix only issues directly caused by the current task's
changes; log pre-existing issues in unrelated files instead of fixing them).

## 174-01: `template-seed.ts` whole-string normalization gap (2 events)

**Found during:** 174-01, Task 1 (`buildFullCopyContext` resolver-path proof).

**Files implicated:** `lib/notifications/template-seed.ts` (Phase 172,
`TMPL-01`) — NOT `lib/notifications/copy-context.ts` (174-01's own file,
scope-fenced from touching `template-seed.ts`).

**Issue:** `copy.ts`'s `estimate.viewed` and `estimate.expired` branches
post-process the ENTIRE interpolated string with `.trim()` (estimate.viewed)
or `.replace(/\s+/g, ' ')` (estimate.expired) AFTER string concatenation —
i.e. the normalization runs on the whole assembled sentence, not on an
individual field value. The `notification_templates` seed rows for these two
events are static text with a literal space baked in immediately before the
`{{estimateNumber}}` token (`estimate.viewed`: `'{{clientName}} opened
estimate {{estimateNumber}}.'`) or between two tokens/words
(`estimate.expired`: `'Estimate {{estimateNumber}} reached its expiry...'`).
When `estimateNumber` is genuinely missing (sparse ctx) and renders as `''`
via `renderTemplate`, the result is:

- `estimate.viewed`: resolver → `"A client opened estimate ."` (stray space
  before the period) vs. `copy.ts` → `"A client opened estimate."`
- `estimate.expired`: resolver → `"Estimate  reached its expiry without a
  response."` (double space) vs. `copy.ts` → `"Estimate reached its expiry
  without a response."`

**Why not fixed here:** No value substituted for `estimateNumber` can
retroactively delete a literal space character already present in the
surrounding template text — verified mathematically impossible (a
substitution can only insert content at the placeholder's position, never
remove a preceding literal character). The only real fixes are (a) editing
`template-seed.ts`'s static text for these two rows to drop the
now-conditionally-empty leading space, or (b) having `copy.ts` stop
whole-string-trimming and instead trim at the individual field-default
level. Both require touching files outside 174-01's scope fence (`copy.ts`,
`template-seed.ts` are explicitly out of bounds for this plan — "this plan
MIRRORS copy.ts's defaults and REUSES the seed/engine as a read-only test
oracle").

**Severity:** Cosmetic only — a single stray/doubled space, never a missing
word or blank `{{var}}`. Does NOT reproduce the carry-forward-(a) regression
this plan closes (a whole clause rendering as `''`). Verified via
bug-injection stress-testing during 174-01 that tolerating this specific
whitespace artifact in the test comparison does not mask any genuine
missing-default regression for these or any of the other 15 events (a
missing field still produces substantively different text — a missing word,
not just a stray space).

**Current handling:** `tests/unit/notifications/copy-context.test.ts`
compares these two events' resolver output against `copy.ts`'s output using
a narrow whitespace-normalization helper (`normalizeWhitespaceArtifact`),
documented inline at the point of use. All other 15 events use the raw,
fully-strict `.toBe()` comparison.

**Suggested follow-up:** A future Phase 172/174 touch-up plan could edit
`template-seed.ts`'s `estimate.viewed` body to
`'{{clientName}} opened estimate{{estimateNumber}}.'` style tokens that
don't bake in a literal separator space, OR add a leading-space-aware
`{{estimateNumber}}` convention to the template author guidance. Not
actioned here — out of 174-01's scope.
