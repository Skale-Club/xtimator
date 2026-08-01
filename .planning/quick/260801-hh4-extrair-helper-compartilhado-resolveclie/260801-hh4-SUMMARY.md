---
quick_id: 260801-hh4
title: Extrair helper compartilhado resolveClientIp() e usar nos dois call sites (sign route + admin audit-log)
mode: quick-full
status: complete
date: 2026-08-01
commits:
  - 1019ee24  # feat: lib/http/client-ip.ts + tests/unit/http/client-ip.test.ts
  - 19106264  # fix: both call sites now use the shared helper
---

# Quick Task 260801-hh4 — Summary

## Outcome

`lib/admin/audit-log.ts` used to resolve the client IP from the FIRST
`x-forwarded-for` entry — fully attacker-supplied, so every admin action's
audit row could record a forged IP. `app/api/estimates/[id]/sign/route.ts`
already had the correct logic (last hop + `isIP()` validation, `x-real-ip`
never trusted). Both call sites now resolve the client IP through one new
shared helper, `lib/http/client-ip.ts`'s `resolveClientIp()`, so the same
trusted-single-proxy security decision is expressed exactly once.

## What changed (2 tasks, 2 commits)

**Commit 1019ee24 — create the helper + its tests**
- `lib/http/client-ip.ts` (new): `resolveClientIp(headers: Headers): string
  | null`. Reads `x-forwarded-for`, splits on `,`, trims/drops empty parts,
  takes the LAST remaining part, validates it with `isIP()` (node:net) and
  returns `null` on anything that isn't a well-formed IPv4/IPv6 literal.
  `x-real-ip` is never read. Doc comment carries the trust-boundary
  rationale (single trusted appending edge proxy; `x-real-ip` equally
  forgeable; `isIP()` keeps garbage out of Postgres `inet` casts).
- `tests/unit/http/client-ip.test.ts` (new): 9 cases — single-entry XFF,
  multi-entry XFF (last wins), `x-real-ip`-only (null), `x-real-ip` +
  XFF (XFF wins, real-ip ignored), garbage value (null), IPv6 literal,
  header absent (null), whitespace/trailing-comma XFF, empty-string
  header (null).

**Commit 19106264 — use the helper at both call sites**
- `app/api/estimates/[id]/sign/route.ts`: replaced the inline
  `forwardedFor`/`forwardedForLast`/`ipAddress` block with `const
  ipAddress = resolveClientIp(headersList)`; removed the now-unused
  `isIP` import from `node:net`; trimmed the IP-resolution-mechanics
  portion of the surrounding comment to point at the helper (the
  ordering comment about rate-limit-before-body-parse was left intact —
  different concern). No change to the `rateLimit(...)` call or request
  flow.
- `lib/admin/audit-log.ts`: replaced `h.get('x-forwarded-for')
  ?.split(',')[0]?.trim() ?? null` with `resolveClientIp(h)`; the
  surrounding `try/catch` (headers() unavailable outside request scope)
  is untouched; added a comment noting an unparseable/absent value now
  records `null` instead of a caller-chosen string — the intended
  behavior change.

## Verification

- `npx vitest run tests/unit/http/client-ip.test.ts tests/unit/api/sign-route-contract.test.ts`
  — **34/34 passed** (9 new helper tests + all 25 existing sign-route
  contract tests, unmodified, still green — confirms the extraction did
  not change the sign route's observable IP-resolution behavior).
- `npx tsc --noEmit` — clean, 0 errors. (Note: a stale `.next/dev/types`
  cache initially surfaced 6 unrelated `TS2307` errors referencing
  `app/demo/*` pages that no longer exist on disk — a leftover build
  artifact from before `npm ci`, gitignored, untouched by this task's
  changes. Removed `.next/` and reran; clean. Separately, the plan's
  documented 5 pre-existing `TS7016` fontkit-baseline errors did not
  reproduce on this fresh `npm ci` install — reported honestly as
  observed: 0 errors, not "5 unchanged.")
- `git grep -n "x-forwarded-for" -- '*.ts' '*.tsx'` — matches ONLY in
  `lib/http/client-ip.ts` (implementation + doc comment) and test files
  (`tests/unit/http/client-ip.test.ts`, `tests/unit/api/sign-route-contract.test.ts`,
  `tests/unit/demo/ai-estimate-route-boundaries.test.ts`). No inline
  `x-forwarded-for` handling remains in route or audit-log code. (One
  comment in `route.ts` originally paraphrased the literal string —
  reworded to "forwarded-for hop" to keep the grep signal clean.)

## Deviations from Plan

None — plan executed exactly as written. The `.next` cache cleanup above
was infrastructure noise (stale generated artifact, not a code deviation)
and is documented for transparency, not tracked as a Rule 1-4 deviation.

## Notes

- All work on branch `fix/client-ip-trusted-proxy`, not merged, not
  pushed, per constraints.
- `tests/unit/api/sign-route-contract.test.ts` was not edited (per
  constraint) and passes unchanged — it is the regression net proving the
  extraction preserved exact behavior.
- No stubs introduced. No architectural changes (Rule 4 not triggered).
- No secrets written to any tracked file.

## Self-Check: PASSED

All claimed files and commits verified present:
- FOUND: lib/http/client-ip.ts
- FOUND: tests/unit/http/client-ip.test.ts
- FOUND: app/api/estimates/[id]/sign/route.ts
- FOUND: lib/admin/audit-log.ts
- FOUND commit: 1019ee24
- FOUND commit: 19106264
