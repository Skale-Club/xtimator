---
phase: 73-language-onboarding-estimate-language-ui
verified: 2026-05-19T14:00:00Z
status: human_needed
score: 17/17 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 14/17
  gaps_closed:
    - "The estimate generation UI shows a language dropdown pre-filled by resolveEstimateLanguageWithSource()"
    - "A cascade source hint is shown below the dropdown (e.g. 'Defaulted to Portuguese from your app language')"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Onboarding survey language step visual"
    expected: "Step 5 (after Industry) renders three flag+radio rows: US/English, BR/Português (BR), ES/Español. Selecting a non-English option should visually change the dashboard language immediately (LanguageContext setLanguage side-effect)."
    why_human: "Visual rendering and live language-switch effect require running the app in a browser."
  - test: "Company settings default language persists"
    expected: "Selecting Português in the Default estimate language selector and saving should reflect on the next load and not revert to empty."
    why_human: "Requires live DB write + reload verification."
  - test: "Client sheet preferred language persists"
    expected: "Selecting Español and saving should persist to clients.preferred_language column."
    why_human: "Requires live DB write + reload verification."
  - test: "Flag chip on estimate share page"
    expected: "When an estimate's language column is 'pt', the share page shows the Brazilian flag chip. When 'en', shows US flag."
    why_human: "Requires a seeded estimate with language='pt' and visual browser check."
  - test: "PDF language indicator and localized labels"
    expected: "Generating an estimate with language='pt' should produce a PDF with 'Orçamento' as the estimate label, 'PT' text chip in the header, and BRL currency formatting."
    why_human: "Requires end-to-end estimate generation + PDF download."
  - test: "Cascade hint appears below the language dropdown"
    expected: "When app language is set to Português (BR), the estimate tab shows 'Defaulted from your app language' (or translated equivalent) below the language selector."
    why_human: "Requires live app with LanguageContext state + UI rendering to confirm hint text is visible."
---

# Phase 73: Language Onboarding + Estimate Language UI — Verification Report

**Phase Goal:** Add a language step to the onboarding survey and complete the SEED-016 deferred UI items so the full per-estimate language cascade works end-to-end in the web UI (dropdown, flag chip, PDF i18n, settings fields).
**Verified:** 2026-05-19T14:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (previous status: gaps_found, score: 14/17)

## Re-verification Summary

Both gaps from the initial verification are closed:

**Gap 1 — resolveEstimateLanguageWithSource not called:** Now imported at lines 31–32 and called at lines 59–61 of `estimate-tab.tsx`. The inline ternary has been replaced with a proper call to `resolveEstimateLanguageWithSource({ userAppLanguage: appLanguage as EstimateLanguage })`. State is initialized from `cascadeResult.language`.

**Gap 2 — Cascade hint not passed:** `CASCADE_HINT` is now defined as a `Partial<Record<typeof cascadeResult.source, string>>` at lines 64–68, mapping `user`, `company`, and `client` sources to translated strings. `CASCADE_HINT[cascadeResult.source]` is passed as the `hint` prop to `EstimateLanguageSelector` at line 202.

