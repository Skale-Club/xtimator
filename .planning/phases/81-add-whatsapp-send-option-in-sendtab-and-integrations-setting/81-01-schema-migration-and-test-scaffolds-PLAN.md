---
phase: 81
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/20260526000001_phase81_whatsapp_delivery_channel.sql
  - types/database.types.ts
  - tests/unit/whatsapp/send-route.test.ts
  - tests/unit/whatsapp/send-form-tab.test.tsx
  - tests/unit/whatsapp/integrations-page.test.tsx
  - tests/unit/whatsapp/entitlement-gate.test.ts
autonomous: false
requirements:
  - WA-SEND-06
must_haves:
  truths:
    - "estimate_deliveries.channel CHECK accepts 'whatsapp' in addition to 'email' and 'sms'"
    - "estimate_deliveries.provider CHECK accepts 'meta' in addition to 'resend' and 'twilio'"
    - "supabase db push applied successfully against the dev database; smoke INSERT with channel='whatsapp', provider='meta' returns no constraint violation"
    - "Test scaffolds exist with `it.todo` placeholders matching RESEARCH.md test-map names — Wave 1 flips each to GREEN (preserves Phase 12/18 convention cited in Task 3 action)"
  artifacts:
    - path: "supabase/migrations/20260526000001_phase81_whatsapp_delivery_channel.sql"
      provides: "DROP + ADD CONSTRAINT for channel and provider"
      contains: "channel IN ('email', 'sms', 'whatsapp')"
    - path: "tests/unit/whatsapp/send-route.test.ts"
      provides: "RED stubs for POST /api/estimates/[id]/send-whatsapp (401, 400 phone, 402 entitlement, 409 status, 409 consolidated, branch-by-format, pdf fallback, log delivery)"
    - path: "tests/unit/whatsapp/send-form-tab.test.tsx"
      provides: "RED stubs for WhatsApp tab visibility, MessageCircle icon, E.164 validation, submit wiring"
    - path: "tests/unit/whatsapp/integrations-page.test.tsx"
      provides: "RED stubs for /settings/integrations mounting WhatsAppConnectCard"
    - path: "tests/unit/whatsapp/entitlement-gate.test.ts"
      provides: "RED stubs for getEntitlements(tier).whatsappEnabled && status === 'active' formula"
    - path: "types/database.types.ts"
      provides: "Manually extended estimate_deliveries channel/provider literal unions to include 'whatsapp' and 'meta'"
  key_links:
    - from: "supabase/migrations/20260526000001_phase81_whatsapp_delivery_channel.sql"
      to: "estimate_deliveries table"
      via: "supabase db push"
      pattern: "channel IN \\('email', 'sms', 'whatsapp'\\)"
---

<objective>
Lay Wave 0 foundation so Wave 1 can implement against existing scaffolds:

1. Extend `estimate_deliveries.channel` CHECK constraint to accept `'whatsapp'` and `provider` CHECK to accept `'meta'` via a single DROP + ADD migration (mirrors `supabase/migrations/20260511000003_phase53_pdf_attachment.sql` pattern).
2. Push the migration to the dev Supabase database — without this, every Wave 1 send will succeed at Meta but fail the audit INSERT (silent partial success — see Pitfall 1 in RESEARCH.md).
3. Manually extend `types/database.types.ts` to add `'whatsapp'` to channel literal and `'meta'` to provider literal (Phase 19/24 convention since Docker is unavailable on Windows).
4. Create RED test scaffolds for the API route (`send-route.test.ts`), the SendForm WhatsApp tab (`send-form-tab.test.tsx`), the Integrations page (`integrations-page.test.tsx`), and the entitlement gate (`entitlement-gate.test.ts`). Each scaffold MUST contain `expect.fail()` or equivalent so the test file compiles but assertions fail until Wave 1 implements.

Purpose: Migration must precede route code (Pitfall 1). Test scaffolds make Wave 1 verification automatic — Nyquist compliance means every Wave 1 task has a pre-existing failing test to flip GREEN.

Output: One migration file + extended types + four test scaffold files + supabase db push applied successfully + smoke INSERT validated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-RESEARCH.md
@.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-UI-SPEC.md
@.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-VALIDATION.md
@supabase/migrations/20260511000003_phase53_pdf_attachment.sql
@supabase/migrations/20260519000003_estimate_deliveries.sql
@types/database.types.ts
@tests/unit/whatsapp/handler.test.ts

<interfaces>
<!-- Key contracts the executor will need. Extracted from codebase. -->

