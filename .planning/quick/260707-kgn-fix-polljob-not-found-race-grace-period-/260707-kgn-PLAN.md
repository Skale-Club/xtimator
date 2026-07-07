---
phase: quick-260707-kgn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - hooks/use-job-status.ts
  - components/capture/capture-recorder.tsx
  - tests/unit/hooks/poll-job-not-found-grace.test.ts
autonomous: true
requirements: [QUICK-kgn-01]
must_haves:
  truths:
    - "pollJob treats not_found as PENDING (keeps polling) during a grace window, because Inngest creates the run 2-5s AFTER accepting the event — only a not_found persisting past the grace window is terminal"
    - "In capture-recorder, a not_found or config_unavailable result from the fast-failure job race NEVER fails the UI — the DB outcome watcher decides; only state 'failed' (a real failed run) fast-fails"
    - "useJobStatus (hook variant) gets the same grace behavior so its consumers don't regress"
  artifacts:
    - path: "hooks/use-job-status.ts"
      provides: "NOT_FOUND_GRACE_MS grace window in pollJob + useJobStatus"
    - path: "components/capture/capture-recorder.tsx"
      provides: "Advisory-only job race (audio + photos paths)"
  key_links:
    - from: "pollJob loop"
      to: "not_found grace"
      via: "continue-polling branch"
      pattern: "NOT_FOUND_GRACE_MS"
    - from: "capture race handlers"
      to: "advisory not_found/config_unavailable"
      via: "only 'failed' fast-fails"
      pattern: "state === 'failed'"
---

<objective>
Production evidence (attempt 4a26ffb7, 2026-07-07 18:40 UTC): the server-owned pipeline worked
end-to-end (recording saved with real duration 11s → transcribe succeeded → estimate $125
created at 18:41:01), but the USER SAW a failure — "We could not find this job — please retry."
Timeline: client polled /api/jobs at 18:40:35 and got not_found; the Inngest run was created at
18:40:37, two seconds LATER. pollJob (hooks/use-job-status.ts:139) treats not_found as
immediately terminal, and capture-recorder's fast-failure race treated it as fatal.

Two-part fix:
1. Root: not_found within a grace window = still pending (Inngest run creation lags event
   acceptance by 2-5s; fixes ALL pollJob/useJobStatus consumers at the source).
2. Belt: in capture-recorder the job race is ADVISORY — the DB outcome watcher
   (pollEstimateOutcome) is the single source of truth for success/failure of the attempt;
   only a job that Inngest itself reports as failed fast-fails the UI.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@hooks/use-job-status.ts                 (pollJob at ~line 114; useJobStatus loop at ~166; toJobResult at ~86)
@components/capture/capture-recorder.tsx (the race helper added in 260707-hhp Plan 02 — locate the Promise.race between pollJob and pollEstimateOutcome, used by the audio path and the photos path)
</context>

<tasks>

