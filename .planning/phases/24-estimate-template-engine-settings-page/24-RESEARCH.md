# Phase 24: Estimate Template Engine + Settings Page — Research

**Researched:** 2026-05-08
**Domain:** Next.js App Router settings sub-route, Supabase ALTER TABLE migration, react-hook-form + zod textarea form, pure utility function design
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Template Storage**
- Store template as 5 new columns on the `companies` table — no new table.
- Column names: `estimate_template_greeting`, `estimate_template_opener`, `estimate_template_closer`, `estimate_template_signature` (all TEXT).
- `{items_breakdown}` and `{total}` are injected automatically at render time — not stored.
- All 4 columns default to NULL. NULL = "use app default"; defaults resolved at render time in a pure function, NOT at insert time.

**D-02: Settings Entry Point**
- Card below SettingsTabs on `/settings`, same pattern as Price Book (Phase 20 D-02).
- New card: icon `FileText`, title "Estimate Templates", description "Customize the greeting, opener, and signature for your plain-text estimates."
- Links to `/settings/estimate-templates`.
- No change to NAV_ITEMS.

**D-03: Page Layout and Form**
- Standalone page at `/settings/estimate-templates` — same sub-route pattern as `/settings/price-book` and `/settings/appearance`.
- Single-page form (no tabs, no accordion) with 4 textarea fields: Greeting, Opening, Closing, Signature.
- Each field: label, helper text, list of valid variables as static muted text below field.
- Variables: `{client_name}`, `{company_name}`, `{owner_name}`, `{total}`, `{items_breakdown}` — documented below relevant fields.
- No live variable highlighting (deferred).
- Save button at bottom. `useTransition` + `router.refresh()` pattern.

**D-04: Default Template Values**
Resolved in `lib/utils/estimate-template.ts` (pure, no DB calls). Defaults:
- greeting: `"Hey {client_name},"`
- opener: `"Thank you for reaching out to {company_name}! Here is your estimate:"`
- closer: `"Let me know if you have any questions or would like to schedule an appointment. I'd be happy to assist you!"`
- signature: `"Best regards,\n{owner_name}\n{company_name}"`

Function `resolveTemplate(template, data)` takes stored columns (NULL falls back to defaults) plus render-time data and returns the final plain-text string. Phase 25 consumes this.

**D-05: Migration Approach**
- New migration: `supabase/migrations/20260508000001_phase24_estimate_templates.sql`
- Adds 4 nullable TEXT columns to `companies` with no default (NULL = app default).
- No backfill needed.
- Regenerate `lib/database.types.ts` after migration.

### Claude's Discretion
- Exact textarea row count per field (suggest 3 rows for greeting/opener, 4 for closer/signature).
- Placeholder text (suggest showing default value as placeholder).
- Form validation: allow empty (saving empty = revert to default); no required fields.
- Whether to show a read-only preview of assembled template (only if trivially cheap via simple concatenation; no full render engine).

### Deferred Ideas (OUT OF SCOPE)
- Live syntax highlighting / variable colorization in textarea
- Per-estimate template override
- i18n of template (EN/PT-BR/ES variants)
- Markdown variant of the template
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAINTEXT-03 | Text generated uses company template — greeting (`Hey {client_name}`), opening, category/item/price listing, total, closing, signature (`{owner_name}`, `{company_name}`) | `resolveTemplate()` utility in `lib/utils/estimate-template.ts` covers substitution; 4 DB columns on `companies` cover storage; page form covers editing |
| PLAINTEXT-05 | Owner configures template at `/settings/estimate-templates` with supported variables: `{client_name}`, `{company_name}`, `{owner_name}`, `{total}`, `{items_breakdown}` | Sub-route page, form component, server action, migration all cover this requirement end-to-end |
</phase_requirements>

---

## Summary

Phase 24 builds the template configuration layer that Phase 25 will render. The work divides cleanly into three concerns: (1) a Supabase migration adding 4 nullable TEXT columns to the `companies` table, (2) a pure utility module `lib/utils/estimate-template.ts` with default resolution and variable substitution logic, and (3) a new settings sub-route at `/settings/estimate-templates` with a 4-field textarea form.

