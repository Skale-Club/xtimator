---
id: SEED-048
status: planted
planted: 2026-07-24
planted_during: v4.21 — Notification Center
harvested:
harvested_in:
trigger_when: When the landing hero is next touched, or when verifying on a real touch tablet / after the next production deploy
scope: small
---

# SEED-048: Largest tablet/iPad hero still renders stacked in the user's view

## Why This Matters

The intent (from quick-260724-t2r) is: at **≥1024px** the hero should use the
**desktop side-by-side layout** (text-left 55% column + image on the right),
while `<1024px` tablets/phones stay stacked. A fix was applied — both hero
`pointer:coarse` blocks were capped at `max-width: 1023px` so ≥1024 tablets fall
through to the `lg:` desktop layout (commit `972a0d92`).

**But the user still sees the stacked full-width layout at ~1131px.** So the
code is correct but the running/viewed result is not — this needs a proper
verification-and-delivery pass rather than another blind CSS change.

## Diagnostic already gathered

- On the **dev server** (localhost:9633) at **1131px**, computed style is
  `hero-content { flex-direction: row }`, `.hero-left` width `578px` (~55%),
  `.hero-image { position: absolute }` → **side-by-side, code is correct**.
- The Browser pane reports `pointer: fine`, so the real-tablet `pointer:coarse`
  path could NOT be exercised there — the ≥1024 coarse behavior is verified only
  by "the coarse blocks no longer cover ≥1024", not by a live coarse render.

So the user's stacked view is almost certainly a **stale/delivery** issue, not a
code issue. Prime suspects, in order:

1. **PWA service-worker CSS caching** — the app has a service worker that has
   caused stale-asset bugs before (see quick-260522-ka1 hydration-from-SW-cache
   and related). The user's browser may be serving an old `globals.css`.
2. **Not hard-refreshed** — global CSS / media-query change didn't re-evaluate
   in the open tab.
3. **Viewing undeployed production** — all quick-260724-t2r work is **local
   commits only, never pushed/deployed**, so xtimator.com (or a phone hitting
   prod) has NONE of it yet.

## When to Surface

**Trigger:** Next time the landing hero is worked on, or when the session has
access to a real touch tablet, or right after the next production deploy (to
confirm the layout on the deployed build).

## Scope Estimate

**Small** — mostly verification, not new layout code:

1. Confirm on the **actual target device/width** the user is using (is it a
   touch device → `pointer: coarse`? what exact CSS width?).
2. Bust the stale view: hard refresh; if a service worker serves old CSS, verify
   the SW update/skipWaiting + cache-versioning actually invalidates `globals.css`
   on deploy.
3. Confirm the change is **deployed** (push → CI → Coolify) if the user is
   checking a non-local URL.
4. Verify the ≥1024 `pointer:coarse` render on a real touch tablet (the one path
   that could not be exercised locally). If a real 1024–1279 touch tablet should
   actually stay stacked (portrait ergonomics), reconsider the 1024 threshold
   (the fix used `lg`=1024; the user may have meant only the very largest, e.g.
   ≥1180).

## Breadcrumbs

| File | Relevance |
|------|-----------|
| `app/globals.css` (~line 78) | `640-1023px portrait pointer:coarse` hero block (kept, stacked) |
| `app/globals.css` (~line 117) | `768-1023px landscape pointer:coarse` hero block — upper bound was pulled 1279→1023 by the fix |
| `components/landing/hero-section.tsx:88-99` | `.hero-content` `flex-col ... lg:flex-row` — the lg: desktop side-by-side classes that ≥1024 now inherits |
| PWA service worker / `next-pwa` (or custom SW) config | Likely cause of stale CSS; confirm cache-busting on deploy |
| `.planning/quick/260724-t2r-hero-title-two-rows-fullwidth/260724-t2r-SUMMARY.md` | Full history of the hero work incl. this fix (commit `972a0d92`) and the Browser-pane compositing/pointer limitations |

## Notes

- Do NOT re-hot-patch the CSS blindly — the code is verified correct on the dev
  server. The remaining work is delivery/verification, not layout.
- Threshold decision to reconfirm with the user: `≥1024` (current) vs a higher
  cutoff so common landscape iPads (1024–1180) stay stacked.
- Related hero history: [[SEED-002-landing-page-global-brand-identity]] and the
  quick-260723 / quick-260724-t2r hero series.
