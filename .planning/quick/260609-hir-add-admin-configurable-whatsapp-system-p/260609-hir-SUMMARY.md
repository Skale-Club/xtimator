---
phase: quick-260609-hir
plan: 01
subsystem: ai-estimate-generation / admin-integrations
tags: [whatsapp, system-prompt, platform-config, admin, prompt-builder]
requires:
  - lib/platform-config.ts (createServiceClient, invalidatePlatformConfig)
  - lib/ai/prompt-builder.ts (buildSystemPrompt)
  - lib/services/generate-estimate.ts (generateEstimateForProject)
  - app/admin/integrations/actions.ts (requireAdmin, logAdminAction)
provides:
  - getWhatsAppSystemPrompt() reader (platform-wide WhatsApp prompt addendum)
  - EstimateInput.extraInstructions field
  - GenerateEstimateOptions.channel 'whatsapp' flag
  - saveWhatsAppSystemPrompt server action
  - WhatsAppSystemPromptForm admin UI
affects:
  - WhatsApp-channel estimate generation (now appends admin addendum before Security)
tech-stack:
  added: []
  patterns:
    - "Channel-gated prompt augmentation (only fetched when channel === 'whatsapp')"
    - "platform_integrations.metadata jsonb merge (no migration) for admin settings"
key-files:
  created:
    - app/admin/integrations/whatsapp-system-prompt-form.tsx
  modified:
    - lib/platform-config.ts
    - lib/ai/types.ts
    - lib/ai/prompt-builder.ts
    - lib/services/generate-estimate.ts
    - lib/whatsapp/estimate-graph.ts
    - app/admin/integrations/actions.ts
    - app/admin/integrations/integration-category-content.tsx
decisions:
  - "Read getWhatsAppSystemPrompt fresh (no TTL cache) — low-frequency admin setting, freshness preferred (mirrors getWhatsAppDisplayNumber)"
  - "Addendum inserted as '## Additional Instructions' BETWEEN price-book and Security so Security remains the LAST/authoritative block"
  - "Admin text NOT XML-escaped — it is admin-trusted (requireAdmin gate); escaping is reserved for untrusted job-site data"
  - "system_prompt merged into existing meta_whatsapp metadata jsonb — no DB migration"
metrics:
  duration: ~12m
  tasks: 2
  files: 8
  completed: 2026-06-09
---

# Phase quick-260609-hir Plan 01: Admin-Configurable WhatsApp System Prompt Summary

Platform admins can now set a free-form, platform-wide WhatsApp system-prompt addendum in `/admin/integrations` that is appended to the estimate generation prompt ONLY for WhatsApp-channel estimates, before the Security block, leaving web/MCP generation byte-for-byte unaffected.

## What Was Built

**Task 1 — Backend + AI plumbing** (commit `0f5c527`):
- `lib/platform-config.ts`: new `getWhatsAppSystemPrompt(): Promise<string | null>` reading `platform_integrations.meta_whatsapp` metadata.system_prompt, trimmed, fresh-read (mirrors `getWhatsAppDisplayNumber`).
- `lib/ai/types.ts`: added `EstimateInput.extraInstructions?: string`.
- `lib/ai/prompt-builder.ts`: `buildSystemPrompt` appends `## Additional Instructions` only when `extraInstructions` is non-empty, positioned AFTER price-book and BEFORE `## Security` (Security stays last). Not XML-escaped (admin-trusted).
- `lib/services/generate-estimate.ts`: added `GenerateEstimateOptions.channel?: 'whatsapp'`; imports `getWhatsAppSystemPrompt`; fetches + sets `extraInstructions` only when `options.channel === 'whatsapp'`.
- `lib/whatsapp/estimate-graph.ts`: `generateEstimateNode` now calls `generateEstimateForProject(..., { channel: 'whatsapp' })` — the only call site passing the channel.

**Task 2 — Admin server action + UI** (commit `ce55f91`):
- `app/admin/integrations/actions.ts`: new `saveWhatsAppSystemPrompt(prompt)` — `requireAdmin`, 4000-char cap, preserves `ciphertext/iv/auth_tag`, merges `system_prompt` into metadata, `invalidatePlatformConfig` + `revalidatePath`, audit log (`integration.save`, target `meta_whatsapp_system_prompt`) with actorId/actorEmail.
- `app/admin/integrations/whatsapp-system-prompt-form.tsx` (new): client form with `Textarea` (maxLength 4000, rows 8), char counter, Save button; mirrors `whatsapp-config-form.tsx`.
- `app/admin/integrations/integration-category-content.tsx`: reads `system_prompt` from the existing `meta_whatsapp` query; renders `<WhatsAppSystemPromptForm currentPrompt={waSystemPrompt} />` after `<WhatsAppConfigForm>` inside a fragment.

## Verification

- `npx tsc --noEmit`: no new errors from this plan. The only 3 errors are pre-existing in `tests/unit/notifications/account-emails.test.ts` (Branding fixture missing fields — predates this task, logged in `deferred-items.md`).
- Grep confirms `getWhatsAppSystemPrompt` in `lib/platform-config.ts` and imported in `lib/services/generate-estimate.ts`.
- Grep confirms `channel: 'whatsapp'` is passed to `generateEstimateForProject` only in `lib/whatsapp/estimate-graph.ts` (the other match in `send-estimate.ts` is an unrelated DB delivery-log column, not a generate call).
- `## Additional Instructions` is appended before `## Security` in `lib/ai/prompt-builder.ts`.

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues (out of scope)

- `tests/unit/notifications/account-emails.test.ts` typecheck failures (TS2345, Branding fixture missing `metaDescription`/`ogImageUrl`/`canonicalBaseUrl`/`faviconUrl`). Pre-existing on `main`, not caused by this plan. See `deferred-items.md`.

## Threat Model Adherence

- T-hir-01 (Elevation): `requireAdmin()` gates `saveWhatsAppSystemPrompt`. ✓
- T-hir-02 (Tampering/ordering): addendum inserted before `## Security`; Security remains last. ✓
- T-hir-03 (DoS/length): 4000-char server-side cap + Textarea `maxLength`. ✓
- T-hir-04 / T-hir-05 (accepted): channel-gated to WhatsApp; admin-trusted text not escaped (by design).

No new threat surface beyond the plan's `<threat_model>`.

## Self-Check: PASSED

- FOUND: app/admin/integrations/whatsapp-system-prompt-form.tsx
- FOUND: getWhatsAppSystemPrompt in lib/platform-config.ts and lib/services/generate-estimate.ts
- FOUND commit: 0f5c527 (Task 1)
- FOUND commit: ce55f91 (Task 2)
