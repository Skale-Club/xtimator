---
id: SEED-046
status: harvested
planted: 2026-07-24
planted_during: v4.21 — Notification Center
harvested: 2026-07-24
harvested_in: quick-260724-spc
harvest_note: >
  Root inconsistency was how-it-works `py-6 sm:py-8` vs features/final-cta
  `py-16`. Harmonized how-it-works to `py-16 lg:py-10` so all three content
  sections share 64px vertical padding on phone/tablet (verified). The deeper
  100dvh-wrapper staggering (how-it-works 100dvh ≥720, features ≥1024,
  final-cta always) was left as-is — changing the snap-scroll structure is a
  larger, riskier item; flagged as possible follow-up.
trigger_when: Next milestone or quick pass on responsive/landing-page spacing polish
scope: medium
---

# SEED-046: Harmonize between-section spacing on phone + tablet

## Why This Matters

On the landing page, the vertical spacing between sections is uneven on **mobile
phone** and **iPad/tablet** views. On **desktop** the rhythm is already correct
and harmonious — that's the reference to match. Concrete symptom reported by the
user: on phone there is essentially **no gap between the trust bar and the "How
It Works" section**, while other section gaps differ — so the page reads as
inconsistently spaced below `lg`.

## When to Surface

**Trigger:** Any responsive polish / landing-page pass. Should be done alongside
or right after SEED-047 (mobile font scaling) since both touch the same sections
and both are about the sub-`lg` visual rhythm.

## Scope Estimate

**Medium** — audit + retune the section rhythm below `lg`. The root cause is the
interaction between the per-"snap-page" `min-h-[100dvh]` wrappers in
`landing-page.tsx` and each section's own `py-*`:

- On desktop, each wrapper fills `100dvh`, so sections are evenly spaced by
  construction.
- Below the point where a wrapper stops being `100dvh` (e.g. how-it-works
  wrapper is only `min-[720px]:min-h-[100dvh]`; features is `lg:min-h-[100dvh]`),
  spacing collapses to just the sections' `py-*`, which are NOT consistent
  across sections (trust-bar `py-5`, how-it-works `py-6`, features `py-16`,
  final-cta `py-16`). The trust bar sits at the bottom of the hero `100dvh`
  shell, then how-it-works starts immediately → the "no gap" the user sees.

The fix is to define a **single consistent vertical rhythm** for sub-`lg`
(e.g. a shared section padding scale, or explicit top spacing between snap
pages) so phone/tablet match the desktop cadence. Verify at phone (≤430px) and
iPad widths.

## Breadcrumbs

| File | Relevance |
|------|-----------|
| `components/landing/landing-page.tsx:80` | `hero-shell` wrapper `min-h-[100dvh]` — hero + trust bar live inside this one 100dvh page |
| `components/landing/landing-page.tsx:99` | How-it-works wrapper: `min-[720px]:min-h-[100dvh]` — below 720px it's natural height, so the gap after the trust bar collapses to the section's own `py` |
| `components/landing/landing-page.tsx:104` | Features wrapper: `lg:min-h-[100dvh]` — natural height below 1024px |
| `components/landing/landing-page.tsx:109` | Final-CTA wrapper: `min-h-[100dvh]` always |
| `components/landing/trust-bar.tsx:35` | Trust bar padding `py-5 sm:py-3` |
| `components/landing/how-it-works-section.tsx:278` | Section padding `py-6 sm:py-8 lg:py-10` |
| `components/landing/features-section.tsx:74` | Section padding `py-16` (flat across breakpoints — a likely contributor to the uneven feel vs how-it-works `py-6`) |
| `components/landing/final-cta-section.tsx:15` | Section padding `py-16` |

## Notes

- The existing comment on `landing-page.tsx:99` claims "on phone the wrapper is
  natural height so py-8 = mb-8 = equal spacing" — the reported symptom suggests
  that intended equality doesn't actually hold once the trust bar's own padding
  and the hero 100dvh fill are factored in. Re-derive the real gaps at phone
  widths rather than trusting the comment.
- Keep desktop (`lg:`) untouched — it's the reference. Scope changes to base/`sm`
  (and the `min-[720px]` boundary) only.
- Pairs with [[SEED-047-mobile-section-text-title-scale-30pct]] (same sections).
