---
phase: quick-260707-psh
plan: 01
type: execute
wave: 1
depends_on: [quick-260707-mv1, quick-260707-o7a]
files_modified:
  - supabase/migrations/20260707000002_projects_needs_details.sql
  - lib/estimate/adapters/default.ts
  - lib/estimate/graph/nodes/auto-refine.ts
  - lib/ai/needs-details.ts
  - lib/actions/attempt-outcome.ts
  - components/capture/capture-recorder.tsx
  - components/workspace (needs-details banner component — locate at execution)
  - lib/queries or lib/actions (trade suggestion helper)
  - app/(app)/settings (company settings suggestion banner — locate at execution)
autonomous: true
requirements: [QUICK-psh-01, QUICK-psh-02]
must_haves:
  truths:
    - "A discarded-vague generation classifies WHY (mic_test | too_short | missing_specifics) and produces 2-4 SPECIFIC clarifying questions in the estimate language, persisted on the project"
    - "The popup's needs_details outcome shows the classification + questions with a Record again action — never just a generic 'too vague' toast"
    - "The needs-details recourse banner on the project page shows the same questions"
    - "When ≥3 of the last 5 KEPT generations have detected_trade ≠ company.industry, a dismissible suggestion to update the primary trade appears in Settings → Company (one-tap apply)"
    - "All app strings English (t() literals); AI questions generated in the estimate language"
  artifacts:
    - path: "lib/ai/needs-details.ts"
      provides: "Single small AI call: classify vague reason + generate clarifying questions"
    - path: "supabase/migrations/20260707000002_projects_needs_details.sql"
      provides: "projects.needs_details JSONB (reason, questions[], attempt_id, created_at)"
  key_links:
    - from: "vague terminal (adapter awaiting_details path)"
      to: "lib/ai/needs-details.ts"
      via: "classify+questions call, persisted to projects.needs_details"
      pattern: "needs_details"
    - from: "getAttemptOutcome needs_details variant"
      to: "projects.needs_details"
      via: "questions surfaced to the popup"
      pattern: "questions"
    - from: "Settings company page"
      to: "trade_mismatch_detected activity rows"
      via: "suggestion threshold query (3 of last 5)"
      pattern: "trade_mismatch"
---