From `supabase/migrations/20260519000003_estimate_deliveries.sql` (current CHECK constraints):

```sql
-- Original constraints (must be DROPPED and re-ADDED in this plan's migration):
ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_channel_check
  CHECK (channel IN ('email', 'sms'));

ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_provider_check
  CHECK (provider IN ('resend', 'twilio'));
```

From `supabase/migrations/20260511000003_phase53_pdf_attachment.sql` (pattern reference — DROP + ADD CONSTRAINT for `company_whatsapp.delivery_format`):

```sql
ALTER TABLE company_whatsapp
  DROP CONSTRAINT IF EXISTS company_whatsapp_delivery_format_check;

ALTER TABLE company_whatsapp
  ADD CONSTRAINT company_whatsapp_delivery_format_check
  CHECK (delivery_format IN ('share_link', 'formatted_text', 'pdf_attachment'));
```

From `tests/unit/whatsapp/handler.test.ts` (mocking pattern to follow):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/whatsapp/client', () => ({ sendWhatsAppMessage: vi.fn(), markMessageAsRead: vi.fn(), sendTypingIndicator: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create migration file + extend types/database.types.ts</name>
  <files>supabase/migrations/20260526000001_phase81_whatsapp_delivery_channel.sql, types/database.types.ts</files>
  <read_first>
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-RESEARCH.md` (§"Code Examples" → "Migration for channel + provider enum extension"; §"Common Pitfalls" → Pitfall 1)
    - `supabase/migrations/20260511000003_phase53_pdf_attachment.sql` (verbatim DROP + ADD CONSTRAINT pattern)
    - `supabase/migrations/20260519000003_estimate_deliveries.sql` (existing CHECK constraints lines 14-16 + provider column lines 17-21)
    - `types/database.types.ts` (find the `estimate_deliveries` `Row` type — manually patch the `channel` and `provider` string literal unions)
  </read_first>
  <behavior>
    - The migration runs without error against a database that already has `estimate_deliveries` (the row inserted in tests via `INSERT INTO estimate_deliveries (..., channel, ..., provider, ...) VALUES (..., 'whatsapp', ..., 'meta', ...)` must succeed).
    - The migration is idempotent: re-running it MUST NOT fail (uses `DROP CONSTRAINT IF EXISTS`).
    - The TypeScript `Database['public']['Tables']['estimate_deliveries']['Row']['channel']` type accepts `'whatsapp'`.
    - The TypeScript `Database['public']['Tables']['estimate_deliveries']['Row']['provider']` type accepts `'meta'`.
  </behavior>
  <action>
    1. Create `supabase/migrations/20260526000001_phase81_whatsapp_delivery_channel.sql` with the following EXACT content (verbatim from RESEARCH.md §"Code Examples"):

```sql
-- Phase 81: WhatsApp outbound delivery channel
-- Extends estimate_deliveries.channel CHECK to include 'whatsapp' and
-- estimate_deliveries.provider CHECK to include 'meta'.
-- Mirrors the DROP + ADD CONSTRAINT pattern from
-- 20260511000003_phase53_pdf_attachment.sql.

ALTER TABLE estimate_deliveries
  DROP CONSTRAINT IF EXISTS estimate_deliveries_channel_check;

ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_channel_check
  CHECK (channel IN ('email', 'sms', 'whatsapp'));

ALTER TABLE estimate_deliveries
  DROP CONSTRAINT IF EXISTS estimate_deliveries_provider_check;

ALTER TABLE estimate_deliveries
  ADD CONSTRAINT estimate_deliveries_provider_check
  CHECK (provider IN ('resend', 'twilio', 'meta'));
