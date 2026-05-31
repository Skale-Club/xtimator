# Estimate Profile & Company Defaults — canonical field map

This document is the locked output of the **Estimate Profile & Company Defaults**
project (R1 audit → R3 spec-lock). It records which fields are company-level
defaults, which are per-estimate, and how inheritance actually works today.

The machine-readable source of truth is
[`lib/estimate/profile-field-map.ts`](../lib/estimate/profile-field-map.ts).
Keep the two in sync.

> Grounding rule: do not invent defaults. Every claim below is backed by the
> migrations, `lib/actions/estimate.ts`, `lib/services/generate-estimate.ts`,
> and `lib/i18n/resolve-estimate-language.ts`.

## Categories

- **default-with-override** — a `companies` default that pre-fills a per-estimate
  column at creation. The estimate stores its own copy, so editing the company
  default never mutates existing estimates, and each estimate may diverge. The
  live editable document surfaces this with an override-vs-default indicator and
  a one-click "reset to default".
- **profile-only** — company configuration that affects rendering or business
  logic but is never written onto an estimate row.
- **per-estimate-only** — an `estimates` column with no company-level default.

## Default-with-override

| Concept | `companies` column | `estimates` column | Inherited | Notes |
|---|---|---|---|---|
| Tax rate | `default_tax_rate` | `tax_rate` | ✅ | NUMERIC(5,4). Copied at creation in both paths. Override indicator + reset wired. |
| Payment terms | `default_payment_terms` | `payment_terms` | ✅ | Copied at creation; AI may emit its own then fall back to default. Override indicator + reset wired. |
| Warranty terms | `default_warranty_terms` | `warranty_terms` | ✅ | Same behavior as payment terms. Override indicator + reset wired. |
| Currency | `currency_code` | `currency_code` | ✅ | Copied (normalized) at creation. Stored per estimate so history stays stable; not exposed as a per-estimate override in the document UI. |
| Language | `default_estimate_language` | `language` | ✅ | `estimates.language` is `NOT NULL DEFAULT 'en'`. Resolved via a cascade rather than a direct copy (see below). Edited in the company settings form, not the Estimate Defaults tab. |

## Profile-only

| Concept | `companies` column | Notes |
|---|---|---|
| Validity days | `default_validity_days` | **Orphaned.** Column exists (`INTEGER DEFAULT 30`) and is editable in the Estimate Defaults form, but no `estimates.valid_until`/validity column exists and no code reads it. Currently has no downstream effect. |
| Cover-letter templates | `estimate_template_greeting` / `_opener` / `_closer` / `_signature` | Applied at render time; not stored on the estimate row. |
| Estimate terms | `estimate_terms_text` (gated by `estimate_terms_enabled`) | Rendered from the profile at view/PDF time. |
| Delivery / signature toggles | `digital_signature_enabled`, `email_delivery_enabled`, `sms_delivery_enabled` | Control send/sign flows, not estimate columns. |

## Per-estimate-only

`estimate_date`, `estimate_number`, `estimate_seq` (system-assigned by the
`set_estimate_seq` trigger), `summary`, `notes`, `timeline`,
`discount_type` / `discount_value`, `status`, `workflow_status`.

## How inheritance fires at creation

Both creation paths copy the same three terms/financial defaults onto the new
estimate row, plus currency:

- **Blank draft** — `lib/actions/estimate.ts` (`createBlankEstimate`): reads
  `default_tax_rate`, `default_payment_terms`, `default_warranty_terms` and
  `currency_code`, writes them to `tax_rate`, `payment_terms`, `warranty_terms`,
  `currency_code`.
- **AI-generated** — `lib/services/generate-estimate.ts`
  (`generateEstimateForProject`): reads the same company defaults; the AI output
  may supply `payment_terms` / `warranty_terms`, otherwise the company default is
  used (`aiEstimate.x ?? company.default_x ?? null`).

Because values are **copied** (not referenced), changing a company default only
affects estimates created afterward — existing estimates are untouched.

## Language cascade

`lib/i18n/resolve-estimate-language.ts` resolves the estimate language as:

```
estimate override → client.preferred_language → company.default_estimate_language → user app language → 'en'
```

So the company default participates in the cascade but does not directly populate
`estimates.language`.

## Known gaps (carried forward, not fixed here)

- `default_validity_days` is orphaned — either wire a `valid_until` derivation at
  creation or remove the unused control.
- `default_payment_terms` / `default_warranty_terms` are passed to the AI provider
  interface (`EstimateInput`) but are not embedded into the prompt text by
  `lib/ai/prompt-builder.ts`; they only take effect via the post-generation
  fallback. Embedding them would let the model tailor terms to the company voice.