<task type="auto">
  <name>Task 1: not_found grace window in pollJob + useJobStatus</name>
  <files>hooks/use-job-status.ts</files>
  <action>
    Add near the other constants:
    ```typescript
    /** Inngest creates the run AFTER accepting the event — production evidence
     * (260707-kgn): event accepted, client polled at t+1s → not_found, run created
     * at t+3s, job then succeeded. Within this window a not_found body means
     * "not yet", not "gone" — keep polling. Past it, not_found is terminal. */
    const NOT_FOUND_GRACE_MS = 20_000
    ```
    In pollJob's loop: where `body.state === 'processing'` continues, extend the condition —
    if `body.state === 'not_found' && Date.now() - startedAt < NOT_FOUND_GRACE_MS`, sleep
    POLL_MS and continue (same as processing). Terminal handling otherwise unchanged.
    In useJobStatus's loop: same branch before the toJobResult(...) terminal handling
    (`body.state === 'not_found' && Date.now() - startedAt < NOT_FOUND_GRACE_MS` → set state
    'processing', sleep POLL_MS, continue).
    Do NOT change the wire contract, toJobResult, or any exported types.
  </action>
  <verify>
    <automated>cd "C:/Users/Vanildo/Dev/xtimator" && grep -n "NOT_FOUND_GRACE_MS" hooks/use-job-status.ts && npx eslint hooks/use-job-status.ts && npx tsc --noEmit</automated>
  </verify>
  <done>not_found within 20s of poll start keeps polling in BOTH pollJob and useJobStatus; contract unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: job race becomes advisory in capture-recorder</name>
  <files>components/capture/capture-recorder.tsx</files>
  <action>
    Locate the fast-failure race helper (Promise.race of pollJob vs pollEstimateOutcome from
    260707-hhp Plan 02) and its two call paths (audio: transcribe job; photos: analyze job).
    Change the job-result handling so that:
    - `state === 'failed'` → fast-fail as today (failAt with reasonForJobState).
    - `state === 'not_found'` or `state === 'config_unavailable'` → DO NOT failAt and DO NOT
      abort the outcome poll: log via console.warn (with the state, for diagnosis), swallow the
      job-race result, and keep awaiting the outcome poll (the DB is the source of truth — the
      estimate may land regardless; the 6-min outcome timeout already covers the genuinely-dead
      case with a friendly message).
    - `state === 'completed'` → unchanged (progress only; photos path advances the stage).
    Implementation note: with Promise.race this means the race must NOT settle the flow on
    not_found/config_unavailable — restructure so the job poll promise, when resolving one of
    the advisory states, simply never wins the race (e.g. map it to a never-resolving sentinel
    tied to the same AbortSignal, or re-await the outcome promise after inspecting the race
    winner). Keep the abort-on-unmount semantics intact (no leaked timers: anything left pending
    must reject/stop on signal abort).
    Update the surrounding comments: the race exists ONLY to (a) fast-fail on a run Inngest
    reports as failed and (b) advance photo-path progress; absence-of-visibility states are
    advisory.
  </action>
  <verify>
    <automated>cd "C:/Users/Vanildo/Dev/xtimator" && npx eslint components/capture/capture-recorder.tsx && npx tsc --noEmit && grep -n "config_unavailable" components/capture/capture-recorder.tsx</automated>
  </verify>
  <done>not_found/config_unavailable from the job race can never produce a user-facing failure; only 'failed' does; unmount aborts cleanly.</done>
</task>

<task type="auto">
  <name>Task 3: regression test for the exact production race</name>
  <files>tests/unit/hooks/poll-job-not-found-grace.test.ts</files>
  <action>
    New test file (vitest, fake timers where needed; mock global.fetch):
    - "not_found then completed within grace → completed": fetch returns not_found twice, then
      completed → pollJob resolves { state: 'completed' } (this exact sequence failed in
      production before the fix).
    - "not_found persisting past grace → not_found": fetch always returns not_found; advance
      time past NOT_FOUND_GRACE_MS → pollJob resolves { state: 'not_found' }.
    - "failed is still immediate": first response failed → resolves failed without waiting.
    Use vi.useFakeTimers with a pattern that advances both Date.now and setTimeout (vi.setSystemTime
    + vi.advanceTimersByTimeAsync); follow existing fake-timer conventions in the test suite if any.
    Run: npx vitest run tests/unit/hooks/poll-job-not-found-grace.test.ts
  </action>
  <verify>
    <automated>cd "C:/Users/Vanildo/Dev/xtimator" && npx vitest run tests/unit/hooks/poll-job-not-found-grace.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>The production sequence (not_found → run appears → success) is covered and green.</done>
</task>

</tasks>

<verification>
- New test green; tsc clean; eslint baseline on both touched files.
- grep: NOT_FOUND_GRACE_MS present in hook; advisory handling present in capture-recorder.
</verification>

<success_criteria>
- The exact 18:40 production sequence would now show the overlay progressing and end with the
  estimate open — no false "could not find this job" failure.
</success_criteria>

<output>
After completion, create `.planning/quick/260707-kgn-fix-polljob-not-found-race-grace-period-/260707-kgn-SUMMARY.md`
</output>