All 17 truths are now verified. Remaining work is human-only (visual, DB write/reload, PDF rendering).

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Onboarding survey has a Language step at position 5 (after Industry, before Brand Color) | VERIFIED | `survey-config.ts` line 94: `key: 'language'` at index 5 in SURVEY_STEPS (11 steps total) |
| 2 | Selecting PT or ES in the language step calls setLanguage() from LanguageContext immediately | VERIFIED | `language-step.tsx` line 28: `setLanguage(lang)` called in handleSelect() |
| 3 | On survey submit, companies.default_estimate_language is saved as 'pt' or 'es' (null for 'en') | VERIFIED | `company.ts` line 63: `default_estimate_language: data.language && data.language !== 'en' ? data.language : null` |
| 4 | The language step can be skipped (required: false) | VERIFIED | `survey-config.ts` line 97: `required: false` |
| 5 | POST /api/generate-estimate accepts an optional language field in the request body | VERIFIED | `route.ts` line 89: `isSupportedLanguage(body.language) ? body.language : undefined` |
| 6 | The language value is forwarded through the Inngest event payload to the worker | VERIFIED | `events.ts` lines 19-20: `language?: 'en' \| 'pt' \| 'es'` in EstimateGeneratePayload; `route.ts` line 93 includes it in payload |
| 7 | The worker passes language to generateEstimateForProject() which persists estimates.language | VERIFIED | `functions/generate-estimate.ts` lines 27, 32-33: destructures language and passes as `{ language: language ?? undefined }` |
| 8 | The estimate generation UI shows a language dropdown pre-filled by resolveEstimateLanguageWithSource() | VERIFIED | `estimate-tab.tsx` lines 31-32: imports `resolveEstimateLanguageWithSource`; lines 59-62: calls it with `appLanguage`, initializes `estimateLanguage` state from `cascadeResult.language` |
| 9 | A cascade source hint is shown below the dropdown | VERIFIED | `estimate-tab.tsx` lines 64-68: `CASCADE_HINT` maps `user`/`company`/`client` sources to translated strings; line 202: `hint={CASCADE_HINT[cascadeResult.source]}` passed to `EstimateLanguageSelector` |
| 10 | The selected language is sent to POST /api/generate-estimate as the language field | VERIFIED | `estimate-tab.tsx` line 111: `body: JSON.stringify({ projectId, language: estimateLanguage })` |
| 11 | Estimate share view shows a flag chip matching estimates.language | VERIFIED | `estimate-view.tsx` line 184: `<LanguageFlagChip lang={estimate.language} />` |
| 12 | Estimate preview in the Send tab shows the same flag chip | VERIFIED | `estimate-preview.tsx` line 100: `<LanguageFlagChip lang={estimate.language} />` |
| 13 | Company settings form has a default_estimate_language selector that persists to DB | VERIFIED | `company-info-form.tsx` line 240: FormField for `defaultEstimateLanguage`; `settings.ts` line 82: persists `default_estimate_language` to DB |
| 14 | Client edit form has a preferred_language selector that persists to DB | VERIFIED | `client-sheet.tsx` line 321: FormField for `preferred_language`; `client.ts` line 41: `preferred_language: formData.preferred_language \|\| null` |
| 15 | EstimatePDF static labels render in the estimate's language | VERIFIED | `estimate-pdf.tsx` line 433: `const L = PDF_LABELS[language] ?? PDF_LABELS.en`; all JSX uses L.* (L.estimate, L.total, L.notes, etc.) |
| 16 | Currency is formatted using Intl.NumberFormat with en-US/es-US or pt-BR locale | VERIFIED | `estimate-pdf.tsx` lines 119-135: CURRENCY_LOCALE + CURRENCY_CODE maps; formatCurrency uses locale and currency code |
| 17 | A language indicator appears in the PDF header matching the estimate language | VERIFIED | `estimate-pdf.tsx` lines 139-144: LANG_INDICATOR map; line 469: `<Text style={styles.langBadge}>{langLabel}</Text>` |

