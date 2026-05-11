---
id: SEED-016
status: harvested
planted: 2026-05-10
planted_during: v2.0 WhatsApp Estimate Channel (launch readiness analysis)
harvested: 2026-05-11
harvested_in: v2.1 Phase 52 (Per-Estimate Language Selection)
harvest_completeness: Backend complete (schema + resolver + AI prompt + service layer + WhatsApp formatter + auto-learn). Deferred: web UI dropdown, EstimatePDF i18n, /api/generate-estimate body parameter
trigger_when: When planning the WhatsApp launch-readiness milestone, when adding the first non-English-speaking customer cohort, when a user complains that their estimate goes out in the wrong language, or when expanding into LatAm / Brazilian markets
scope: Medium
---

# SEED-016: Per-Estimate Language Selection

## Why This Matters

Xtimator's UI is already trilingual (EN, PT-BR, ES) via SEED-001. But **estimates themselves are always rendered in English**, regardless of the user's language preference. This is a hard wall for any user serving non-English-speaking clients — or any non-English-speaking user serving English clients.

The realistic scenario that breaks today:

```
[Brazilian contractor's app]
   App language: PT-BR ✓
   Daily work: Portuguese UI ✓

[Job for an American client]
   Generate estimate → ALWAYS in English (no choice)

[Client receives estimate]
   ❌ Brazilian contractor receives a PT-BR-translated UI but
      the estimate PDF says "Summary / Notes / Total" in English
      — and they have no way to send a PT-BR estimate to a
      Brazilian client either.
```

The same wall hits a US contractor with Hispanic clients, or a Spanish-speaking user serving anyone. The current workaround — toggle app language, regenerate, toggle back — is brittle and unobvious. Most users won't discover it.

If Xtimator wants to nail multilingual markets at launch (BR + US + LatAm), this is **launch-blocking**.

## Design Principle: English-First

**Xtimator is an English-first product.** Portuguese and Spanish are **additive layers**, not equals. This principle drives concrete decisions throughout the seed:

- **Source of truth is English.** AI prompts are written in English. The base codebase strings are English. The translation system (`/api/translate`) translates *from* English *to* PT/ES — not between them.
- **English is always a safe default.** Any null/missing/error path resolves to English. No user is ever locked out by an i18n failure.
- **Schema defaults to 'en'.** `estimates.language` defaults to `'en'`. `companies.default_estimate_language` and `clients.preferred_language` are nullable (null = no preference, fall through cascade), but the final fallback is always `'en'`.
- **PT and ES are opt-in.** A user has to actively select a non-English language. The product never auto-detects browser locale and forces a non-English experience.
- **Quality bar: English is "production", PT/ES are "production-but-AI-translated".** English copy is hand-written/curated. PT/ES copy is AI-generated with caching, with graceful degradation back to English on AI failure.