```

    2. Open `types/database.types.ts`. Find the `estimate_deliveries` table type definition (search for `estimate_deliveries:` then locate `Row:` block). Two fields to patch:
       - `channel: string` (or `'email' | 'sms'` literal) → change literal union to include `'whatsapp'`, OR if the current type is just `string`, add a JSDoc comment `/** 'email' | 'sms' | 'whatsapp' — see migration 20260526000001 */` AND leave `string` (do NOT introduce a narrower literal that doesn't already exist — Phase 19/24 convention is "extend if literal exists, otherwise document").
       - `provider: string` (or current literal) → same treatment, add `'meta'` to the literal union if present, otherwise add a JSDoc note.
       Do NOT regenerate types (Docker unavailable on Windows — Phase 19 SUMMARY documents this). Manually patch.
    3. Do NOT push the migration in this task — Task 2 owns the push so it can be marked `[BLOCKING]` and run after both files are committed.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const m=fs.readFileSync('supabase/migrations/20260526000001_phase81_whatsapp_delivery_channel.sql','utf8');if(!m.includes(\"channel IN ('email', 'sms', 'whatsapp')\"))process.exit(1);if(!m.includes(\"provider IN ('resend', 'twilio', 'meta')\"))process.exit(1);if(!m.includes('DROP CONSTRAINT IF EXISTS estimate_deliveries_channel_check'))process.exit(1);console.log('migration content OK')"</automated>
  </verify>
  <acceptance_criteria>
    - File `supabase/migrations/20260526000001_phase81_whatsapp_delivery_channel.sql` exists
    - File contains literal `channel IN ('email', 'sms', 'whatsapp')`
    - File contains literal `provider IN ('resend', 'twilio', 'meta')`
    - File contains `DROP CONSTRAINT IF EXISTS estimate_deliveries_channel_check` and `DROP CONSTRAINT IF EXISTS estimate_deliveries_provider_check`
    - `types/database.types.ts` modified — git diff shows changes near `estimate_deliveries` symbol
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Migration SQL file exists with both extended CHECK constraints, types/database.types.ts has manual extension for estimate_deliveries channel/provider literals, and tsc passes — readiness for Task 2 schema push.</done>
</task>

<task type="checkpoint:human-action" tdd="false">
  <name>Task 2: [BLOCKING] Push migration to Supabase + smoke INSERT</name>
  <files>supabase/migrations/20260526000001_phase81_whatsapp_delivery_channel.sql (already exists from Task 1 — this task does NOT modify the file; it applies the migration to the live dev database via supabase db push)</files>
  <read_first>
    - `supabase/migrations/20260526000001_phase81_whatsapp_delivery_channel.sql` (the file Task 1 created — verify content before push)
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-RESEARCH.md` §"Common Pitfalls" Pitfall 1 (silent partial success risk if migration is not applied)
    - CLAUDE.md §"Secret Handling" — `SUPABASE_ACCESS_TOKEN` must NEVER be echoed or committed; pass via env only
  </read_first>
  <behavior>
    - `supabase db push` completes without constraint-violation errors against the dev database
    - After push, a smoke INSERT with `channel='whatsapp'` and `provider='meta'` succeeds (followed by ROLLBACK to keep DB clean)
    - The migration is idempotent — re-running `supabase db push` is a no-op (DROP CONSTRAINT IF EXISTS ensures this)
  </behavior>
  <action>
    [BLOCKING] human-action task because `supabase db push` requires `SUPABASE_ACCESS_TOKEN` env var and may prompt for interactive auth that cannot be suppressed reliably in non-TTY contexts. Without this push, every Wave 1 WhatsApp send will succeed at Meta but fail the estimate_deliveries INSERT (silent partial success per RESEARCH.md Pitfall 1).

    Steps:
    1. Ensure `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_URL` (or equivalent `DATABASE_URL`) are set in the executor's environment. If not set, abort and ask the user to provide them. NEVER echo these values.
    2. Run from repo root:
       ```
       npx supabase db push
       ```
       Expected output: "Applying migration 20260526000001_phase81_whatsapp_delivery_channel.sql" followed by "Finished supabase db push." with no constraint violation errors.
    3. Smoke INSERT to confirm the new constraint is live. Use the Supabase MCP `execute_sql` tool (project: Xtimator) with this query:
       ```sql
       BEGIN;
       INSERT INTO estimate_deliveries (
         estimate_id, company_id, channel, recipient_phone, provider, status
       )
       SELECT
         e.id, e.company_id, 'whatsapp', '+15555550100', 'meta', 'sent'
       FROM estimates e
       LIMIT 1;
       ROLLBACK;
       ```
       Expected: `INSERT 0 1` followed by `ROLLBACK`. If the insert violates the CHECK constraint, the migration did not apply — re-run Task 1 / Task 2.
    4. Optionally confirm via:
       ```sql
       SELECT con.conname, pg_get_constraintdef(con.oid)
       FROM pg_constraint con
       WHERE con.conname IN ('estimate_deliveries_channel_check', 'estimate_deliveries_provider_check');
       ```
       shows the new constraint definitions including `'whatsapp'` and `'meta'`.
    5. If `npx supabase db push` requires interactive auth and cannot be suppressed, PAUSE and ask the user to run the push manually (`supabase db push` in their terminal) and confirm before continuing. Mark the task complete only after the user types "applied".
  </action>
  <verify>
    <automated>npx supabase db remote query --query "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname IN ('estimate_deliveries_channel_check','estimate_deliveries_provider_check')" 2>&1 | grep -q "whatsapp" && npx supabase db remote query --query "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname IN ('estimate_deliveries_channel_check','estimate_deliveries_provider_check')" 2>&1 | grep -q "meta"</automated>
  </verify>
  <acceptance_criteria>
    - `supabase db push` completed without constraint-violation errors
    - Smoke INSERT with `channel='whatsapp'`, `provider='meta'` returned `INSERT 0 1` (then ROLLBACK)
    - Optional pg_constraint inspection confirms the extended CHECK definitions
    - User typed "applied" or equivalent confirmation
  </acceptance_criteria>
  <done>Migration is live on the dev DB; estimate_deliveries.channel accepts 'whatsapp' and estimate_deliveries.provider accepts 'meta'. Wave 1 plan 81-02 can now insert delivery audit rows without constraint violation.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Create test scaffolds (RED) for Wave 1 API route, UI tab, integrations page, entitlement gate</name>
  <files>tests/unit/whatsapp/send-route.test.ts, tests/unit/whatsapp/send-form-tab.test.tsx, tests/unit/whatsapp/integrations-page.test.tsx, tests/unit/whatsapp/entitlement-gate.test.ts</files>
  <read_first>
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-RESEARCH.md` (§"Validation Architecture" → "Phase Requirements → Test Map" — every row drives one test case in these scaffolds)
    - `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-VALIDATION.md` (§"Wave 0 Requirements")
    - `tests/unit/whatsapp/handler.test.ts` (mocking pattern for `vi.mock('@/lib/whatsapp/client', ...)` and supabase clients)
    - `tests/unit/api/generate-estimate-dispatch.test.ts` (route handler test pattern — how the Request object is constructed and POST is invoked)
    - `tests/unit/whatsapp/pdf-delivery.test.ts` (mocking pattern for `generateAndUploadEstimatePDF`)
  </read_first>
  <behavior>
    - Every test file imports vitest explicitly: `import { describe, it, expect, vi, beforeEach } from 'vitest'`.
    - Every test file imports the module under test as a dynamic import so the file compiles even before the Wave 1 implementation exists (use `expect(async () => await import('@/app/api/estimates/[id]/send-whatsapp/route')).rejects.toThrow()` OR `it.todo()` markers; do NOT use bare static imports of non-existent modules — they fail at compile time, not at test time).
    - Every `it()` block contains either `expect.fail('Wave 1: implement <thing>')` or `it.todo('...')` so the test file runs (vitest reports as RED) until Wave 1 implements.
    - Test names exactly match the strings in RESEARCH.md "Phase Requirements → Test Map" (`renders tab`, `icon`, `401`, `E.164`, `consolidated`, `delivery_format`, `pdf fallback`, `402 entitlement`, `409 not active`, `logs delivery`, `not connected`, `connected`, `header copy`) so Wave 1 verify commands `npm test -- ... -t "<name>"` resolve to specific tests.
  </behavior>
  <action>
    Create exactly these four files. Use `it.todo()` for behaviors that require the Wave 1 module to exist; the test file itself MUST be parseable today (no imports of files that don't exist yet — defer those to dynamic `await import(...)` inside the `it.todo` body, OR use `it.todo` with no body).

    **File 1: `tests/unit/whatsapp/send-route.test.ts`**

```typescript
// Wave 0 RED scaffold for POST /api/estimates/[id]/send-whatsapp.
// Wave 1 (plan 81-02) will:
//   - create app/api/estimates/[id]/send-whatsapp/route.ts
//   - replace every it.todo below with a real it(...) that imports and exercises POST.
import { describe, it } from 'vitest'