**Score: 17/17 truths verified**

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `components/onboarding/survey/steps/language-step.tsx` | VERIFIED | Exists, 74 lines, exports LanguageStep, calls setLanguage() on selection |
| `components/onboarding/survey/survey-config.ts` | VERIFIED | `'language'` in SurveyStepKey union; step at index 5 |
| `lib/schemas/onboarding.ts` | VERIFIED | `language: z.enum(['en', 'pt', 'es']).optional().default('en')` |
| `lib/actions/company.ts` | VERIFIED | `default_estimate_language` mapped correctly (null for 'en') |
| `app/api/generate-estimate/route.ts` | VERIFIED | Reads body.language, validates with isSupportedLanguage, adds to payload |
| `lib/inngest/events.ts` | VERIFIED | EstimateGeneratePayload has `language?: 'en' \| 'pt' \| 'es'` |
| `lib/inngest/functions/generate-estimate.ts` | VERIFIED | Destructures language, passes to generateEstimateForProject |
| `components/workspace/estimate/estimate-tab.tsx` | VERIFIED | `resolveEstimateLanguageWithSource` imported and called; `CASCADE_HINT` defined; hint prop passed to EstimateLanguageSelector |
| `components/estimate/estimate-language-selector.tsx` | VERIFIED | Created in 73-02; compact Globe+Select with hint prop support |
| `components/capture/capture-recorder.tsx` | VERIFIED | EstimateLanguageSelector wired; language passed in all 3 generation paths |
| `components/share/estimate-view.tsx` | VERIFIED | LanguageFlagChip defined and rendered from estimate.language |
| `components/workspace/send/estimate-preview.tsx` | VERIFIED | LanguageFlagChip defined and rendered from estimate.language |
| `components/settings/company-info-form.tsx` | VERIFIED | defaultEstimateLanguage Select field present |
| `components/clients/client-sheet.tsx` | VERIFIED | preferred_language Select field present |
| `lib/actions/settings.ts` | VERIFIED | default_estimate_language persisted to companies table |
| `lib/actions/client.ts` | VERIFIED | preferred_language persisted to clients table |
| `components/pdf/estimate-pdf.tsx` | VERIFIED | PDF_LABELS, LANG_INDICATOR, CURRENCY_CODE, locale-aware formatters all present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `language-step.tsx` | `lib/i18n/language-context.tsx` | `useLanguage().setLanguage()` | WIRED | Line 22: `const { setLanguage } = useLanguage()`; line 28: `setLanguage(lang)` |
| `lib/actions/company.ts` | `companies.default_estimate_language` | DB update/insert row | WIRED | Line 63: `default_estimate_language:` in row object |
| `app/api/generate-estimate/route.ts` | `EstimateGeneratePayload` | `inngest.send()` payload | WIRED | Line 93: payload includes language |
| `lib/inngest/functions/generate-estimate.ts` | `lib/services/generate-estimate.ts` | `generateEstimateForProject(companyId, projectId, { language })` | WIRED | Lines 32-33: passes language option |
| `estimate-tab.tsx` | `lib/i18n/resolve-estimate-language.ts` | `resolveEstimateLanguageWithSource()` | WIRED | Lines 31-32: import; lines 59-61: call with `{ userAppLanguage: appLanguage as EstimateLanguage }`; line 62: `useState(cascadeResult.language)` |
| `estimate-tab.tsx` | `EstimateLanguageSelector` | `hint={CASCADE_HINT[cascadeResult.source]}` | WIRED | Lines 64-68: CASCADE_HINT map defined; line 202: hint prop passed |
| `estimate-tab.tsx` | `app/api/generate-estimate` | `fetch body.language` | WIRED | Line 111: `language: estimateLanguage` in fetch body |
| `estimate-view.tsx` | `estimates.language` | `estimate.language` prop | WIRED | Line 184: `<LanguageFlagChip lang={estimate.language} />` |
| `company-info-form.tsx` | `companies.default_estimate_language` | `updateCompanySettings` action | WIRED | settings.ts line 82 persists the value |
| `client-sheet.tsx` | `clients.preferred_language` | `updateClientAction` | WIRED | client.ts line 41 persists the value |
| `estimate-pdf.tsx` | `estimates.language` | `EstimatePDFProps.language` → PDF_LABELS | WIRED | All 3 PDF render sites (pdf/route.ts, send/route.ts, pdf-delivery.ts) pass estimate.language |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `language-step.tsx` | `value` prop (EstimateLanguage) | react-hook-form via survey-shell.tsx, persisted to `companies.default_estimate_language` via createOrUpdateCompany | Yes — DB write confirmed in company.ts | FLOWING |
| `estimate-tab.tsx` | `estimateLanguage` state | `resolveEstimateLanguageWithSource({ userAppLanguage: appLanguage })` → `cascadeResult.language`; forwarded to `/api/generate-estimate` body | Yes — resolver called with real LanguageContext value; API call wired | FLOWING |
| `estimate-tab.tsx` | `hint` prop | `CASCADE_HINT[cascadeResult.source]` — keyed on `cascadeResult.source` from the same resolver call | Yes — dynamic lookup from resolver output, not hardcoded | FLOWING |
| `estimate-view.tsx` LanguageFlagChip | `estimate.language` | `ShareEstimateData.estimate` extends `EstimateWithSections` which has `language` field; query uses `select('*')` | Yes — DB column exists (Phase 52), included in wildcard select | FLOWING |
| `company-info-form.tsx` | `defaultEstimateLanguage` | Populated from `company.default_estimate_language` in useForm defaultValues; persisted via updateCompanySettings | Yes — real DB read/write | FLOWING |
| `estimate-pdf.tsx` | `language` prop | Passed from all 3 PDF render sites: pdf/route.ts, send/route.ts, pdf-delivery.ts — each reads `estimate.language` from DB and passes via isSupportedLanguage guard | Yes — real DB column value drives labels and formatting | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — verification requires running the app server (Next.js + Supabase + Inngest). All checks involve UI rendering or DB writes. Deferred to human verification.

