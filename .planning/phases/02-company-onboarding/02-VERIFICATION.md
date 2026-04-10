---
phase: 02-company-onboarding
verified: 2026-04-10T12:00:00Z
status: human_needed
score: 12/12 must-haves verified (automated)
human_verification:
  - test: "Full onboarding wizard flow end-to-end"
    expected: "3-step wizard completes, company row created in Supabase, redirect to /dashboard"
    why_human: "Requires running server, Supabase connection, and visual inspection"
  - test: "Skip flow creates minimal company row"
    expected: "Clicking Skip for now creates company with name 'My Company' and redirects to /dashboard"
    why_human: "Requires live Supabase database to verify row creation"
  - test: "Logo upload stores file in Supabase Storage"
    expected: "Uploaded logo appears in logos bucket at {user_id}/logo.{ext} path"
    why_human: "Requires Supabase Storage bucket and browser file selection"
  - test: "Visual polish and responsive layout"
    expected: "600px centered card, step indicator circles, industry cards grid, color swatches, logo avatar"
    why_human: "Visual appearance cannot be verified programmatically"
  - test: "Company name visible in navigation after onboarding"
    expected: "Dashboard nav shows the company name entered during onboarding"
    why_human: "Dashboard does not exist yet (Phase 3), so this success criterion cannot be verified"
---

# Phase 2: Company Onboarding Verification Report

**Phase Goal:** A newly registered user can complete a 3-step onboarding wizard that captures their business identity, uploads a logo, and lands them on the main dashboard with a populated company record.
**Verified:** 2026-04-10T12:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | INDUSTRIES config has exactly 8 industries plus an Other option | VERIFIED | `lib/industries.ts` exports 8-element array; Other handled in UI by `industry-selector.tsx` |
| 2 | Each industry has id, label, icon, projectTypes array | VERIFIED | All 8 entries have all 4 fields; `as const satisfies Industry[]` enforces type |
| 3 | Onboarding zod schema validates company name as required (min 2 chars) | VERIFIED | `lib/schemas/onboarding.ts` line 6: `.min(2, 'Company name must be at least 2 characters')` |
| 4 | Onboarding schema allows optional email/website with empty string bypass | VERIFIED | `.email().optional().or(z.literal('')).default('')` pattern on both fields |
| 5 | Onboarding schema has sensible defaults for Step 3 fields | VERIFIED | `defaultTaxRate: 0`, `defaultPaymentTerms: 'Net 30'`, `defaultWarrantyTerms: '1 year'`, `defaultValidityDays: 30` |
| 6 | User sees a 3-step wizard at /onboarding with step indicator | VERIFIED | `app/onboarding/page.tsx` renders `OnboardingWizard`; `step-indicator.tsx` renders 3 circles with a11y labels |
| 7 | Step 1 collects company name (required), owner, phone, email, website | VERIFIED | `step-business-info.tsx` renders all 5 FormField components with correct names |
| 8 | Step 2 shows industry icon card grid with 8+Other and color swatches | VERIFIED | `industry-selector.tsx` maps 8 INDUSTRIES + Other card; `color-picker.tsx` has 10 presets + custom |
| 9 | Step 2 has logo upload with preview/change/remove | VERIFIED | `logo-uploader.tsx` has Avatar preview, Change/Remove buttons, 2MB/type validation |
| 10 | Step 3 has address fields and pre-filled defaults | VERIFIED | `step-address-defaults.tsx` has address/city/state/zip + defaults section with form defaultValues |
| 11 | Completing the wizard creates/updates company in Supabase and redirects to /dashboard | VERIFIED | `lib/actions/company.ts` has SELECT-then-INSERT/UPDATE + `redirect('/dashboard')` |
| 12 | Skipping creates minimal company row with default name | VERIFIED | `handleSkip` calls `createOrUpdateCompany({ companyName })` with fallback `'My Company'` in server action |