This is the inverse of what some i18n-first products do (where the source might be in the developer's language and English is just another translation). For Xtimator, English isn't a translation — it's the base.

## The Scenario in Detail

```
┌──────────────────────────────────────────────────────────┐
│  Estimate Wizard / Generation Modal                      │
│                                                          │
│  Project: Maria's Apartment Cleaning                     │
│  Client:  Maria Silva                                    │
│                                                          │
│  Generate estimate in: [Portuguese (BR) ▼]              │
│                       ├─ English                        │
│                       ├─ Portuguese (BR)  ← default     │
│                       └─ Spanish                        │
│                                                          │
│  [Generate]                                              │
└──────────────────────────────────────────────────────────┘
```

The default value resolves by cascade (see below). The user can always override before generating.

## Resolution Cascade

When generating an estimate, the target language is resolved in this order (English-first: every layer can opt OUT of English by being explicit, but English is the guaranteed terminal):

```
1. Explicit override from generation UI (per-estimate)
       ↓ if not set
2. Client's preferred_language (if known from previous estimate)
       ↓ if not set
3. Company's default_estimate_language (company-level config, opt-in)
       ↓ if not set
4. User's app language IF explicitly set to non-English (localStorage value)
       ↓ otherwise
5. Final fallback: 'en' (English is always the safe default)
```

Note layer 4: it only kicks in if the user *explicitly* toggled to PT or ES. If their app is in English (the default), the cascade simply lands on 'en' at layer 5. This preserves the English-first principle — the system never assumes non-English silently.

This means:
- A new Brazilian user who toggled their UI to PT-BR gets PT-BR auto-suggested (because they made an explicit choice)
- A US contractor's first-time client gets EN by default; if they manually generate in Spanish once, that's remembered for next time
- Company can set "all estimates default to Spanish" if they only serve Hispanic clients — but it's a deliberate config, never auto-detected

## Database Schema

```sql
-- Per-estimate (immutable once generated)
ALTER TABLE estimates
  ADD COLUMN language TEXT NOT NULL DEFAULT 'en'
  CHECK (language IN ('en', 'pt', 'es'));

-- Per-client (mutable, auto-learned from estimate history)
ALTER TABLE clients
  ADD COLUMN preferred_language TEXT
  CHECK (preferred_language IS NULL OR preferred_language IN ('en', 'pt', 'es'));

-- Per-company default (admin/owner setting)
ALTER TABLE companies
  ADD COLUMN default_estimate_language TEXT
  CHECK (default_estimate_language IS NULL OR default_estimate_language IN ('en', 'pt', 'es'));
```

Null-defaults on `clients` and `companies` are intentional — null means "no preference, fall through to next layer". Only `estimates.language` is mandatory (every estimate has been rendered in *some* language).

## API Changes

### Generate endpoint accepts language

```typescript
// POST /api/generate-estimate
{
  projectId: string
  language?: 'en' | 'pt' | 'es'  // optional, resolves via cascade if omitted
}
```

### Service layer threads language through

```typescript
// lib/services/generate-estimate.ts
async function generateEstimateForProject(
  companyId: string,
  projectId: string,
  language: 'en' | 'pt' | 'es' = 'en'  // ← new param
): Promise<{ estimateId: string }>
```

### AI prompt parameterized

The Claude prompt in `generate-estimate` currently hardcodes English voice. It needs a `targetLanguage` parameter and instructions like:

```
Generate the estimate in {targetLanguage}.
- Section titles, item descriptions, timeline, payment terms — all in {targetLanguage}.
- Currency formatting per locale ($X,XXX for en/es, R$ X.XXX,XX for pt).
- Date formatting per locale (MM/DD/YYYY for en, DD/MM/YYYY for pt/es).
```

### WhatsApp formatter respects estimate language

`lib/whatsapp/formatter.ts` currently uses hardcoded English strings ("Hi {clientName}", "Subtotal", "Total"). These need translation per estimate language.

## UI Surface

### Generation Modal (Web)
- Dropdown "Generate in:" with cascade-resolved default
- Visible label of resolved source: "Defaulted to Portuguese (from your app language)"

### WhatsApp Flow
- Confirmation message to owner ("Here's your estimate for…") uses **owner's app language** (independent of estimate language) — owner sees PT-BR confirmation but knows the estimate is in EN
- Client-facing message (via WhatsApp delivery) uses **estimate language**

### Client Settings
- New form section in `/clients/[id]/edit`: "Preferred language for estimates"
- Auto-populated from first estimate sent to that client

### Company Settings
- New field in `/settings/company`: "Default language for new estimates"
- Optional — null means "follow user's app language"

### PDF Renderer
- `EstimatePDF` component wrapped with language context
- All static labels (Summary, Notes, Timeline, Payment Terms, Total, etc.) use `t()`
- Currency + date formatting via `Intl` with appropriate locale

## Scope Estimate

**Medium** — 1 phase, ~3-4 days:

1. **Schema migration** — `language` on estimates, `preferred_language` on clients, `default_estimate_language` on companies. RLS unchanged (same as parent tables).

2. **Resolution helper** — `lib/i18n/resolve-estimate-language.ts` implementing the 5-step cascade. Single source of truth used by both web flow and WhatsApp flow.

3. **AI prompt parameterization** — refactor `lib/services/generate-estimate.ts` to accept language param and pass to Claude prompt. Update prompt template to instruct AI on locale-specific formatting.

4. **EstimatePDF i18n** — wrap `components/pdf/estimate-pdf.tsx` to accept language prop. Translate static labels. Locale-aware Intl formatting for currency/dates.

5. **Web UI** — add language dropdown to estimate generation modal. Show resolved-from-cascade hint. Update client edit form. Update company settings.

6. **WhatsApp formatter** — `lib/whatsapp/formatter.ts` accepts language, uses translation dictionary for labels. Pre-translated strings in `lib/i18n/translations.ts` for the small set of formatter labels (greeting, totals, sections, etc.).

7. **Auto-learn client preference** — after sending an estimate, if `clients.preferred_language` is null, set it to the estimate's language. Cheap UX win — second estimate auto-suggests correctly.

8. **Tests** — cascade resolver edge cases, AI prompt outputs valid target language, PDF renders in correct language, WhatsApp formatter outputs correct language.

## Breadcrumbs

**Schema:**
- `supabase/migrations/20260409000001_initial_schema.sql` — initial `estimates` / `clients` / `companies` tables
- `supabase/migrations/20260424000001_add_translations_table.sql` — existing i18n cache table (no changes needed)
- New migration: `20260512000001_estimate_language.sql`

**Service layer:**
- `lib/services/generate-estimate.ts` — `generateEstimateForProject()` adds language param
- `app/api/generate-estimate/route.ts` — request body accepts `language`
- `lib/i18n/resolve-estimate-language.ts` — new cascade helper

**AI integration:**
- `lib/ai/providers/anthropic.ts` (or wherever the estimate prompt lives) — parameterize prompt by language
- Existing translation infrastructure (`/api/translate`) can be reused if AI returns mixed-language fragments

**UI:**
- `components/estimate/generate-estimate-modal.tsx` (or similar) — add language dropdown
- `components/pdf/estimate-pdf.tsx` — wrap with translation context, replace hardcoded strings
- `components/clients/client-form.tsx` — add preferred_language field
- `components/settings/company-info-form.tsx` — add default_estimate_language field

**WhatsApp:**
- `lib/whatsapp/formatter.ts:formatEstimateForWhatsApp` — accept language, translate labels
- `lib/whatsapp/confirm.ts:handleSend` — pass estimate.language to formatter

**i18n infrastructure:**
- `lib/i18n/translations.ts` — add formatter-specific keys (greetings, totals, etc.)
- `lib/i18n/language-context.tsx` — existing pattern; estimate language is independent of context but uses the same type

## Notes

- **Why not also support more languages?** EN/PT/ES covers ~95% of Americas service businesses. French/German/etc. are out of scope. Schema check constraint enforces this — adding a language later is a 1-line migration.
- **Why per-estimate, not per-project?** A single project may need multiple estimates (revisions, client changes mind). Language belongs at the estimate level for immutability.
- **AI quality risk:** Claude generates Spanish/Portuguese estimates fine, but currency/locale conventions need explicit instruction. Test with real-world examples before launch.
- **Translation drift:** The AI may sometimes mix languages (e.g., section title in PT but item description in EN). Test for this and consider a post-generation sanity check ("does output match target language?").
- **WhatsApp message language is a UX subtle:** the owner sends a message in *their* language, but the estimate goes out in the *estimate's* language. Confirmation flow: owner reads PT confirmation ("Aqui está seu orçamento…"), confirms with `send`, client receives EN estimate. This is correct behavior but counter-intuitive — document well.
- **Connection with SEED-008 (WhatsApp harvested):** the harvested WhatsApp MVP renders confirmation in English regardless. This needs to be reverse-fixed in v2.1 to respect estimate language.
- **Connection with SEED-010 (debounce):** debounced multi-message input doesn't change language semantics — once language is decided per estimate, all aggregated messages produce that single estimate in that single language.
- **Connection with SEED-013 (subscription tiers):** none. Language is a baseline feature, not a paid one.
- **Currency strategy:** USD remains the system currency. The *display* of currency is locale-aware ("$1,500" vs "$ 1.500,00" vs "R$ 1.500,00") but the underlying amount stays in dollars. Multi-currency pricing is out of scope for this seed (separate concern).
- **Default for new accounts:** `companies.default_estimate_language` starts as NULL (cascade falls through). The system never pre-fills it from browser locale or signup hints — the user must explicitly opt into non-English. This respects the English-first principle: a US-based user signing up never accidentally generates Portuguese estimates because their browser said `pt-BR`.
- **AI translation reliability:** Claude translates ad-hoc strings via `/api/translate` reliably. Generating entire estimates in non-English is a heavier ask — needs prompt engineering, locale-aware formatting, and QA. If AI generation in PT/ES proves unreliable in testing, fallback strategy: generate in EN, then translate the final output via the existing `/api/translate` pipeline. Slower but safer. Decide during execute-phase based on AI output quality.