describe('POST /api/estimates/[id]/send-whatsapp', () => {
  it.todo('returns 401 when getClaims returns null')
  it.todo('returns 400 when phone fails E.164 regex')
  it.todo('returns 409 when estimate.workflow_status !== "consolidated"')
  it.todo('returns 402 when getEntitlements(tier).whatsappEnabled === false')
  it.todo('returns 409 when company_whatsapp.status !== "active"')
  it.todo('branches into share_link when delivery_format === "share_link" (sendWhatsAppMessage called with type:"text", body containing share URL)')
  it.todo('branches into formatted_text when delivery_format === "formatted_text" (formatEstimateForWhatsApp called, sendWhatsAppMessage type:"text")')
  it.todo('branches into pdf_attachment when delivery_format === "pdf_attachment" (generateAndUploadEstimatePDF called, sendWhatsAppMessage type:"document")')
  it.todo('pdf fallback: when generateAndUploadEstimatePDF throws, falls back to share_link AND response includes fallback: "share_link"')
  it.todo('logs delivery: inserts estimate_deliveries row with channel="whatsapp", provider="meta", status="sent", recipient_phone=to')
  it.todo('logs activity: inserts estimate_activity row with event_type="estimate_sent" and metadata.channel="whatsapp"')
  it.todo('updates estimates.sent_at if currently null')
})
```

    **File 2: `tests/unit/whatsapp/send-form-tab.test.tsx`**

```typescript
// Wave 0 RED scaffold for the WhatsApp tab in components/workspace/send/send-form.tsx.
// Wave 1 (plan 81-03) will add the third TabsTrigger and TabsContent and replace
// every it.todo below with a real it(...).
import { describe, it } from 'vitest'

