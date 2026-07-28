# Deferred Items — Phase 185

Out-of-scope discoveries logged during plan execution, per the executor's scope-boundary protocol (not fixed, not blocking this plan).

## 185-03: `npx next build`'s TypeScript-check phase fails on pre-existing, unrelated files (scripts/ + tests/)

**Found during:** Plan 185-03's plan-level verification step (`npx next build`).

**Symptom:** `npx next build` (run directly against the full local checkout) completes webpack compilation successfully (`✓ Compiled successfully`), but then fails during Next's separate "Running TypeScript..." project-wide check, with pre-existing errors entirely outside this plan's file set:

- `scripts/pagination-drift-spike.ts` (Phase 184 artifact, untouched by 185-03) — `fontArg.unitsPerEm`/`fontArg.layout` don't exist on the `Font | FontCollection` union `fontkit.openSync()` returns.
- `scripts/pagination-render-calibration.ts` — an unrelated `BlocksFromModelCompany` shape mismatch.
- Several `tests/unit/demo/*-route-boundaries.test.ts` files — `NextRequest`/`Request` signature mismatches.
- `tests/unit/pdf/estimate-pdf-pagination.test.tsx` — a `never`-type narrowing issue.
- `tests/unit/pagination/measure/fontkit-arithmetic.test.ts` — the same `Font | FontCollection` issue as the drift-spike script.

**Root cause / why this is out of scope:**
1. None of the above files were created or modified by any 185-03 task.
2. Bare `npx tsc --noEmit` (full project) reproduces the IDENTICAL error list — confirming this is pre-existing repo-wide drift, not something newly introduced by this plan.
3. `.dockerignore` excludes both `scripts/` and `tests/` from the actual production Docker build context — so the real deploy pipeline (`Dockerfile`'s `next build` step) never sees these files at all. `gh run list --workflow="Build and Deploy"` confirms the most recent deploy (2026-07-27T03:37:25Z) succeeded.
4. CI's real gate (`.github/workflows/test.yml`) is the SCOPED `npx tsc --noEmit -p tsconfig.ci.json` (excludes `scripts/**`/`tests/**` by its own `include`/`exclude` lists) — this passes cleanly. The bare full-project `tsc` check is explicitly `continue-on-error: true` (advisory only), per CLAUDE.md's own documented note that this drift "will rot again."

**Why 185-03's own verification intent is still satisfied:** the plan's `npx next build` step exists specifically to prove "the bare `'fontkit'` specifier `browser-estimator.ts` uses resolves to fontkit's browser build automatically under the REAL Next.js client webpack config" — that claim is proven by the webpack COMPILATION phase (`✓ Compiled successfully in 8.9s`), which is a separate, earlier phase than the TypeScript-check phase that fails on the unrelated files above. `npx tsc -p tsconfig.ci.json --noEmit` (the actual CI gate, which DOES cover every file this plan touches) is clean.

**Action:** Not fixed (out of scope). Flagged here for a future cleanup pass — either add `scripts/`/`tests/**` type-fixes, or scope local `next build` verification to mirror the Docker build context (respect `.dockerignore`) so this stops producing local false-alarm failures.
