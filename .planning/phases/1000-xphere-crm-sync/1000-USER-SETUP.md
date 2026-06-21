# Phase 1000: User Setup Required

**Generated:** 2026-06-20
**Phase:** 1000-xphere-crm-sync
**Status:** Incomplete

Complete these items for the Xphere CRM mirror to function. Claude automated everything possible in code (provider registration, config reader, admin save/test surface); these items require human access to the Xphere deployment and its admin dashboard.

The integration is **disabled-by-default** — `getXphereConfig()` returns null until BOTH the API key and base URL are configured, so the sync job in Plan 03 safely no-ops while these items are pending.

## Environment Variables

You can configure these EITHER via env vars (local dev) OR via the admin panel at `/admin/integrations/crm` (staging/prod — preferred). Never paste a real `xph_…` token into git/docs.

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `XPHERE_API_KEY` | Xphere → the Xtimator org → Settings → API Keys (scope `sync:write`). An `xph_…` token. | `.env.local` (local) or admin panel (staging/prod) |
| [ ] | `XPHERE_BASE_URL` | Base origin of the Xphere deployment, e.g. `https://app.xphere.example` (no trailing path) | `.env.local` (local) or admin panel base-URL field |

## Dashboard Configuration

- [ ] **Save credentials via the admin panel** (recommended for staging/prod)
  - Location: `/admin/integrations/crm` (the new "CRM" category)
  - Paste the `xph_…` API key into the Xphere integration card and save
  - Enter the base URL (e.g. `https://app.xphere.example`) in the "Xphere Base URL" field and save
  - Use the card's Test button to confirm both resolve (it reports the base URL + key last-4 without echoing the full key)

- [ ] **Create the "Xtimator Lifecycle" pipeline** (Phase A — manual, prerequisite for opportunity sync in Plan 03)
  - Location: Xphere → Xtimator org → Pipelines
  - Stages (names must match EXACTLY, including the em dash "—"): `Trial`, `Active — Pro`, `Active — Business`, `Churned`

## Verification

After completing setup:

```bash
# Local dev: confirm env vars are set (values stay out of the shell history)
grep -c XPHERE_ .env.local

# Confirm the CRM admin category renders the Xphere card + base-URL form
# Visit /admin/integrations/crm and use the Test button
```

Expected results:
- `/admin/integrations/crm` shows the Xphere integration card and the "Xphere Base URL" form.
- The Test button reports `Configured. Base URL <url> set; key ends …XXXX.` once both are saved.
- With either value missing, `getXphereConfig()` returns null and the Test button reports "Set both the API key and base URL."

---

**Once all items complete:** Mark status as "Complete" at top of file.