describe('SendForm — WhatsApp tab', () => {
  it.todo('renders tab when whatsappSendEnabled === true')
  it.todo('hides tab entirely when whatsappSendEnabled === false (no disabled trigger rendered)')
  it.todo('icon: tab trigger renders MessageCircle (not MessageSquare)')
  it.todo('tab order is Email, SMS, WhatsApp left-to-right when both smsDeliveryEnabled and whatsappSendEnabled are true')
  it.todo('phone field accepts +15551234567 and rejects 555-1234 (E.164 schema)')
  it.todo('submit posts to /api/estimates/[id]/send-whatsapp with { to, message } JSON body')
  it.todo('success toast reads "Estimate sent via WhatsApp!" on 200 response')
  it.todo('fallback toast: when API response includes fallback: "share_link", toast reads "PDF indisponível — enviamos o link"')
  it.todo('CTA disabled when parent passes disabled={true} (draft estimate)')
})
```

    **File 3: `tests/unit/whatsapp/integrations-page.test.tsx`**

```typescript
// Wave 0 RED scaffold for app/(app)/settings/integrations/page.tsx.
// Wave 1 (plan 81-03) will replace the placeholder body with a server component
// that mounts <WhatsAppConnectCard initial={initial} />.
import { describe, it } from 'vitest'

describe('Settings → Integrations page', () => {
  it.todo('header copy: H1 reads "Integrations"')
  it.todo('header copy: subhead reads "Connect outbound channels for sending estimates and receiving client messages."')
  it.todo('mounts WhatsAppConnectCard with initial={null} when company has no company_whatsapp row (not connected)')
  it.todo('mounts WhatsAppConnectCard with initial={{...}} when company_whatsapp row exists (connected)')
  it.todo('does NOT render the old "OpenRouter integration coming soon" placeholder text')
})
```

    **File 4: `tests/unit/whatsapp/entitlement-gate.test.ts`**

```typescript
// Wave 0 RED scaffold for the server-side gate formula used by Wave 1
// (in both app/(app)/projects/[id]/page.tsx for whatsappSendEnabled
// and app/api/estimates/[id]/send-whatsapp/route.ts for the 402/409 check).
import { describe, it } from 'vitest'