### Requirements Coverage

The requirement IDs LANG-ONBOARD-01 through LANG-ONBOARD-06 declared in the plan frontmatter are **NOT present in `.planning/REQUIREMENTS.md`**. The REQUIREMENTS.md file covers the v3.1.1 milestone (IDs: INNGEST-*, STORAGE-*, HETZNER-*, UAT-*, FIX-*, PERF-*, REDESIGN-*, CONNECT-*). Phase 73 appears to be a new feature phase added after the v3.1.1 milestone requirements were frozen.

**Assessment:** The LANG-ONBOARD-* IDs appear to be phase-local requirement identifiers declared in the plan files themselves, not tracked in the milestone REQUIREMENTS.md. This is an **ORPHANED** pattern — the IDs are used in plans but have no backing definition in REQUIREMENTS.md.

| Requirement | Source Plan | Description (from plan context) | Status | Evidence |
|-------------|------------|--------------------------------|--------|---------|
| LANG-ONBOARD-01 | 73-01 | Language step in onboarding survey | SATISFIED | LanguageStep component at survey position 5, setLanguage() called, default_estimate_language persisted |
| LANG-ONBOARD-02 | 73-02 | Language param wired through API + Inngest pipeline | SATISFIED | EstimateGeneratePayload.language, route validation, worker forwarding all confirmed |
| LANG-ONBOARD-03 | 73-03 | Language dropdown with cascade resolver + hint in estimate generation UI | SATISFIED | resolveEstimateLanguageWithSource() called; CASCADE_HINT defined and passed as hint prop; estimateLanguage initialized from cascadeResult.language |
| LANG-ONBOARD-04 | 73-04 | Flag chips in estimate share view and Send tab preview | SATISFIED | LanguageFlagChip in both estimate-view.tsx and estimate-preview.tsx |
| LANG-ONBOARD-05 | 73-04 | Language selectors in Company Settings and Client form | SATISFIED | defaultEstimateLanguage Select + preferred_language Select, both persisting to DB |
| LANG-ONBOARD-06 | 73-05 | PDF i18n: static labels, locale-aware formatting, language indicator | SATISFIED | PDF_LABELS, LANG_INDICATOR, CURRENCY_CODE, locale-aware formatCurrency + formatDate all present |