All three concerns have established patterns in this codebase with zero novel dependencies. The migration follows the `ALTER TABLE ... ADD COLUMN` pattern from Phase 19. The utility function is a simple pure TypeScript module with no external library. The settings page follows the exact layout, data-fetching, server action, and form patterns set by Phase 20 (Price Book) and the existing `defaults-form.tsx`. The entry point card on `/settings` page.tsx replicates the Price Book card added in Phase 20.

The only non-trivial design decision left to Claude's discretion is whether to include a lightweight read-only assembled preview below the form. This is cheap to build (concatenate 4 resolved fields with newlines and render in a `<pre>` or text block) and is worth including since it helps owners verify their template without leaving the page.

**Primary recommendation:** Three-plan structure — (1) migration + utility, (2) server action + form component, (3) settings page + entry point card. This matches the wave pattern established by Phase 20.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js App Router | 14+ | Page routing, server components, `loading.tsx` | Project standard (CLAUDE.md) |
| react-hook-form | (existing) | Form state management | CLAUDE.md locked; used in `defaults-form.tsx` |
| zod | (existing) | Schema validation | CLAUDE.md locked; used in all forms |
| @hookform/resolvers | (existing) | zodResolver bridge | Used in every form with the `as Resolver<T>` cast |
| shadcn/ui | New York style | Card, CardHeader, CardContent, Textarea, Button, Label, Form, FormField, FormItem, FormLabel, FormDescription, FormControl, FormMessage | Project locked (STATE.md D-09) |
| sonner (toast) | (existing) | Success/error toast notifications | Used in all form save flows |
| Supabase JS | (existing) | DB update, RLS-gated | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | (existing) | `FileText` icon for entry card, `ChevronRight`, `Loader2` | Icon set used across settings |
| next/cache `revalidatePath` | (existing) | Invalidate `/settings/estimate-templates` after save | Same as all settings actions |
| next/cache `revalidateTag` | (existing) | `revalidateTag('company')` for cached company data | `updateCompanySettings` uses this; template action should too since `getCachedCompany` TTL is 60s |

**Installation:** No new packages needed. All dependencies already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
app/(app)/settings/
  page.tsx                          -- ADD: Estimate Templates card below Price Book card
  estimate-templates/
    page.tsx                        -- NEW: server component, fetches company, passes to form
    loading.tsx                     -- NEW: skeleton for 4 textarea fields

components/settings/
  estimate-template-form.tsx        -- NEW: 'use client' react-hook-form + zod 4-field form

lib/
  utils/
    estimate-template.ts            -- NEW: pure resolveTemplate() + TEMPLATE_DEFAULTS
  schemas/
    estimate-template.ts            -- NEW: zod schema for the 4 form fields
  actions/
    estimate-template.ts            -- NEW: saveEstimateTemplate server action
  queries/
    company.ts                      -- MODIFY: add 4 template columns to CompanySettings interface

supabase/migrations/
  20260508000001_phase24_estimate_templates.sql  -- NEW: ALTER TABLE companies ADD COLUMN x4
```

### Pattern 1: Sub-route Settings Page (replicate from price-book/page.tsx)

**What:** Server component page that auth-gates, fetches company data, and passes it to a client form component.

**When to use:** Any `/settings/[sub-route]` page that needs DB-backed initial values.

**Example (from `app/(app)/settings/price-book/page.tsx`):**
```typescript
// Source: app/(app)/settings/price-book/page.tsx
import { redirect } from 'next/navigation'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'

export const metadata = { title: 'Estimate Templates' }