describe('whatsappSendEnabled gate formula', () => {
  it.todo('returns true when tier=trial AND company_whatsapp.status === "active"')
  it.todo('returns true when tier=pro AND company_whatsapp.status === "active"')
  it.todo('returns true when tier=business AND company_whatsapp.status === "active"')
  it.todo('returns false when tier=free regardless of status (whatsappEnabled=false on free)')
  it.todo('returns false when tier=pro AND company_whatsapp.status === "pending"')
  it.todo('returns false when tier=pro AND company_whatsapp.status === "suspended"')
  it.todo('returns false when tier=pro AND no company_whatsapp row exists')
})
```

    Each file is parseable today (no imports of Wave 1 modules); vitest will report all `it.todo` as pending (yellow), which counts as RED scaffolding per the Phase 12 / Phase 18 Wave 0 convention. Wave 1 tasks WILL replace each `it.todo` with a real `it(...)` and remove the `.todo`.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/whatsapp/send-route.test.ts tests/unit/whatsapp/send-form-tab.test.tsx tests/unit/whatsapp/integrations-page.test.tsx tests/unit/whatsapp/entitlement-gate.test.ts --reporter=verbose 2>&1 | tee /tmp/wave0-scaffold.log; grep -q "todo" /tmp/wave0-scaffold.log</automated>
  </verify>
  <acceptance_criteria>
    - File `tests/unit/whatsapp/send-route.test.ts` exists and contains literal `describe('POST /api/estimates/[id]/send-whatsapp'`
    - File `tests/unit/whatsapp/send-form-tab.test.tsx` exists and contains literal `describe('SendForm — WhatsApp tab'`
    - File `tests/unit/whatsapp/integrations-page.test.tsx` exists and contains literal `describe('Settings → Integrations page'`
    - File `tests/unit/whatsapp/entitlement-gate.test.ts` exists and contains literal `describe('whatsappSendEnabled gate formula'`
    - Each file contains at least 5 `it.todo(...)` calls
    - `npx vitest run tests/unit/whatsapp/send-route.test.ts tests/unit/whatsapp/send-form-tab.test.tsx tests/unit/whatsapp/integrations-page.test.tsx tests/unit/whatsapp/entitlement-gate.test.ts` exits 0 (todos do not fail the suite) and reports todo count > 0
  </acceptance_criteria>
  <done>Four RED scaffold test files exist with named it.todo entries matching RESEARCH.md test-map strings; Wave 1 plans (81-02, 81-03) can flip these todos to real it() with passing assertions.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| migration → dev database | SQL DDL executed by `supabase db push` — only the developer runs this; no untrusted input crosses this boundary |
| test scaffold → CI | RED scaffolds run under vitest in the developer's local machine and in CI; no PII / secrets pass through |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-81-05 | Repudiation | `estimate_deliveries` table | mitigate | This plan's migration is the precondition for Pattern 2's `INSERT INTO estimate_deliveries (channel='whatsapp', provider='meta', ...)` audit row. Without this migration, the audit row INSERT silently fails after the message goes out — the owner cannot prove delivery. Migration is `[BLOCKING]` to prevent that gap. |
| T-81-07 | Information Disclosure | migration SQL file | mitigate | The migration file must NOT contain any secret value. Verified: file only contains DDL (`ALTER TABLE … CHECK …`) — no tokens, no signed URLs, no phone numbers. gitleaks pre-commit hook will catch any inadvertent secret. |
| T-81-01..04 | (deferred to plans 02/03) | (route + UI) | — | Not applicable in this plan — only schema + scaffolds ship here. T-81-01..04 are addressed in plans 81-02 (route) and 81-03 (UI). |
| T-81-06 | Elevation of Privilege | (deferred to plan 02) | — | Server-side entitlement gate is implemented in plan 81-02; this plan's `entitlement-gate.test.ts` scaffold is the contract Wave 1 must satisfy (see `it.todo` enumerations: free tier returns false, pending/suspended return false, etc.) |
</threat_model>

<verification>
- `npx tsc --noEmit` exits 0 (types extension is syntactically valid)
- `node -e "..."` from Task 1 verify command confirms migration SQL is correct
- `npx supabase db push` from Task 2 applies cleanly
- Smoke INSERT from Task 2 succeeds (`INSERT 0 1` then ROLLBACK)
- `npx vitest run tests/unit/whatsapp/send-route.test.ts tests/unit/whatsapp/send-form-tab.test.tsx tests/unit/whatsapp/integrations-page.test.tsx tests/unit/whatsapp/entitlement-gate.test.ts` exits 0 with todo count > 0
- `git diff types/database.types.ts` shows extension of `estimate_deliveries.channel` and `estimate_deliveries.provider` literal unions (or JSDoc comment if literals are `string`)
</verification>

<success_criteria>
- estimate_deliveries CHECK constraints extended to allow channel='whatsapp' and provider='meta'
- Migration pushed to dev DB; smoke INSERT confirms live constraint
- types/database.types.ts manually patched (Phase 19/24 Docker-on-Windows convention)
- Four RED test scaffold files exist with named `it.todo` entries that Wave 1 will flip GREEN
- All Task 3 named test cases match RESEARCH.md "Phase Requirements → Test Map" so Wave 1 verify commands resolve to specific tests by name
</success_criteria>

<output>
After completion, create `.planning/phases/81-add-whatsapp-send-option-in-sendtab-and-integrations-setting/81-01-SUMMARY.md` documenting:
- Migration filename + exact CHECK constraint values added
- Output of `supabase db push` (or "applied via Supabase MCP — see project Xtimator")
- Output of the smoke INSERT (e.g. "INSERT 0 1 → ROLLBACK confirmed")
- Path to each of the 4 scaffold test files + count of `it.todo` entries each
- Any Phase 19/24-style manual type extension applied to types/database.types.ts
</output>
