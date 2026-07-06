---
status: resolved
trigger: "Inspecione todas as issues abertas do projeto Xtimator no Sentry, corrija cada causa no código, verifique as correções e marque-as como resolvidas."
created: 2026-06-27
updated: 2026-06-27
---

# Debug Session: sentry-open-issues

## Symptoms

- **Expected behavior:** Production runs without unresolved application errors in the Xtimator Sentry project.
- **Actual behavior:** Sentry reports three unresolved issues: XTIMATOR-3, XTIMATOR-5, and XTIMATOR-6.
- **Error messages:** Missing Server Action after deployment; maximum React update depth; DOM `removeChild` NotFoundError.
- **Timeline:** Events range from 2026-06-09 through 2026-06-27.
- **Reproduction:** Inspect all `is:unresolved` issues in `skale-club/xtimator`, correlate their latest production events and replays with the current code and deployment history.

## Current Focus

- **hypothesis:** Confirmed: XTIMATOR-3 combines invalid scanner-supplied Server Action IDs with missing self-hosted skew protection; XTIMATOR-5 was the breadcrumb feedback loop fixed by c3e51366; XTIMATOR-6 is external browser translation/extension DOM mutation during React navigation cleanup.
- **test:** Focused regression suites, production-source typecheck, lint, production build, and built-config inspection.
- **expecting:** Exact scanner noise is dropped without hiding unrelated `/page` failures; every immutable image receives a matching Next.js deployment ID; browser translation does not mutate the React tree; breadcrumb publications remain semantically idempotent.
- **next_action:** Resolve XTIMATOR-3, XTIMATOR-5, and XTIMATOR-6 in Sentry with the verified cause/fix notes.

## Evidence

- timestamp: 2026-06-27
  observation: "Sentry search `is:unresolved` over 90 days returned exactly XTIMATOR-3, XTIMATOR-5, and XTIMATOR-6."
- timestamp: 2026-06-27
  observation: "XTIMATOR-5 last occurred before commit c3e51366, which added semantic breadcrumb equality and separated unmount cleanup from publication."
- timestamp: 2026-06-27
  observation: "XTIMATOR-3 is the Next.js self-hosting error for a client invoking a Server Action ID from an incompatible build."
- timestamp: 2026-06-27
  observation: "The three latest XTIMATOR-3 events arrived in the same second from one datacenter IP while claiming three different Chrome versions and two operating systems, confirming scanner traffic rather than three real clients."
- timestamp: 2026-06-27
  observation: "XTIMATOR-6 occurred twice for one Chrome user across navigation replays, has no actionable first-party frame, and matches React's known removeChild failure when browser translation or extensions replace React-owned text nodes."
- timestamp: 2026-06-27
  observation: "Focused Vitest run passed 4 files / 15 tests; scoped ESLint and production-source tsc passed."
- timestamp: 2026-06-27
  observation: "Next.js production build compiled, typechecked, and generated all 74 static pages successfully; required-server-files.json contained the expected Git SHA as deploymentId."

## Eliminated

- XTIMATOR-3 real-user burst: impossible user-agent combination from the same IP and timestamp identifies automated probes.
- XTIMATOR-6 application removeChild call: application code has no matching call on the affected settings/navigation path and the stack terminates entirely in React deletion effects.

## Resolution

- **root_cause:** XTIMATOR-3 was invalid/stale Server Action identifiers reaching Next.js without an immutable deployment ID; XTIMATOR-5 was referential breadcrumb republishing plus cleanup churn; XTIMATOR-6 was external translation/extension mutation of React-owned text nodes.
- **fix:** Added Git-SHA `deploymentId` plumbing, an exact Server Action mismatch Sentry filter, global browser-translation opt-out, and retained the previously shipped semantic breadcrumb equality fix.
- **verification:** 4 focused test files / 15 tests passed; touched-file ESLint clean; `tsc --noEmit -p tsconfig.ci.json` clean; `npm run build` exit 0; built deploymentId exactly matched Git HEAD.
- **files_changed:** `.github/workflows/build-deploy.yml`, `Dockerfile`, `app/layout.tsx`, `instrumentation.ts`, `lib/observability/sentry-filters.ts`, `next.config.ts`, `tests/unit/deployment-skew.test.ts`, `tests/unit/observability/sentry-filters.test.ts`
