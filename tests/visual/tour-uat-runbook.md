# Phase 75 — Tour & Tooltip Manual UAT Runbook

**Purpose:** Walk every tooltip surface and every spotlight step in EN, PT-BR, and ES. Log findings in `.planning/known-issues.md` per FIX-02 convention.

**Companion doc:** `tests/visual/tour-inventory.md` (canonical inventory of mount sites).

## i18n verification — preflight (automated, performed during 75-04 Task 1)

Every `ContextualTooltip` call site was grepped to confirm the `text` prop receives a plain English string literal (or `tooltipConfig.text`, a static English string in `TOOLTIP_MAP`). The translation happens inside `ContextualTooltip` via `t(text)` and inside `TourSpotlight` via `t(currentStep.title)` / `t(currentStep.description)` plus `t('Back')` / `t('Next')` / `t('Done')` / `t('Skip tour')` button labels.

Verified sites (all PASS — plain English strings, no interpolation, no bare DOM rendering):

| File | Line | text source |
| ---- | ---- | ----------- |
| `components/app-shell/topbar.tsx` | 70 | `"Switch languages — estimates can be sent in EN, PT, or ES"` |
| `components/app-shell/sidebar.tsx` | 95-96 | `TOOLTIP_MAP[href].text` — `"Clients are saved automatically when you send an estimate"` and `"Save your most-used items to speed up future estimates"` |
| `components/workspace/estimate/estimate-totals.tsx` | 128 | `"Tap any line to edit, add, or remove items"` |
| `components/workspace/send/plain-text-card.tsx` | 73 | `"Clients receive a professional message with the estimate link"` |

Tour spotlight step copy (`components/tour/tour-step.tsx`) — all 5 steps store English source text in `title` + `description`, rendered via `t()` in `tour-spotlight.tsx:202,209,219`. Buttons rendered via `t('Back')`, `t('Next')`, `t('Done')`, `t('Skip tour')`.

**Conclusion:** i18n wrapping is complete. UAT below verifies the EN/PT/ES output renders correctly at runtime.

## Pre-flight

1. Start dev server: `pnpm dev`
2. Sign in as the dev seed user.
3. Open browser devtools → Application → Local Storage. Confirm no `tooltip_seen_*`, `tour_completed`, or `tour_spotlight_pending` keys exist. If any do, click "Restart tour" (TourHelpButton, bottom-right) which clears all `xtimator:tour:v1:*` state, then refresh.

## Per-language checklist

Repeat the entire section for each language: **EN**, **PT-BR**, **ES**. Switch via the language toggle in the topbar.

### A. No unprompted tooltips (TOUR-FIX-02)

| Page | Expected | Result (EN / PT / ES) |
|------|----------|------------------------|
| `/dashboard` on cold load | Zero tooltips visible | [ ] / [ ] / [ ] |
| `/clients` on navigation | Zero tooltips visible | [ ] / [ ] / [ ] |
| `/price-book` on navigation | Zero tooltips visible | [ ] / [ ] / [ ] |
| `/projects/[id]` workspace | Zero tooltips visible | [ ] / [ ] / [ ] |
| `/estimate/[token]` share page | Zero tooltips visible (no ContextualTooltip mounted here, but sanity-check) | [ ] / [ ] / [ ] |

### B. Hover reveals — every ContextualTooltip site (TOUR-FIX-02, TOUR-FIX-03, TOUR-FIX-07)

For each row: hover the anchor, confirm the tooltip appears with TRANSLATED text on the expected side (auto-flipped if near viewport edge), and dismisses on hover-away.

| Anchor | Page | Side prop | Translated text appears | Auto-flips on narrow viewport | Hover-away dismisses |
|--------|------|-----------|--------------------------|-------------------------------|----------------------|
| Language toggle (topbar) | any authed page | bottom | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] |
| Clients nav link | sidebar | right | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] |
| Price-book nav link | sidebar | right | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] |
| Estimate total | `/projects/[id]/estimate` | top | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] |
| WhatsApp send card | `/projects/[id]/send` | bottom | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] |

Narrow-viewport check: resize the window to ~600px wide, hover the Language Toggle, confirm the tooltip does not overflow the right edge (Radix `collisionPadding` should auto-flip/shift).

### C. Spotlight tour walkthrough (TOUR-FIX-05)

1. Click the help button (bottom-right "?" icon). Confirm the welcome modal appears in your language.
2. Click "Show me around" / "Vamos lá" / "Empezar el tour".
3. Walk all 5 steps: new-project → projects → clients → price-book → language-toggle.
4. Confirm each step's title + description renders in the current language.
5. On the language-toggle step, confirm the spotlight highlights the VISIBLE element (topbar on desktop, bottom-nav on mobile) — not a hidden element off-screen.
6. Press ESC mid-tour: spotlight closes; focus returns to the page (verify by pressing Tab — first focusable element receives focus, not a destroyed spotlight node).
7. Re-open via help button: confirm step 1 is shown again (restart cleared state).

| Step | Highlights correct element | Title translated | Description translated | Next/Back/Done labels translated |
|------|----------------------------|------------------|------------------------|-----------------------------------|
| new-project | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] |
| projects | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] |
| clients | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] |
| price-book | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] |
| language-toggle (DESKTOP) | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] |
| language-toggle (MOBILE viewport ~390px) | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] | [ ] / [ ] / [ ] |

### D. a11y preferences (TOUR-FIX-05)

1. In devtools → Rendering, toggle `prefers-reduced-motion: reduce`. Re-run a spotlight walkthrough — transitions should be instantaneous (no slide animation between steps).
2. Toggle `prefers-reduced-transparency: reduce`. Re-open the spotlight — the tooltip card should render with a solid background, not the glass blur surface.
3. Confirm ESC still dismisses with reduced-motion on.

| Check | EN | PT | ES |
|-------|----|----|----|
| Reduced-motion: spotlight transitions skipped | [ ] | [ ] | [ ] |
| Reduced-transparency: card surface solid | [ ] | [ ] | [ ] |
| ESC dismisses with reduced-motion on | [ ] | [ ] | [ ] |

### E. Persistence (TOUR-FIX-04)

1. Complete the spotlight tour (click "Done" on last step).
2. Hard-refresh the page. Confirm the spotlight does NOT re-appear.
3. Hover the Language Toggle tooltip. Move away. Refresh. Hover again — tooltip MUST appear again (hover tooltips have no "seen" memory by design, per owner decision).
4. Click "Restart tour" (TourHelpButton). Confirm welcome modal re-appears AND devtools shows `xtimator:tour:v1:*` keys cleared.

| Check | Result |
|-------|--------|
| Spotlight does not re-appear after completion + refresh | [ ] |
| Hover tooltips re-appear after refresh (intentional — no persistence on hover) | [ ] |
| TourHelpButton restart wipes xtimator:tour:v1:* keys | [ ] |

## Findings

Capture every observed deviation here. Severity tags: `blocker` / `major` / `minor` / `nit`. After UAT, copy the table into `.planning/known-issues.md` under a "Phase 75" heading.

| # | Severity | Page | Language(s) | Description | Repro steps |
|---|----------|------|-------------|-------------|-------------|
| 1 | | | | | |

If zero findings, write `No findings — clean UAT pass in EN/PT/ES on YYYY-MM-DD` into `.planning/known-issues.md` under a Phase 75 heading (per FIX-02 convention — log either way).