export default async function EstimateTemplatesPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const company = await getCachedCompany(claims.sub as string)
  if (!company) redirect('/onboarding')

  // company now has: estimate_template_greeting, estimate_template_opener, etc.
  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Estimate Templates</h1>
        <p className="text-sm text-muted-foreground">
          Customize the greeting, opener, closing, and signature for your plain-text estimates.
          Changes apply to all future estimates.
        </p>
      </div>
      <EstimateTemplateForm company={company} />
    </div>
  )
}
```

**Critical note:** `getCachedCompany` currently selects only `id, name, logo_url, owner_name, theme_preference, industry`. After the migration, the page needs the 4 new template columns. Two options:
1. Extend `getCachedCompany` select list (changes the cached shape — affects every consumer)
2. Use a separate lightweight query in the page (preferred — keeps `getCachedCompany` minimal and avoids cache pollution)

Use option 2: create a `getEstimateTemplateSettings(userId)` function in `lib/queries/company.ts` that selects only `id` + the 4 template columns. This function uses `createClient()` directly (not the service client / unstable_cache), so it reads fresh data on each page load.

### Pattern 2: Settings Server Action (replicate from lib/actions/settings.ts `updateDefaults`)

**What:** `'use server'` function with `getAuthContext()`, typed input, Supabase update, `revalidatePath` + `revalidateTag`.

**When to use:** Any form that saves to the `companies` table.

**Example (modelled on `updateDefaults` in `lib/actions/settings.ts`):**
```typescript
// Source: lib/actions/settings.ts (updateDefaults pattern)
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) return { error: 'No company found' as const }
  return { supabase, company }
}

