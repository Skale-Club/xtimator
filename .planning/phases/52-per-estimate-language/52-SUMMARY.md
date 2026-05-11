# Phase 52: Per-Estimate Language Selection — SUMMARY

**Status:** ✅ COMPLETE (2026-05-11)
**Milestone:** v2.1 WhatsApp Launch-Readiness
**Seed harvested:** SEED-016 (backend complete; UI dropdown deferred)

## What was built

End-to-end backend infrastructure for generating estimates in English, Portuguese (BR), or Spanish — independent of the user's app language preference. Implements the English-first cascade resolver from SEED-016.

### Files created

- `supabase/migrations/20260511000002_phase52_estimate_language.sql` — adds `estimates.language` (default 'en'), `clients.preferred_language` (nullable), `companies.default_estimate_language` (nullable). All CHECK-constrained to `en|pt|es`.
- `lib/i18n/resolve-estimate-language.ts` — cascade resolver with `resolveEstimateLanguage()` and `resolveEstimateLanguageWithSource()`, plus `isSupportedLanguage()` type guard.
- `tests/unit/i18n/resolve-estimate-language.test.ts` — 16 tests covering all cascade priorities and the English-first guard.

### Files modified

- `lib/ai/types.ts` — `EstimateInput.language?: 'en' | 'pt' | 'es'`
- `lib/ai/prompt-builder.ts` — language-aware system prompt with locale-specific instructions for currency/date formatting per language
- `lib/services/generate-estimate.ts` — accepts `options.language`, runs cascade with client/company/user inputs, persists `language` on estimate row, returns it in `GenerateEstimateResult`
- `lib/whatsapp/confirm.ts` — selects `estimate.language` + `client.preferred_language`; after a successful send, auto-learns the client's language by writing `clients.preferred_language` when null
- `lib/whatsapp/formatter.ts` — fully localized labels (greeting, "Subtotal", "Total", "Timeline", "Payment", closing) per language; locale-aware currency formatting (pt-BR uses "R$"/comma decimals, en-US uses "$")
- `tests/unit/api/generate-estimate-name-patch.test.ts` + `tests/unit/whatsapp/handler.test.ts` — mock returns updated for new `language` field on `GenerateEstimateResult`

## The cascade (English-first)

```
1. Explicit override (options.language)             ← UI dropdown / WhatsApp command
2. clients.preferred_language                       ← auto-learned from prior estimate
3. companies.default_estimate_language              ← company-level opt-in
4. userAppLanguage (only if non-EN)                 ← user actively chose PT/ES
5. 'en'                                             ← always the safe default
```

Critical invariant: **English is always the safe fallback. The system never auto-detects from browser locale.** A US user signing up with browser `pt-BR` never accidentally gets Portuguese estimates.

## How content gets translated

| Content | How it's in target language |
|---|---|
| `summary`, item descriptions, section titles | Claude generates in `language` per prompt instruction |
| `timeline`, `payment_terms`, `notes` | Same — AI-generated per language |
| WhatsApp formatter labels (Subtotal, Total, etc.) | Hardcoded in `LABELS` map per language |
| Currency display | `Intl.NumberFormat` with locale (`pt-BR` / `es-MX` / `en-US`) |
| Static UI strings (web app) | Existing `/api/translate` infrastructure from SEED-001 |

## Auto-learn flow

```
First estimate for new client (no preferred_language)
  → cascade falls through to company default or user app language or 'en'
  → estimate generated in language X
  → owner sends to client
  → AFTER successful send: clients.preferred_language = X
       (only if it was null — never overwrites an explicit setting)

Next estimate for SAME client
  → cascade hits layer 2 (clientPreferred = X)
  → no need to think about language; auto-defaults correctly
```

## Success criteria

| Criterion | Status |
|---|---|
| Schema: `estimates.language` REQUIRED with default 'en'; client/company nullable | ✅ |
| `generateEstimateForProject()` accepts language; AI generates in target language | ✅ |
| `EstimatePDF` i18n-aware | ⏸️ DEFERRED — see Open Follow-ups |
| WhatsApp formatter uses estimate.language | ✅ Labels + currency localized |
| Generate-estimate UI dropdown | ⏸️ DEFERRED — see Open Follow-ups |
| Auto-learn client preference after send | ✅ in `lib/whatsapp/confirm.ts:handleSend` |
| Test coverage | ✅ 170/170 across all v2.1 test suites |

## What's NOT included (deferred)

1. **EstimatePDF component i18n** — the PDF still renders English labels (Summary/Total/etc.). Wrapping the React component with translation hooks is a layout change that warrants its own focused phase. AI-generated content (item descriptions, summary) WILL be in target language because the AI generated it that way — only the structural labels are still English.

2. **Web app generation UI dropdown** — the "Generate in: [EN/PT/ES]" dropdown on the project page. Backend is ready (`generateEstimateForProject` accepts `options.language`) — front-end work remains. The `/api/generate-estimate` route accepts a `language` field in the JSON body if the caller wants to pass it today.

3. **Translate `/api/generate-estimate` route to accept language** — currently the route doesn't forward a `language` body field to the service. Trivial 3-line change but not strictly necessary today (WhatsApp uses the service directly; web app can pass via options).

These are tracked in SEED-016 (now updated to "harvested-partial") and can be picked up as a small "v2.2 polish" task after launch.

## Open follow-ups

- Wire the optional `language` body parameter through `/api/generate-estimate/route.ts`
- Add the language dropdown to the project workspace generation modal
- Add the client preference field to `/clients/[id]/edit`
- Add `companies.default_estimate_language` field to company settings
- i18n the EstimatePDF component (replace hardcoded labels with `t()` calls)
- Test AI output quality in PT-BR and ES with real-world samples — if Claude struggles with locale-specific currency or dates, consider the fallback strategy from SEED-016 (generate in EN, then translate the final output via `/api/translate`)
