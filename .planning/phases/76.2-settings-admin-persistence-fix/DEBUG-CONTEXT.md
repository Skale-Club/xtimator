# Phase 76.2 — Debug Context

**Entry point:** `/gsd:debug`
**Symptom:** Fields in settings and admin pages don't persist after save + refresh.

---

## Root Cause (Pre-diagnosed)

3 migrations were merged into the repo but **never applied to the Supabase project**. The code writes these columns, Postgres rejects them silently, and the UI shows no error.

### Missing migrations (apply in order):

| File | Adds to `companies` |
|------|---------------------|
| `supabase/migrations/20260519000002_digital_signature_and_estimate_terms.sql` | `digital_signature_enabled` BOOL, `estimate_terms_enabled` BOOL, `estimate_terms_text` TEXT |
| `supabase/migrations/20260519000003_estimate_deliveries.sql` | `email_delivery_enabled` BOOL, `sms_delivery_enabled` BOOL |
| `supabase/migrations/20260520000001_companies_ai_model_override.sql` | `ai_model_override` TEXT |

### `database.types.ts` not regenerated

All 6 columns above are absent from `Database['public']['Tables']['companies']['Row']` in `types/database.types.ts`. Must regenerate after applying migrations.

---

## Affected Pages + Actions

| Page | Server Action | Broken columns |
|------|--------------|----------------|
| `/settings/delivery` | `updateDeliverySettings()` in `lib/actions/settings.ts` | `email_delivery_enabled`, `sms_delivery_enabled`, `digital_signature_enabled` |
| `/settings/estimate-templates` | `updateEstimateTerms()` in `lib/actions/settings.ts` | `estimate_terms_enabled`, `estimate_terms_text` |
| `/admin/companies/[id]` | `setCompanyModelOverride()` in `app/admin/companies/actions.ts` | `ai_model_override` |

---

## Debug Checklist

- [ ] Verify migrations NOT yet applied: `SELECT column_name FROM information_schema.columns WHERE table_name = 'companies' AND column_name IN ('digital_signature_enabled','email_delivery_enabled','ai_model_override')`
- [ ] Apply migration 20260519000002 (digital_signature + estimate_terms)
- [ ] Apply migration 20260519000003 (email_delivery + sms_delivery)
- [ ] Apply migration 20260520000001 (ai_model_override)
- [ ] Verify columns now exist in DB
- [ ] Regenerate `types/database.types.ts` via Supabase MCP (`generate_typescript_types`)
- [ ] Fix TypeScript errors in `lib/actions/settings.ts` and `app/admin/companies/actions.ts`
- [ ] Fix TypeScript errors in affected form components (`delivery-settings-form.tsx`, `estimate-terms-form.tsx`)
- [ ] Harden error visibility: `updateDeliverySettings`, `updateEstimateTerms`, `setCompanyModelOverride` must log + return `{ ok: false, error }` on DB failure
- [ ] Manual verify `/settings/delivery`: toggle switches → save → refresh → values persisted
- [ ] Manual verify `/settings/estimate-templates`: fill terms → save → refresh → values persisted
- [ ] Manual verify `/admin/companies/[id]`: set model override → save → refresh → value persisted
- [ ] Run `npx tsc --noEmit` → exits 0

---

## How migrations are applied in this project

Due to Supabase pooler conflict with `supabase db push`, migrations are applied via Node/pg script:

```bash
node scripts/apply-migration-76-01.mjs
```

See `scripts/apply-migration-76-01.mjs` for the pattern — replicate for each of the 3 new migrations, or apply SQL directly via the Supabase MCP `execute_sql` tool.