**Score:** 12/12 truths verified (automated checks)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/industries.ts` | INDUSTRIES constant and Industry type | VERIFIED | 105 lines, exports INDUSTRIES (8 entries) and Industry interface |
| `lib/schemas/onboarding.ts` | Zod schema for onboarding form | VERIFIED | 63 lines, exports onboardingSchema, OnboardingValues, OnboardingInput, STEP_FIELDS |
| `lib/actions/company.ts` | Server action for company persistence | VERIFIED | 96 lines, real SELECT-then-INSERT/UPDATE with getClaims() auth |
| `components/onboarding/onboarding-wizard.tsx` | Main wizard with step state and form | VERIFIED | 259 lines, useForm + zodResolver, 3-step nav, skip, complete with logo upload |
| `components/onboarding/onboarding-card.tsx` | Wider centered card layout | VERIFIED | 45 lines, max-w-[600px], logo+wordmark, skipAction slot |
| `components/onboarding/step-indicator.tsx` | 3 clickable step circles with a11y | VERIFIED | 61 lines, aria-label, aria-current, Check icon for completed |
| `components/onboarding/step-business-info.tsx` | Step 1 form fields | VERIFIED | 122 lines, 5 FormField components with min-h-[44px] |
| `components/onboarding/step-brand-identity.tsx` | Step 2 with industry/color/logo | VERIFIED | 75 lines, wires IndustrySelector, ColorPicker, LogoUploader |
| `components/onboarding/step-address-defaults.tsx` | Step 3 address + defaults | VERIFIED | 222 lines, address grid + 4 default fields |
| `components/onboarding/industry-selector.tsx` | Icon card grid for industry selection | VERIFIED | 109 lines, role=radiogroup, ICON_MAP, Other with custom input |
| `components/onboarding/color-picker.tsx` | Preset swatches + custom hex | VERIFIED | 118 lines, 10 presets, custom hex validation, role=radiogroup |
| `components/onboarding/logo-uploader.tsx` | Avatar circle upload | VERIFIED | 106 lines, 2MB check, type validation, preview/change/remove |
| `app/onboarding/page.tsx` | Server page with auth gate | VERIFIED | 15 lines, getClaims() + redirect, renders OnboardingWizard |
| `tests/unit/industries.test.ts` | Unit tests for INDUSTRIES | VERIFIED | 59 lines |
| `tests/unit/onboarding-schema.test.ts` | Unit tests for onboarding schema | VERIFIED | 216 lines |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `onboarding-wizard.tsx` | `lib/schemas/onboarding.ts` | import onboardingSchema, STEP_FIELDS | WIRED | Line 9: `import { onboardingSchema, STEP_FIELDS }` |
| `industry-selector.tsx` | `lib/industries.ts` | import INDUSTRIES | WIRED | Line 3: `import { INDUSTRIES }` |
| `onboarding-wizard.tsx` | `lib/actions/company.ts` | import createOrUpdateCompany | WIRED | Line 11: `import { createOrUpdateCompany }` |
| `lib/actions/company.ts` | Supabase companies table | `.from('companies').insert/update` | WIRED | Lines 64, 73, 85: SELECT, UPDATE, INSERT |
| `onboarding-wizard.tsx` | Supabase Storage logos | `supabase.storage.from('logos').upload` | WIRED | Line 138: upload with user-scoped path |
| `step-brand-identity.tsx` | industry-selector/color-picker/logo-uploader | component composition | WIRED | Lines 36-70: all 3 sub-components rendered with correct props |
| `app/onboarding/page.tsx` | onboarding-wizard.tsx | import OnboardingWizard | WIRED | Line 3: direct import, line 14: rendered |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `onboarding-wizard.tsx` | form (OnboardingValues) | useForm with zodResolver + user input | User-entered form data | FLOWING |
| `industry-selector.tsx` | INDUSTRIES | Static config `lib/industries.ts` | 8 hardcoded industry entries | FLOWING (config data, not DB) |
| `lib/actions/company.ts` | row object | Maps form values to DB columns | INSERT/UPDATE to Supabase | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED -- requires running Next.js dev server and Supabase connection for meaningful behavioral checks. All 44 unit tests pass per user confirmation; build passes.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| ONBOARD-01 | 02-01, 02-02 | Multi-step wizard collects business info | SATISFIED | step-business-info.tsx: companyName, ownerName, phone, email, website fields |
| ONBOARD-02 | 02-01, 02-02 | User selects industry from INDUSTRIES config (8 options) | SATISFIED | industry-selector.tsx renders 8 INDUSTRIES + Other card |
| ONBOARD-03 | 02-01, 02-02 | User picks brand primary color via color picker | SATISFIED | color-picker.tsx: 10 presets + custom hex |
| ONBOARD-04 | 02-02, 02-03 | User can upload company logo (Supabase Storage) | SATISFIED | logo-uploader.tsx handles file selection; wizard uploads to Storage on complete |
| ONBOARD-05 | 02-01, 02-02 | User enters business address, license, insurance | SATISFIED | step-address-defaults.tsx: address, city, state, zip, licenseNumber, insuranceInfo |
| ONBOARD-06 | 02-01, 02-02 | User sets default tax rate, payment terms, warranty terms | SATISFIED | step-address-defaults.tsx: defaultTaxRate, defaultPaymentTerms, defaultWarrantyTerms, defaultValidityDays |
| ONBOARD-07 | 02-03 | After onboarding, redirect to main dashboard | SATISFIED | lib/actions/company.ts line 95: `redirect('/dashboard')` |
| ONBOARD-08 | 02-01, 02-02, 02-03 | Onboarding can be skipped and completed later via Settings | SATISFIED | Skip for now button calls createOrUpdateCompany with minimal data; Settings reuse is Phase 7 |

**Orphaned Requirements:** None. All 8 ONBOARD requirements are covered by plans and have implementation evidence.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No TODO/FIXME/placeholder/stub patterns found in any phase 2 file |

### Human Verification Required

### 1. Full Onboarding Wizard Flow

**Test:** Run `bun dev`, sign up with a new account, complete all 3 wizard steps with sample data, verify company row in Supabase dashboard.
**Expected:** Company row created with all fields mapped correctly; toast "Company setup complete" appears; redirect to /dashboard.
**Why human:** Requires running server, live Supabase connection, and browser interaction.

### 2. Skip Flow

**Test:** Sign up with another new account, click "Skip for now" on Step 1.
**Expected:** Company row created with name "My Company" and default values; redirect to /dashboard.
**Why human:** Requires live database to verify row creation.

### 3. Logo Upload to Storage

**Test:** During wizard Step 2, upload a PNG under 2MB. Complete setup.
**Expected:** Logo file appears in Supabase Storage `logos` bucket at `{user_id}/logo.png` path; logo_url column populated.
**Why human:** Requires Supabase Storage bucket access and file selection.

### 4. Validation Error Display

**Test:** Leave company name empty, click Next on Step 1.
**Expected:** Inline error "Company name must be at least 2 characters" appears below the input.
**Why human:** Requires visual inspection of error rendering.

### 5. Visual Layout and Responsiveness

**Test:** View /onboarding on desktop (1200px+) and mobile (375px).
**Expected:** Centered 600px card, readable step indicator, properly laid out industry grid (3 cols desktop, 2 cols mobile), color swatches, logo avatar circle.
**Why human:** Visual appearance cannot be verified programmatically.

### Gaps Summary

No automated gaps found. All 15 artifacts exist, are substantive (no stubs), and are properly wired. All 7 key links verified. All 8 ONBOARD requirements have implementation evidence. No anti-patterns detected.

The phase is code-complete pending human verification of the live flow (Supabase integration, visual polish, and end-to-end user journey). Note that one ROADMAP success criterion ("company name visible in the navigation") depends on Phase 3's dashboard/app shell, which does not exist yet -- this is expected and not a gap for Phase 2.

---

_Verified: 2026-04-10T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