<objective>
Adaptive-first, layer 4: imperfect input is never discarded silently — the tool answers with
exactly what it needs. Production case (attempt 8a0c13e8): a mic-test recording ("Alô, tá me
ouvindo?... sofa cleaning?") produced a generic discard; the right response is "that looked like
a mic test 🙂" or, for real-but-thin input, the 2-4 questions that would make it priceable
("How many seats? Fabric or leather? Any specific stains?"). Second adaptation: item 260707-mv1
records trade_mismatch_detected activity rows; this task turns the observed pattern into a
one-tap Settings suggestion.

DEPENDS ON: 260707-mv1 (detected_trade + mismatch activity) and 260707-o7a (capture-recorder
final shape) being committed first.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260707-mv1-adaptive-trade-inference-industry-become/260707-mv1-SUMMARY.md (detected_trade mechanics as built)
@.planning/quick/260707-lyq-p4-core-bulletproofing-journal-first-out/260707-lyq-02-SUMMARY.md (needs_details outcome path in the popup)
@lib/estimate/adapters/default.ts (vague terminal — sets awaiting_details)
@lib/estimate/graph/nodes/auto-refine.ts (revert path)
@lib/actions/attempt-outcome.ts (needs_details variant to enrich)
@components/capture/capture-recorder.tsx (needs_details outcome handling)
@lib/ai/openrouter-client.ts + lib/ai/with-fallback.ts (call pattern for the small AI call)
Locate at execution: the needs-details banner component that renders on projects.status='awaiting_details'
(grep for awaiting_details in components/), and the Settings → Company page.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Classification + questions at the vague terminal</name>
  <files>supabase/migrations/20260707000002_projects_needs_details.sql, lib/ai/needs-details.ts, lib/estimate/adapters/default.ts (or the precise vague terminal found by tracing)</files>
  <action>
    1a. Migration file (DO NOT apply — orchestrator applies via Supabase MCP):
        `ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS needs_details JSONB;`
        with a COMMENT documenting shape { reason: 'mic_test'|'too_short'|'missing_specifics',
        questions: string[], attempt_id: uuid, created_at: iso }.
    1b. lib/ai/needs-details.ts — `buildNeedsDetails(transcriptOrDescription: string, language: 'en'|'pt'|'es', industryHint?: string)`:
        ONE small chat call (reuse the existing OpenRouter chat client + fallback pattern used by
        other small calls in lib/ai/ — find one, e.g. translate/refine helpers, and mirror it)
        returning STRICT JSON { reason, questions } — questions 2-4, concrete, in the ESTIMATE
        language, phrased for a field-service owner; for reason 'mic_test' return questions: []
        (the UI copy carries the message). Never-throw: on any failure return
        { reason: 'missing_specifics', questions: [] } so the vague flow never breaks.
    1c. Wire at the FINAL vague terminal (the same place awaiting_details is set — trace whether
        that is adapters/default.ts or the auto-refine exhaustion path; there must be exactly ONE
        wiring point so refine-loop intermediate reverts do NOT trigger it): call buildNeedsDetails
        with the transcript + estimate language + company industry, persist to
        projects.needs_details (service client), and include reason in the existing pipeline event
        for the attempt if a natural slot exists (do not invent new steps).
  </action>
  <verify><automated>cd "C:/Users/Vanildo/Dev/xtimator" && test -f supabase/migrations/20260707000002_projects_needs_details.sql && grep -n "buildNeedsDetails" lib/ai/needs-details.ts && npx tsc --noEmit && npx eslint lib/ai/needs-details.ts</automated></verify>
  <done>Vague terminal persists reason+questions exactly once per discarded attempt; never breaks the flow.</done>
</task>

<task type="auto">
  <name>Task 2: Surface in popup + needs-details banner</name>
  <files>lib/actions/attempt-outcome.ts, components/capture/capture-recorder.tsx, needs-details banner component</files>
  <action>
    2a. getAttemptOutcome: enrich the needs_details variant → { state: 'needs_details';
        reason?: string; questions?: string[] } by reading projects.needs_details when the
        attempt matches (needs_details.attempt_id === attemptId; tolerate absent column data).
    2b. capture-recorder needs_details/awaiting_details handling: replace the generic toast with
        a compact panel in the popup (reuse the CaptureFailure surface or a sibling): reason
        'mic_test' → t('That sounded like a mic test 🙂 Record again describing the job.');
        otherwise → t('Almost there — a few details would make this priceable:') + the questions
        as a list + the existing record-again/reset behavior. English strings via t(); the
        questions arrive already localized from the AI.
    2c. Locate the project-page needs-details banner (renders on status awaiting_details) and add
        the questions list from projects.needs_details (server component query or existing data
        path). Keep styling consistent with the banner's current design.
  </action>
  <verify><automated>cd "C:/Users/Vanildo/Dev/xtimator" && grep -n "needs_details" lib/actions/attempt-outcome.ts components/capture/capture-recorder.tsx && npx tsc --noEmit && npx eslint components/capture/capture-recorder.tsx lib/actions/attempt-outcome.ts</automated></verify>
  <done>Both surfaces show classification-appropriate guidance with the specific questions.</done>
</task>

<task type="auto">
  <name>Task 3: Industry auto-suggestion (Settings)</name>
  <files>trade suggestion helper + Settings company page</files>
  <action>
    3a. Server helper `getTradeSuggestion(companyId)` (place beside existing company
        queries/actions): query estimate_activity event_type='trade_mismatch_detected' joined to
        kept context — rule: among the last 5 such rows (or fewer), if ≥3 share the same detected
        trade AND it differs from companies.industry → return { suggestedTrade, occurrences };
        else null. Respect a dismissal: store dismissals in company_settings/companies metadata
        (find the existing lightweight per-company settings mechanism and reuse; if none is
        cheap, a `trade_suggestion_dismissed_at` check against newer mismatch rows).
    3b. Settings → Company page: when suggestion present, a dismissible inline banner:
        t('Most of your recent estimates were {trade} work — make it your primary trade?') with
        Apply (updates companies.industry via the existing company update action) and Dismiss.
        English strings; match the page's existing form styling.
  </action>
  <verify><automated>cd "C:/Users/Vanildo/Dev/xtimator" && grep -rn "getTradeSuggestion" lib/ | head -3 && npx tsc --noEmit</automated></verify>
  <done>Threshold suggestion with one-tap apply + durable dismiss; no suggestion spam.</done>
</task>

<task type="auto">
  <name>Task 4: Tests</name>
  <files>tests (mirror conventions)</files>
  <action>
    - buildNeedsDetails: JSON parse happy path; malformed AI output → safe fallback; mic_test → empty questions.
    - getAttemptOutcome needs_details enrichment: with matching attempt_id → questions included; stale/absent → bare needs_details.
    - getTradeSuggestion: 3-of-5 threshold true/false cases; dismissal honored.
    Run targeted suites + npx tsc --noEmit; report counts.
  </action>
  <verify><automated>cd "C:/Users/Vanildo/Dev/xtimator" && npx vitest run tests/unit/ai/ tests/unit/actions/ && npx tsc --noEmit</automated></verify>
  <done>Core logic covered; suites green.</done>
</task>

</tasks>

<verification>
tsc/eslint baselines; suites green; migration file present but NOT applied (orchestrator applies
via MCP). Post-deploy manual: mic-test recording → friendly mic-test message; thin real input →
specific questions in popup AND project banner; after 3 mismatched-trade generations → Settings
suggestion appears, Apply updates industry, Dismiss silences it.
</verification>

<success_criteria>
Imperfect input always gets an actionable, specific response; configuration heals itself from
observed behavior with one tap.
</success_criteria>

<output>
After completion, create `.planning/quick/260707-psh-adaptive-vague-handling-classify-why-inp/260707-psh-SUMMARY.md`
</output>
