---
phase: 260522-gnx
plan: 01
subsystem: phone-input-internacional
tags: [ui, forms, pdf, i18n, phone]
requires: []
provides:
  - PhoneInput (shared UI component with country flag selector + value-init from any incoming shape)
  - formatPhoneForDisplay (region-aware phone formatter, PDF-only)
  - COUNTRIES / applyMask / maxDigits (single source of truth for the 18-country list + mask helpers)
affects:
  - components/clients/client-sheet.tsx
  - components/settings/company-info-form.tsx
  - components/onboarding/step-business-info.tsx
  - components/workspace/send/send-form.tsx
  - app/admin/integrations/twilio-from-phone-form.tsx
  - components/settings/whatsapp-connect-card.tsx
  - components/onboarding/survey/steps/phone-step.tsx
  - components/pdf/estimate-pdf.tsx
tech-stack:
  added: []
  patterns:
    - "Controlled-component sync via useEffect that compares external `value` to the internal canonical emit (`+{dial} {masked}`) — re-parses only when they diverge, preventing render loops."
    - "Adapter pattern for E.164-strict schemas: PhoneInput emits the formatted shape; onChange strips non-digits before storing in form state so existing zod regexes continue to pass."
    - "Longest-first dial-prefix matching against the COUNTRIES list (3-digit → 2-digit → 1-digit) with first-match-wins; US precedes CA in COUNTRIES so dial `1` resolves to US."
key-files:
  created:
    - lib/phone/countries.ts
    - lib/phone/format.ts
    - components/ui/phone-input.tsx
    - tests/unit/phone/format.test.ts
  modified:
    - components/clients/client-sheet.tsx
    - components/settings/company-info-form.tsx
    - components/onboarding/step-business-info.tsx
    - components/workspace/send/send-form.tsx
    - app/admin/integrations/twilio-from-phone-form.tsx
    - components/settings/whatsapp-connect-card.tsx
    - components/onboarding/survey/steps/phone-step.tsx
    - components/pdf/estimate-pdf.tsx
  deleted:
    - components/onboarding/phone-input.tsx
decisions:
  - "PhoneInput value-init bug fix is wrapped in a `parseIncoming(value)` helper that handles E.164 (`+15083013010`), already-formatted (`+1 (508) 301-3010`), 10-digit US bare (`5083013010`), and empty/whitespace input. Unknown dials fall back to `{ countryCode: 'US', localNumber: '' }` without firing a synthetic onChange — keeps the parent's value intact."
  - "useEffect controlled-sync compares against the internal emit shape (`+${dial} ${localNumber}`) rather than re-running parseIncoming on every render, avoiding the obvious feedback loop with `onChange`."
  - "E.164-strict schemas (send-form `^\\+[1-9]\\d{7,14}$`, whatsapp-connect-card `^\\+\\d{7,15}$`, twilio-from-phone E.164) were preserved verbatim. Adapter strips non-digits in onChange instead of relaxing regex — keeps server contracts and stored data shape unchanged."
  - "Old `components/onboarding/phone-input.tsx` was deleted (not re-exported) because grep confirmed zero consumers before the move. One-line re-export would be dead code."
  - "formatPhoneForDisplay scope is locked to `components/pdf/estimate-pdf.tsx`. Other display surfaces (estimate share view at `/estimate/[token]`, client list, settings displays) intentionally left untouched."
metrics:
  duration: ~12m
  completed: 2026-05-22
---

# Quick Task 260522-gnx: Phone Input Internacional com Bandeira (Flag) Summary

Promoted the existing onboarding-only PhoneInput to a shared UI component, wired it into 7 phone-capture surfaces, and added a pure `formatPhoneForDisplay` utility used exclusively by the PDF estimate render.

## What Shipped

- **`components/ui/phone-input.tsx`** — shared `PhoneInput` with country-flag selector (US/BR/CA preferred + 15 others), extended props (id, name, placeholder, disabled, autoFocus, className), and `parseIncoming(value)` initializer that correctly hydrates flag + masked digits from E.164, formatted, or 10-digit US bare input.
- **`lib/phone/countries.ts`** — single source of truth: `COUNTRIES` (18 entries, locked order), `applyMask`, `maxDigits`.
- **`lib/phone/format.ts`** — `formatPhoneForDisplay(raw)` with longest-first dial-prefix matching and raw passthrough on unknown dial.
- **7 form integrations** — every phone-capture surface in the app now uses the shared component.
- **PDF formatting** — `company.phone` and `client.phone` in `components/pdf/estimate-pdf.tsx` render through `formatPhoneForDisplay`.
- **5 unit tests** — `tests/unit/phone/format.test.ts`, all passing.