export async function saveEstimateTemplate(data: {
  greeting: string | null
  opener: string | null
  closer: string | null
  signature: string | null
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { error } = await supabase
    .from('companies')
    .update({
      estimate_template_greeting: data.greeting || null,
      estimate_template_opener: data.opener || null,
      estimate_template_closer: data.closer || null,
      estimate_template_signature: data.signature || null,
    })
    .eq('id', company.id)

  if (error) return { error: 'Failed to save template. Please try again.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(revalidateTag as any)('company')
  revalidatePath('/settings/estimate-templates')
  return { success: true }
}
```

### Pattern 3: Client Form Component (replicate from components/settings/defaults-form.tsx)

**What:** `'use client'` component with `useTransition`, `useForm` + `zodResolver`, submit handler calling server action, sonner toast.

**Key implementation details for estimate-template-form.tsx:**
- `zodResolver` cast as `Resolver<EstimateTemplateFormValues>` (codebase pattern from Phase 02)
- `defaultValues` should populate from `company.estimate_template_greeting ?? ''` etc. — empty string when NULL so the textarea is controlled
- On submit: convert empty strings back to `null` before sending to server action (empty = revert to default)
- After success: call `router.refresh()` to reload server component with fresh DB data

**Form schema (zod):**
```typescript
// Source: lib/schemas/estimate-template.ts (new file)
import { z } from 'zod'

export const estimateTemplateSchema = z.object({
  greeting: z.string().optional().or(z.literal('')),
  opener: z.string().optional().or(z.literal('')),
  closer: z.string().optional().or(z.literal('')),
  signature: z.string().optional().or(z.literal('')),
})

export type EstimateTemplateFormValues = z.infer<typeof estimateTemplateSchema>
```

### Pattern 4: Pure Template Utility (new — no codebase precedent, but standard TS pattern)

**What:** Pure function module with no side effects, no DB calls, no React imports. Fully unit-testable.

**Example:**
```typescript
// Source: lib/utils/estimate-template.ts (new)
export interface TemplateData {
  client_name: string
  company_name: string
  owner_name: string
  total: string          // pre-formatted, e.g. "$1,250.00"
  items_breakdown: string // multi-line text block
}

export interface EstimateTemplate {
  greeting: string | null
  opener: string | null
  closer: string | null
  signature: string | null
}

export const TEMPLATE_DEFAULTS = {
  greeting: 'Hey {client_name},',
  opener: 'Thank you for reaching out to {company_name}! Here is your estimate:',
  closer: "Let me know if you have any questions or would like to schedule an appointment. I'd be happy to assist you!",
  signature: 'Best regards,\n{owner_name}\n{company_name}',
} as const

function substitute(template: string, data: TemplateData): string {
  return template
    .replace(/\{client_name\}/g, data.client_name || '')
    .replace(/\{company_name\}/g, data.company_name || '')
    .replace(/\{owner_name\}/g, data.owner_name || '')
    .replace(/\{total\}/g, data.total || '')
    .replace(/\{items_breakdown\}/g, data.items_breakdown || '')
}

export function resolveTemplate(template: EstimateTemplate, data: TemplateData): string {
  const resolved = {
    greeting:   template.greeting   ?? TEMPLATE_DEFAULTS.greeting,
    opener:     template.opener     ?? TEMPLATE_DEFAULTS.opener,
    closer:     template.closer     ?? TEMPLATE_DEFAULTS.closer,
    signature:  template.signature  ?? TEMPLATE_DEFAULTS.signature,
  }
  const parts = [
    substitute(resolved.greeting, data),
    '',
    substitute(resolved.opener, data),
    '',
    data.items_breakdown,  // already formatted by caller; not substituted through template
    '',
    substitute(resolved.closer, data),
    '',
    substitute(resolved.signature, data),
  ]
  return parts.join('\n')
}
```

**Note on `{items_breakdown}`:** Per D-01, `{items_breakdown}` and `{total}` are not stored in template fields — they are injected at render time. In practice, the `opener` and `signature` fields do NOT contain `{items_breakdown}` or `{total}`. Only the render-time assembly in `resolveTemplate` inserts the items block between the opener and closer. The `{total}` variable IS available as a substitution in any field (e.g. closer: "Total: {total}"), so `substitute()` still handles it. The positioning of the items block within the assembled text is fixed by the `resolveTemplate` join order, not by the template strings.

### Pattern 5: Entry Point Card on /settings (replicate Price Book card)

**What:** `<Link href="/settings/estimate-templates">` wrapping a `<Card>` with `CardHeader`, icon, title, description, and `ChevronRight`. Placed below the existing Price Book card in `app/(app)/settings/page.tsx`.

**Example (modelled on existing Price Book card):**
```tsx
// Source: app/(app)/settings/page.tsx (existing Price Book card pattern)
<Link
  href="/settings/estimate-templates"
  className="block rounded-[var(--radius-md)] transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
  <Card className="w-full rounded-[var(--radius-md)]">
    <CardHeader className="flex flex-row items-center justify-between border-b border-border">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <CardTitle>Estimate Templates</CardTitle>
          <CardDescription>
            Customize the greeting, opener, and signature for your plain-text estimates.
          </CardDescription>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
  </Card>
</Link>
```

### Anti-Patterns to Avoid

- **Putting defaults in SQL `DEFAULT` clause:** Decision D-01 says NULL columns, defaults in app. Do not add `DEFAULT 'Hey {client_name},'` to the ALTER TABLE statement.
- **Using `getCachedCompany` for the template page data:** That function's `unstable_cache` cannot call `cookies()` internally and is scoped for layout/sidebar needs. Use a direct `createClient()` query in the page instead.
- **Sharing `getAuthContext` across files by import:** The codebase convention (STATE.md Phase 20 entry) is to duplicate `getAuthContext` per action file. Don't import it from another module.
- **Calling `revalidateTag` directly without the `as any` cast:** The existing codebase suppresses the TypeScript overload mismatch with `(revalidateTag as any)('company')` — use the same pattern for consistency.
- **Storing `{items_breakdown}` as a template field:** Per D-01 it is injected at render time. The settings form has no "Items Breakdown" textarea.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form state management | Custom useState per field | react-hook-form + zod | Already installed; error handling, dirty state, validation all included |
| Toast notifications | Custom alert/div | sonner `toast.success` / `toast.error` | Consistent with all other form saves in the app |
| Loading skeleton | Custom spinner | `loading.tsx` + shadcn `Skeleton` | App Router streaming; matches price-book and appearance pattern |
| Template variable substitution | Third-party template engine (mustache, handlebars) | Regex replace in pure function | Variables are fixed and simple (`{var_name}`); no logic, no partials, no loops needed at this phase |

**Key insight:** This phase is entirely about wiring together established patterns. There is no novel technical problem to solve — the complexity is organizational (four layers: migration, utility, action, UI).

---

## Runtime State Inventory

Step 2.5 SKIPPED — this is a greenfield feature addition, not a rename/refactor/migration phase. No existing runtime state references the new columns.

---

## Environment Availability

Step 2.6 SKIPPED — Phase 24 is a pure code + SQL migration change. External dependencies (Supabase) are already proven available from prior phases. No new CLI tools, runtimes, or services are required.

---

## Common Pitfalls

### Pitfall 1: CompanySettings type not updated to include new columns
**What goes wrong:** TypeScript compilation passes but the form receives `undefined` instead of `null` for the 4 template fields; no type error because the interface is unchecked.
**Why it happens:** `lib/queries/company.ts` has a manually maintained `CompanySettings` interface. Adding columns to the DB does not auto-update TypeScript types (no `lib/database.types.ts` in this project — confirmed absent).
**How to avoid:** After writing the migration, immediately add the 4 optional fields to `CompanySettings`:
```typescript
estimate_template_greeting: string | null
estimate_template_opener: string | null
estimate_template_closer: string | null
estimate_template_signature: string | null
```
**Warning signs:** Form defaultValues fallback to `''` but not because the DB returned null — because the property is `undefined` (missing from type).

### Pitfall 2: getCachedCompany select list not updated
**What goes wrong:** The template page uses `getCachedCompany` and the new columns are not in its `select()` list, so they come back as `undefined`.
**Why it happens:** `getCachedCompany` in `lib/queries/auth.ts` explicitly selects a narrow field list. New columns are silently absent.
**How to avoid:** Use a separate query function (`getEstimateTemplateSettings`) that selects the template columns directly. Do NOT extend `getCachedCompany` — that cached shape is consumed by layout/sidebar and should remain minimal.
**Warning signs:** All 4 form fields are blank on page load even after saving values.

### Pitfall 3: Saving empty string instead of null loses default fallback
**What goes wrong:** User clears a field and saves. The action stores `''` (empty string) in the DB. On next load, `template.greeting ?? TEMPLATE_DEFAULTS.greeting` does NOT apply the default because `''` is not `null`. Phase 25 then renders an empty greeting.
**Why it happens:** Form `defaultValues` uses `''` for uncontrolled textarea; submit handler passes raw string value.
**How to avoid:** In the server action, convert empty strings to `null` before the DB update:
```typescript
estimate_template_greeting: data.greeting || null,
```
The `|| null` pattern is already used in `lib/actions/settings.ts` for all nullable text fields.
**Warning signs:** Clearing a field and saving causes that section to disappear in the Phase 25 plain-text output instead of showing the default.

### Pitfall 4: router.refresh() omitted after successful save
**What goes wrong:** Form saves successfully (toast appears) but if the user navigates away and back, the page still shows the pre-save values because the server component is not re-rendered.
**Why it happens:** `revalidatePath` on the server side only schedules the invalidation; the client RSC needs a `router.refresh()` call to re-fetch.
**How to avoid:** In the client form's success handler, call `router.refresh()` after the toast. Pattern from STATE.md: "useTransition + server action + toast (sonner) + router.refresh() for form saves."
**Warning signs:** Toast shows "Saved" but page still shows old values after navigation.

### Pitfall 5: Migration filename collision
**What goes wrong:** Migration fails to apply because another migration uses the same timestamp prefix.
**Why it happens:** The latest migration is `20260506000001_phase19_price_book.sql`. The CONTEXT.md specifies `20260508000001` for Phase 24 — this is safe as no migration for 20260507 or 20260508 exists yet.
**How to avoid:** Verify the migrations directory has no `20260508*` file before creating the new one. Confirmed: no such file exists as of research date.
**Warning signs:** `supabase db push` reports "migration already applied" or conflict error.

### Pitfall 6: Variable substitution silently drops unknown variables
**What goes wrong:** A user types `{phone_number}` in a template field. The substitute function silently leaves it as-is or drops it without warning.
**Why it happens:** The regex only replaces known variables; unrecognized patterns remain in the output string.
**How to avoid:** This is acceptable behavior for Phase 24 — the settings page lists valid variables as static helper text. Document the behavior in the utility: unknown variables are passed through unchanged. Phase 25 may add UI validation if needed.
**Warning signs:** None for Phase 24; the behavior is correct by design.

---

## Code Examples

### Migration SQL
```sql
-- Source: supabase/migrations/20260508000001_phase24_estimate_templates.sql
-- Phase 24: Estimate Template Engine + Settings Page
-- Adds 4 nullable TEXT columns to companies for per-company plain-text estimate templates.
-- NULL = use app default (resolved at render time in lib/utils/estimate-template.ts, not here).

ALTER TABLE companies
  ADD COLUMN estimate_template_greeting  TEXT,
  ADD COLUMN estimate_template_opener    TEXT,
  ADD COLUMN estimate_template_closer    TEXT,
  ADD COLUMN estimate_template_signature TEXT;

COMMENT ON COLUMN companies.estimate_template_greeting IS
  'Plain-text estimate greeting line. NULL = use app default.';
COMMENT ON COLUMN companies.estimate_template_opener IS
  'Plain-text estimate opening paragraph. NULL = use app default.';
COMMENT ON COLUMN companies.estimate_template_closer IS
  'Plain-text estimate closing paragraph. NULL = use app default.';
COMMENT ON COLUMN companies.estimate_template_signature IS
  'Plain-text estimate signature block. NULL = use app default.';
```

**No RLS changes needed:** The `companies` table already has RLS policies covering `SELECT`, `INSERT`, `UPDATE`, `DELETE` for authenticated users scoped to `user_id`. Adding columns to an RLS-enabled table does not require new policies — existing UPDATE policy already covers any column on the row.

### Apply migration command (from STATE.md pattern)
```bash
bunx supabase db push --db-url {DATABASE_URL}
```

### useTransition form submit pattern (from defaults-form.tsx)
```typescript
// Source: components/settings/defaults-form.tsx
const [isPending, startTransition] = useTransition()
const router = useRouter()

function onSubmit(values: EstimateTemplateFormValues) {
  startTransition(async () => {
    const result = await saveEstimateTemplate({
      greeting: values.greeting || null,
      opener: values.opener || null,
      closer: values.closer || null,
      signature: values.signature || null,
    })
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Template saved.')
      router.refresh()
    }
  })
}
```

### Optional preview (Claude's discretion — lightweight concatenation only)
```tsx
// Read-only preview: assemble the 4 fields using TEMPLATE_DEFAULTS as fallback
// No Phase 25 render engine — just static concatenation for settings UX
const previewLines = [
  form.watch('greeting') || TEMPLATE_DEFAULTS.greeting,
  '',
  form.watch('opener') || TEMPLATE_DEFAULTS.opener,
  '',
  '[ Items and totals will appear here ]',
  '',
  form.watch('closer') || TEMPLATE_DEFAULTS.closer,
  '',
  form.watch('signature') || TEMPLATE_DEFAULTS.signature,
].join('\n')

// Render:
// <pre className="whitespace-pre-wrap text-sm text-muted-foreground bg-muted rounded-md p-4">{previewLines}</pre>
```
This is lightweight and valuable. Recommend including it.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Type-generate DB types | Manually maintained interface (confirmed: no lib/database.types.ts) | Phase 19 — noted in SUMMARY | Must manually add new columns to CompanySettings interface |
| `getSession()` for auth | `getClaims()` with JWT validation | Phase 01 | All server actions use `supabase.auth.getClaims()` |
| Import zodResolver directly | Cast as `Resolver<T>` to satisfy react-hook-form types | Phase 02 | `zodResolver(schema) as Resolver<FormValues>` pattern in all forms |

---

## Open Questions

1. **Should `getEstimateTemplateSettings` be in `lib/queries/company.ts` or a new `lib/queries/estimate-template.ts`?**
   - What we know: `lib/queries/company.ts` already has `getCompanySettings` returning all settings. Other settings pages use `getCachedCompany` from `lib/queries/auth.ts`.
   - What's unclear: Whether to co-locate with company queries or create a new module.
   - Recommendation: Add to `lib/queries/company.ts` as `getEstimateTemplateSettings(supabase, userId)` — the function is small and thematically belongs with company queries. Keeps the `lib/queries/` directory flat.

2. **Should the action go in `lib/actions/estimate-template.ts` or `lib/actions/settings.ts`?**
   - What we know: `lib/actions/settings.ts` has `updateDefaults`, `updateNotifications`, `updateCompanySettings` — all company table updates. `lib/actions/price-book.ts` is a separate file for the price book table.
   - What's unclear: Template columns are on the `companies` table (like defaults/notifications), but the action is for a separate sub-route.
   - Recommendation: New file `lib/actions/estimate-template.ts` — keeps settings.ts from growing unbounded and gives Phase 25 a clear import target.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest with jsdom |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/utils/estimate-template.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAINTEXT-03 | `resolveTemplate` with NULL fields uses defaults | unit | `npx vitest run tests/unit/utils/estimate-template.test.ts` | Wave 0 gap |
| PLAINTEXT-03 | `resolveTemplate` with stored values uses stored values | unit | `npx vitest run tests/unit/utils/estimate-template.test.ts` | Wave 0 gap |
| PLAINTEXT-03 | Variable substitution replaces all 5 variables | unit | `npx vitest run tests/unit/utils/estimate-template.test.ts` | Wave 0 gap |
| PLAINTEXT-03 | Empty string fields treated as NULL (use default) | unit | `npx vitest run tests/unit/utils/estimate-template.test.ts` | Wave 0 gap |
| PLAINTEXT-05 | Settings page renders 4 textarea fields | smoke/manual | Navigate to `/settings/estimate-templates` | — |
| PLAINTEXT-05 | Save persists to DB and survives refresh | smoke/manual | Save form, refresh page, verify values | — |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/utils/estimate-template.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/utils/estimate-template.test.ts` — covers PLAINTEXT-03 (pure utility unit tests, no mocks needed)

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `app/(app)/settings/page.tsx`, `app/(app)/settings/price-book/page.tsx`, `app/(app)/settings/appearance/page.tsx`, `app/(app)/settings/appearance/loading.tsx`, `app/(app)/settings/price-book/loading.tsx`
- Direct codebase inspection — `components/settings/defaults-form.tsx`, `components/settings/settings-tabs.tsx`
- Direct codebase inspection — `lib/queries/company.ts`, `lib/queries/auth.ts`, `lib/actions/settings.ts`, `lib/actions/price-book.ts`, `lib/actions/theme.ts`
- Direct codebase inspection — `supabase/migrations/20260409000001_initial_schema.sql`, `supabase/migrations/20260506000001_phase19_price_book.sql`
- Direct codebase inspection — `lib/schemas/price-book.ts`, `lib/utils/format.ts`
- Direct codebase inspection — `vitest.config.ts`, `.planning/config.json`
- `24-CONTEXT.md` — locked decisions D-01 through D-05

### Secondary (MEDIUM confidence)
- None required — all patterns verified directly from codebase

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed from direct codebase inspection; no new packages
- Architecture: HIGH — all patterns directly observed in price-book, defaults-form, and settings page
- Pitfalls: HIGH — derived from existing code + explicit STATE.md warnings (e.g. revalidateTag cast, router.refresh pattern, || null for nullable fields)
- Utility design: HIGH — pure function with no external dependencies; behavior fully determinable from spec

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (stable patterns; only invalidated if Next.js App Router or Supabase JS major version bumps)
