---
id: SEED-047
status: planted
planted: 2026-07-24
planted_during: v4.21 — Notification Center
harvested:
harvested_in:
trigger_when: Next milestone or quick pass on mobile/landing typography polish
scope: small
---

# SEED-047: Scale every section's text + title +30% on mobile phone only

## Why This Matters

On the **mobile phone** view the landing sections' text and titles look too
small. The user wants every section's **title and body text ~30% bigger on
phone only** — tablet (`sm`) and desktop (`lg`) sizing must stay exactly as they
are. This is the phone-only counterpart to the desktop rhythm that already
reads well.

## When to Surface

**Trigger:** Any mobile/landing typography polish pass. Do it together with
SEED-046 (mobile spacing) — bigger phone text changes line counts and section
heights, which interacts with the spacing rhythm.

## Scope Estimate

**Small but broad** — mechanical: bump the **base (unprefixed) font-size**
utility on each landing section's title + body ~1.3×, leaving every `sm:` / `lg:`
pin untouched (same "scale base, keep sm/lg pinned" pattern already used in the
hero work — see quick-260723 / quick-260724-t2r). "Every section" = hero,
trust bar, how-it-works, features, final CTA.

Guard rails:
- Base only (phone `<640`). Never change `sm:`/`lg:` values.
- Where the base already uses `clamp()` with a `vw` term, scale the floor (and
  optionally the `vw` slope) so the phone end grows ~30% while the value still
  meets its `sm:` pin at the 640px boundary (avoid a size DROP crossing into
  `sm`, the bug class fought repeatedly in the hero work).
- Re-check wrapping/line counts after scaling (bigger text wraps more).

## Breadcrumbs (base font sizes to scale ~1.3× — phone only)

| File:line | Element | Current base size |
|-----------|---------|-------------------|
| `components/landing/hero-section.tsx:138` | Hero H1 | `text-[clamp(35px,9.24vw,67px)]` (sm/lg pinned) |
| `components/landing/hero-section.tsx` (`<p>`) | Hero subheadline | base `text-[20px]` |
| `components/landing/trust-bar.tsx:44` | Trust-bar stat number | `text-[clamp(26px,3.5vw,28px)]` |
| `components/landing/how-it-works-section.tsx:282` | Eyebrow | `text-xs` |
| `components/landing/how-it-works-section.tsx:283` | Section H2 | `text-[clamp(24px,4vw,44px)]` |
| `components/landing/how-it-works-section.tsx:291` | Intro P | `text-sm` |
| `components/landing/how-it-works-section.tsx:252` | Step H3 | `text-[0.9rem]` |
| `components/landing/how-it-works-section.tsx:255` | Step P | `text-[0.8rem]` |
| `components/landing/features-section.tsx:83` | Eyebrow | `text-xs` |
| `components/landing/features-section.tsx:84` | Section H2 | `text-[clamp(24px,4vw,44px)]` |
| `components/landing/features-section.tsx:92` | Intro P | `text-sm` |
| `components/landing/features-section.tsx:57` | Card title | `text-base` |
| `components/landing/features-section.tsx:58` | Card description | `text-sm` |
| `components/landing/features-section.tsx:59` | Benefit pill | `text-xs` |
| `components/landing/final-cta-section.tsx:29` | Eyebrow | `text-xs` |
| `components/landing/final-cta-section.tsx:30` | Section H2 | `text-[24px]` |
| `components/landing/final-cta-section.tsx:35` | Body P | `text-sm` |

## Notes

- "Every section" is explicit — include the trust bar and the feature-card inner
  text (title/description/pill), not just the section headings.
- Prefer explicit `text-[...px]` on the base where a token like `text-sm` is
  currently used, so the +30% is precise (e.g. `text-sm`=14px → ~`text-[18px]`
  base, `sm:text-base` kept).
- Pairs with [[SEED-046-mobile-tablet-section-spacing-harmony]].