## Discovery Correction (Carried Forward from Plan)

The scope claimed `components/onboarding/survey/steps/phone-step.tsx` was the existing consumer of `PhoneInput`. **Wrong.** That file used a plain `<Input>` directly — confirmed by reading the file and grepping for the import. `PhoneInput` had **zero consumers** in the codebase before this plan. We treated `phone-step.tsx` as the 7th wire (it logically deserves the same component) rather than the existing consumer it was claimed to be. Net result: 7 wires instead of 6, with `phone-step` being the simplest.

## Value-Init Bug That Got Fixed

`components/onboarding/phone-input.tsx` initialized `localNumber` with `useState('')` regardless of the incoming `value` prop. Any consumer passing a non-empty `value` (e.g., the WhatsApp connect form re-rendering after `form.reset({ phoneNumber: company.whatsapp_phone })`) would see an empty input and a US flag, even though the form state held the real number. This was latent because the component had zero consumers — but it would have blown up immediately if we'd wired it into edit-mode flows (ClientSheet edit, CompanyInfoForm preload, WhatsApp re-connect) without fixing it first.

The shared component now:
1. Initializes both `countryCode` and `localNumber` from `parseIncoming(value)` on mount.
2. Re-parses on subsequent value changes via a useEffect that compares the incoming `value` to our canonical internal emit shape `+${dial} ${localNumber}` — only re-runs `parseIncoming` when they diverge. This picks up `form.reset()` and async-preload updates without entering a render loop.

## E.164 Schema Adapter Pattern

3 of the 7 forms have zod regexes requiring strict E.164 (no spaces, parens, or hyphens):

| File                                                      | Schema regex                  | Adapter        |
| --------------------------------------------------------- | ----------------------------- | -------------- |
| `components/workspace/send/send-form.tsx`                 | `^\+[1-9]\d{7,14}$`           | strip in onChange |
| `components/settings/whatsapp-connect-card.tsx`           | `^\+\d{7,15}$`                | strip in onChange |
| `app/admin/integrations/twilio-from-phone-form.tsx`       | E.164 validated server-side   | strip in onChange |

The other 4 (`client-sheet`, `company-info-form`, `step-business-info`, `phone-step`) have no regex constraint on phone, so they accept PhoneInput's formatted `+{dial} {masked}` shape natively.

**No schemas were touched.** The adapter `formatted.replace(/[^\d+]/g, '')` produces strict E.164 (e.g., `+15083013010`) before it ever reaches `field.onChange`. On re-render, `parseIncoming` decodes the E.164 back into flag + masked digits for display while the underlying form value stays E.164. Round-trip is preserved.

## Verification

- `npx tsc --noEmit` — clean across the entire repo.
- `npx vitest run tests/unit/phone/format.test.ts` — 5/5 tests pass:
  - US E.164 `+15083013010` → `+1 (508) 301-3010`
  - US already-formatted `+1 (508) 301-3010` → unchanged
  - BR E.164 `+5511987654321` → `+55 (11) 98765-4321`
  - Unknown dial `+9990001111` → raw passthrough
  - Empty/null/undefined → `''`
- Grep checks:
  - `from ['"]@/components/onboarding/phone-input` → 0 hits (old path retired).
  - `from ['"]@/components/ui/phone-input['"]` → 7 production files + the plan doc.
  - `formatPhoneForDisplay` → 3 production files (lib/phone/format.ts, tests/unit/phone/format.test.ts, components/pdf/estimate-pdf.tsx) + the plan doc.
- No `package.json` diff — zero new external dependencies (no libphonenumber-js).
- No data migration — stored phone strings load via `parseIncoming` and re-format on display.

## Deviations from Plan

None — plan executed exactly as written. The "discovery correction" about `phone-step.tsx` was already captured in the plan's `<discovery>` block and the 7-file scope was followed.

## Commits

| Task | Commit  | Description                                                                |
| ---- | ------- | -------------------------------------------------------------------------- |
| A    | 2b9841c | Promote PhoneInput to shared UI + extract countries + fix value-init bug   |
| B    | 8bd7519 | Wire PhoneInput into 7 phone-capture surfaces                              |
| C    | d0b514f | Add formatPhoneForDisplay + unit tests + apply to PDF only                 |

## Self-Check: PASSED

- File checks: `components/ui/phone-input.tsx`, `lib/phone/countries.ts`, `lib/phone/format.ts`, `tests/unit/phone/format.test.ts` all exist on disk.
- Commit checks: `2b9841c`, `8bd7519`, `d0b514f` all present in `git log`.
- Old file `components/onboarding/phone-input.tsx` confirmed deleted.
- TypeScript: clean.
- Unit tests: 5/5 green.