**ORPHANED IDs:** LANG-ONBOARD-01 through LANG-ONBOARD-06 — not defined in `.planning/REQUIREMENTS.md`. Phase 73 goal is documented in ROADMAP.md but the phase spec section and requirement IDs do not appear in REQUIREMENTS.md traceability table.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | No TODO/FIXME/placeholder patterns found in modified files | — | — |
| None | — | No empty return values or stub handlers found in modified files | — | — |

The previous anti-pattern (inline cascade ternary in estimate-tab.tsx) has been resolved: the inline `appLanguage === 'pt' || appLanguage === 'es' ? appLanguage : 'en'` expression is gone; `resolveEstimateLanguageWithSource()` is now the sole source of the initial estimate language.

### Human Verification Required

#### 1. Language Step Visual + Instant Preview

**Test:** Create a new account, start onboarding. After the Industry step, verify that a Language step appears with 3 rows (US/English, BR/Português, ES/Español), each with its country flag. Select Português (BR).
**Expected:** Dashboard language switches immediately to Portuguese without leaving the wizard (LanguageContext setLanguage side-effect).
**Why human:** Visual rendering, LanguageContext runtime effect, and survey step ordering require a live browser.

#### 2. Company Settings Language Persists

**Test:** Go to Settings → Company Info. Find "Default estimate language" selector. Select Português and save.
**Expected:** Page reloads and selector shows Português selected (not blank). Check Supabase `companies` table: `default_estimate_language = 'pt'`.
**Why human:** Requires DB write verification + reload cycle.

#### 3. Client Preferred Language Persists

**Test:** Open a client, find "Preferred estimate language" field. Select Español and save.
**Expected:** Field shows Español on next open. Check `clients.preferred_language = 'es'` in DB.
**Why human:** Requires DB write verification + reload cycle.

#### 4. Flag Chip on Share Page

**Test:** Generate an estimate with language set to Português. Open the share link `/estimate/[token]`.
**Expected:** A flag chip showing the Brazilian flag (or "PT" label) is visible in the estimate header area.
**Why human:** Requires a real estimate with `language='pt'` in the DB and visual browser check.

#### 5. PDF i18n Labels and Language Indicator

**Test:** Generate estimate with language='pt'. Download or view the PDF.
**Expected:** PDF shows "Orçamento" (not "Estimate"), "Resumo" (not "Summary"), "Total" section labels in Portuguese, a "PT" text chip in the header, and currency formatted with pt-BR locale (R$ symbol for BRL).
**Why human:** Requires end-to-end estimate generation, PDF render, and visual inspection of the PDF output.

#### 6. Cascade Hint Visible Below Language Dropdown

**Test:** Switch app language to Português (BR) via the top bar toggle. Navigate to a project's Estimate tab with no estimate yet.
**Expected:** The "Estimate language" dropdown pre-selects "Portuguese (Brazil)" automatically AND a hint text appears below the selector (e.g. "Defaulted from your app language" translated to Portuguese).
**Why human:** Requires live app with LanguageContext state + UI rendering to confirm hint text is visible and correctly translated.

### Gaps Summary

No gaps remain. Both previously identified gaps are now closed:

1. `resolveEstimateLanguageWithSource()` is imported from `@/lib/i18n/resolve-estimate-language` and called on lines 59–61 of `estimate-tab.tsx` with `{ userAppLanguage: appLanguage as EstimateLanguage }`. The returned `cascadeResult.language` seeds the `estimateLanguage` state via `useState`.

2. `CASCADE_HINT` is defined as a `Partial<Record<typeof cascadeResult.source, string>>` mapping all three cascade sources (`user`, `company`, `client`) to translated hint strings. It is passed as `hint={CASCADE_HINT[cascadeResult.source]}` to `EstimateLanguageSelector` on line 202.

All 17/17 truths are verified with real code evidence. The phase goal is fully achieved in code. Remaining items are human-only runtime/visual checks.

---

_Verified: 2026-05-19T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
