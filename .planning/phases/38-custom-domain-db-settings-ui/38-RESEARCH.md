# Phase 38: Custom Domain DB + Settings UI - Research

**Researched:** 2026-05-10
**Domain:** Supabase schema migration, Next.js settings sub-page pattern, hostname validation, DNS/CNAME instructions
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOMAIN-01 | Owner can enter and save a custom domain for their company from the settings page | Settings sub-page pattern fully mapped (Phase 24 template); server action pattern via `lib/actions/estimate-template.ts` |
| DOMAIN-02 | After entering a domain, the owner sees DNS/CNAME setup instructions explaining what record to configure (pointing to Vercel) | Vercel CNAME target confirmed as `cname.vercel-dns-0.com` for subdomains; A-record target confirmed as `76.76.21.21` for apex; instruction UI is a static Card shown after successful save |
| DOMAIN-05 | Companies without a custom domain configured continue to receive share links on xtimator.com — no regression | Column is nullable TEXT with no DEFAULT; NULL companies are unchanged; Phase 39 will read the column but Phase 38 adds no routing logic |

</phase_requirements>

---

## Summary

Phase 38 adds a `custom_domain TEXT` nullable column to the `companies` table and surfaces a settings sub-page at `/settings/custom-domain` where owners can enter and save a subdomain. After saving, the page renders DNS/CNAME instructions they can follow to point their subdomain at Vercel. Companies that never touch this page remain completely unaffected — the column is NULL and all existing behavior is preserved.

The codebase has a mature, repeatable pattern for this type of settings sub-page, established in Phase 24 (Estimate Templates) and Phase 20 (Price Book). The work decomposes cleanly into: (1) migration, (2) server action + zod schema, (3) client form component + DNS instructions card, (4) settings sub-page + entry card on `/settings`.

The only non-trivial decision is the Vercel CNAME target value to show in the instructions. Research confirms the authoritative value is `cname.vercel-dns-0.com` for subdomains and `76.76.21.21` for apex domains, sourced directly from Vercel's official CLI documentation (last updated 2026-02-26).

**Primary recommendation:** Follow the Phase 24 pattern exactly — one migration file, one server action file, one form component, one sub-page. Keep the column name `custom_domain` on `companies`. Show static DNS instructions card below the form after a domain is saved.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | (existing) | Hostname validation schema | Project standard; all form schemas use zod |
| react-hook-form + zodResolver | (existing) | Form state + validation | Project standard across all settings forms |
| shadcn/ui (Card, Form, Input, Button) | (existing) | UI components | Project standard (D-09 locked) |
| Supabase JS v2 | (existing) | DB update in server action | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner (toast) | (existing) | Success/error feedback | Standard toast pattern across all forms |
| lucide-react | (existing) | Icons in settings entry card | Globe icon for custom domain entry |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Settings sub-page (new route) | Inline card on `/settings` page | Sub-page matches established pattern from Phase 24; inline would work but breaks pattern consistency |
| Static DNS instructions card | Live DNS check API | Out of scope per REQUIREMENTS.md: "v1 provides instructions only, no live check" |

**Installation:** No new packages needed — all dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure
```
app/(app)/settings/custom-domain/
├── page.tsx               # Server component: fetch company, render form

lib/
├── actions/
│   └── custom-domain.ts   # Server action: saveCustomDomain
├── schemas/
│   └── custom-domain.ts   # Zod schema: customDomainSchema
├── queries/
│   └── company.ts         # Extend: add getCustomDomainSettings()

components/settings/
└── custom-domain-form.tsx  # 'use client' form + DNS instructions card

supabase/migrations/
└── 20260510000001_phase38_custom_domain.sql
```

### Pattern 1: Settings Sub-Page (Phase 24 model)

**What:** Server component page fetches narrow query (only `custom_domain` + `id`), passes to client form component.
**When to use:** Any settings sub-section with a saved field on `companies`.

Server page (mirrors `estimate-templates/page.tsx`):
```typescript
// app/(app)/settings/custom-domain/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims } from '@/lib/queries/auth'
import { getCustomDomainSettings } from '@/lib/queries/company'
import { CustomDomainForm } from '@/components/settings/custom-domain-form'

export const metadata = { title: 'Custom Domain' }

export default async function CustomDomainPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const supabase = await createClient()
  const settings = await getCustomDomainSettings(supabase, claims.sub as string)
  if (!settings) redirect('/onboarding')

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Custom Domain</h1>
        <p className="text-sm text-muted-foreground">
          Serve estimate share links from your own domain instead of xtimator.com.
        </p>
      </div>
      <CustomDomainForm settings={settings} />
    </div>
  )
}
```

### Pattern 2: Narrow Query Function (Phase 24 model)

**What:** Focused SELECT that fetches only the columns needed for this settings page — not `getCompanySettings` which pulls `select('*')`.
**When to use:** All settings sub-pages (see STATE.md decision: "Use getEstimateTemplateSettings not getCachedCompany for settings sub-pages").

```typescript
// lib/queries/company.ts — add:
export async function getCustomDomainSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; custom_domain: string | null } | null> {
  const { data } = await supabase
    .from('companies')
    .select('id, custom_domain')
    .eq('user_id', userId)
    .single()
  return data ?? null
}
```

### Pattern 3: Server Action (Phase 24 model)

**What:** `'use server'` file with duplicated `getAuthContext()` per-file convention (STATE.md Phase 20), returns `{ success: true } | { error: string }`.

```typescript
// lib/actions/custom-domain.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { customDomainSchema } from '@/lib/schemas/custom-domain'

async function getAuthContext() { /* duplicate per-file convention */ }

export async function saveCustomDomain(
  data: { custom_domain: string | null }
): Promise<{ success: true } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error as string }
  const { supabase, company } = ctx

  const { error } = await supabase
    .from('companies')
    .update({ custom_domain: data.custom_domain || null })
    .eq('id', company.id)

  if (error) return { error: 'Failed to save domain. Please try again.' }

  ;(revalidateTag as any)('company')
  revalidatePath('/settings/custom-domain')
  return { success: true }
}
```

### Pattern 4: Zod Hostname Schema

**What:** Validates that the entered value looks like a valid subdomain/hostname — no protocol prefix, no trailing slash, no path components.

```typescript
// lib/schemas/custom-domain.ts
import { z } from 'zod'

// Accepts: estimates.mycompany.com  OR  mycompany.com
// Rejects: https://estimates.mycompany.com  |  mycompany.com/path  |  empty
const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/

export const customDomainSchema = z.object({
  custom_domain: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine(
      (val) => !val || hostnameRegex.test(val),
      { message: 'Enter a valid hostname (e.g. estimates.mycompany.com). No http:// prefix.' }
    ),
})

export type CustomDomainFormValues = z.infer<typeof customDomainSchema>
```

### Pattern 5: Entry Card on `/settings` (Phase 24 model)

**What:** `<Link href="/settings/custom-domain">` wrapped Card with Globe icon, placed below Estimate Templates card.

```typescript
// app/(app)/settings/page.tsx — add after Estimate Templates Link:
import { Globe } from 'lucide-react'
// ...
<Link href="/settings/custom-domain" ...>
  <Card ...>
    <CardHeader ...>
      <Globe className="mt-0.5 h-5 w-5 text-muted-foreground" />
      <div>
        <CardTitle>Custom Domain</CardTitle>
        <CardDescription>
          Serve estimates from your own domain (e.g., estimates.mycompany.com).
        </CardDescription>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
  </Card>
</Link>
```

### Pattern 6: DNS Instructions Card (shown after domain is saved)

**What:** A static info Card rendered when `settings.custom_domain` is truthy. Shows the CNAME record to add.

```tsx
{settings.custom_domain && (
  <Card className="w-full rounded-[var(--radius-md)]">
    <CardHeader className="border-b border-border">
      <CardTitle>DNS Setup Instructions</CardTitle>
      <CardDescription>
        Add the following DNS record at your domain registrar.
      </CardDescription>
    </CardHeader>
    <CardContent className="py-6 space-y-4">
      <div className="rounded-md bg-muted p-4 text-sm font-mono space-y-1">
        <p><span className="text-muted-foreground">Type:</span> CNAME</p>
        <p><span className="text-muted-foreground">Name:</span> {subdomain_part}</p>
        <p><span className="text-muted-foreground">Value:</span> cname.vercel-dns-0.com</p>
        <p><span className="text-muted-foreground">TTL:</span> Auto / 3600</p>
      </div>
      <p className="text-sm text-muted-foreground">
        DNS changes can take up to 24–48 hours to propagate.
        Vercel automatically provisions an SSL certificate once the record resolves.
      </p>
    </CardContent>
  </Card>
)}
```

**Note on CNAME target:** Vercel's official CLI docs (last updated 2026-02-26) show `cname.vercel-dns-0.com` as the CNAME value for subdomains. However, per Vercel's docs: *"Your project may have specific values. Run `vercel domains inspect` to see the exact records recommended for your domain."* The instructions shown in the UI should direct owners to also confirm via their Vercel dashboard if needed. For a simple subdomain case, `cname.vercel-dns-0.com` is the general-purpose value.

**Apex domain note:** For users who enter an apex domain (e.g., `mycompany.com` with no subdomain), the record type is A pointing to `76.76.21.21`. The UI should handle both cases by detecting whether the input contains a subdomain.

### Anti-Patterns to Avoid

- **Don't use `getCompanySettings` or `getCachedCompany` in the sub-page** — use `getCustomDomainSettings` (focused query). This is a documented decision from Phase 24: "Use getEstimateTemplateSettings not getCachedCompany for settings sub-pages."
- **Don't add a DEFAULT clause in the migration** — NULL is intentional initial state (same as Phase 24). Existing companies stay NULL = no domain.
- **Don't store `https://` prefix** — validate/strip protocol before storing; CNAME records use bare hostnames.
- **Don't regenerate `database.types.ts`** — manually extend it after migration (same as Phase 24 pattern, documented in STATE.md).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hostname validation | Custom parser | Zod `.refine()` with `hostnameRegex` | Handles edge cases (empty, protocol prefix, trailing slash, invalid TLD) |
| Toast notifications | Custom alert | `sonner` toast | Project standard; already wired |
| Form state + error display | Manual state | react-hook-form + zodResolver | Project standard across all settings forms |

---

## Common Pitfalls

### Pitfall 1: Using `select('*')` in the page query
**What goes wrong:** Pulls all company fields into RSC payload unnecessarily.
**Why it happens:** Reusing `getCompanySettings` instead of creating a focused query.
**How to avoid:** Create `getCustomDomainSettings()` that selects only `id, custom_domain` — mirrors `getEstimateTemplateSettings()` pattern.
**Warning signs:** If you see `select('*')` in the new page.tsx file.

### Pitfall 2: Storing URL with protocol prefix
**What goes wrong:** User types `https://estimates.mycompany.com`; stored value breaks CNAME lookup display and Phase 39 host matching.
**Why it happens:** No validation strips protocol before save.
**How to avoid:** Zod `refine()` rejects input containing `://`. Alternatively strip in server action with `value.replace(/^https?:\/\//i, '')` before storing.
**Warning signs:** Value in DB contains `://`.

### Pitfall 3: DNS instructions shown before first save
**What goes wrong:** User sees CNAME instructions for a null domain on first page load.
**Why it happens:** Instructions card rendered without checking for truthy `custom_domain`.
**How to avoid:** Wrap instructions card in `{savedDomain && (...)}` — only render once a domain value exists in DB.

### Pitfall 4: `database.types.ts` not manually extended
**What goes wrong:** TypeScript errors when accessing `company.custom_domain` because the generated types don't include the new column.
**Why it happens:** Type generation requires Docker (unavailable on Windows — see STATE.md Phase 19). Migration applies to DB but types file is not auto-regenerated.
**How to avoid:** After migration, manually add `custom_domain: string | null` to the `companies` row type in `lib/database.types.ts` — same pattern as Phase 24.

### Pitfall 5: Apex vs subdomain detection in DNS instructions
**What goes wrong:** User enters `mycompany.com` (apex); instructions show CNAME record, which is wrong (apex domains can't use CNAME per DNS spec).
**Why it happens:** Instructions only handle CNAME case.
**How to avoid:** Detect apex by counting dots — if `custom_domain` has exactly one dot (e.g., `example.com`), show A record (`76.76.21.21`); otherwise show CNAME (`cname.vercel-dns-0.com`). Most users will enter subdomains (`estimates.mycompany.com`) but the instructions should handle both.

### Pitfall 6: `revalidateTag('company')` TypeScript cast
**What goes wrong:** TypeScript error on `revalidateTag` call.
**Why it happens:** Known issue in project — Next.js type signature mismatch.
**How to avoid:** Use the established cast: `;(revalidateTag as any)('company')` — mirrors pattern in `lib/actions/estimate-template.ts` line 47.

---

## Code Examples

### Migration SQL
```sql
-- supabase/migrations/20260510000001_phase38_custom_domain.sql
-- Phase 38: Custom Domain DB + Settings UI
-- Adds nullable custom_domain column to companies for per-company subdomain routing.
-- NULL = no custom domain configured; all existing behavior unchanged (DOMAIN-05).
-- No DEFAULT clause — NULL is intentional initial state (same pattern as Phase 24).

ALTER TABLE companies
  ADD COLUMN custom_domain TEXT;

COMMENT ON COLUMN companies.custom_domain IS
  'Custom subdomain for white-label estimate sharing (e.g. estimates.mycompany.com). NULL = use xtimator.com.';
```

### database.types.ts extension (manual — no Docker)
```typescript
// lib/database.types.ts — add to companies Row type:
custom_domain: string | null
// Add to Insert and Update types too (both optional):
custom_domain?: string | null
```

### Apply migration
```bash
bunx supabase db push --db-url "$DATABASE_URL"
```

---

## Runtime State Inventory

This is a schema addition + UI phase, not a rename/refactor. No runtime state inventory required.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase DB connection | Migration | Available (existing) | — | — |
| `bunx supabase` CLI | `db push` | Available (established pattern since Phase 1) | — | — |

No external dependencies beyond what is already established. All UI libraries, form libraries, and DB clients are already installed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + jsdom |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOMAIN-01 | `saveCustomDomain` stores valid hostname, rejects invalid hostname | unit | `npx vitest run tests/unit/custom-domain-action.test.ts -x` | No — Wave 0 |
| DOMAIN-01 | `customDomainSchema` validates hostname correctly | unit | `npx vitest run tests/unit/schemas/custom-domain.test.ts -x` | No — Wave 0 |
| DOMAIN-02 | DNS instructions card renders when domain is set | unit (component) | `npx vitest run tests/unit/components/custom-domain-form.test.tsx -x` | No — Wave 0 |
| DOMAIN-05 | `getCustomDomainSettings` returns null custom_domain for company without domain | unit | included in action test | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/custom-domain-action.test.ts tests/unit/schemas/custom-domain.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/custom-domain-action.test.ts` — covers DOMAIN-01 save + validation path
- [ ] `tests/unit/schemas/custom-domain.test.ts` — covers hostname regex accept/reject cases

*(Shared fixtures in `tests/setup/load-env.ts` already exist — no new fixture setup needed)*

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual type regen via Docker | Manual extension of `database.types.ts` | Phase 19 | Must manually add column to Row/Insert/Update types |
| Inline getAuthContext | Per-file duplicate getAuthContext | Phase 3 | Convention — do not extract to shared module |

---

## Open Questions

1. **Apex domain vs subdomain in DNS instructions**
   - What we know: Most users will enter a subdomain (`estimates.mycompany.com`). CNAME `cname.vercel-dns-0.com` is correct for subdomains. Apex domains need an A record (`76.76.21.21`) per Vercel docs.
   - What's unclear: Whether we should detect apex vs subdomain and show different instructions, or just show both record types always.
   - Recommendation: Detect by dot count at render time — if `custom_domain.split('.').length === 2` (e.g., `foo.com`), show A record instructions; otherwise show CNAME. Keep it simple.

2. **Vercel CNAME target precision**
   - What we know: Official Vercel CLI docs (2026-02-26) show `cname.vercel-dns-0.com` as the general-purpose CNAME for subdomains. Some project-specific CNAME targets follow a different pattern (e.g., `d1d4fc829fe7bc7c.vercel-dns-017.com`).
   - What's unclear: Whether the Xtimator Vercel project has a project-specific CNAME target that differs from the general one.
   - Recommendation: Use `cname.vercel-dns-0.com` as shown in official docs, AND add a note in the UI instructing owners to confirm via their Vercel project's Domains settings. This is low risk since the general value works for most deployments.

3. **Where Phase 39 reads `custom_domain`**
   - What we know: Phase 39 needs to detect the custom host in `proxy.ts` and resolve the company by matching `custom_domain` column.
   - What's unclear: Whether a DB index on `custom_domain` is worth adding in Phase 38.
   - Recommendation: Add `CREATE INDEX` on `companies(custom_domain)` in the Phase 38 migration since Phase 39 will query by this column. Negligible cost now, avoids a follow-up migration.

---

## Sources

### Primary (HIGH confidence)
- Vercel official CLI docs — https://vercel.com/docs/domains/set-up-custom-domain (last updated 2026-02-26): CNAME target `cname.vercel-dns-0.com`, A record `76.76.21.21`
- Project codebase: `app/(app)/settings/estimate-templates/page.tsx`, `lib/actions/estimate-template.ts`, `lib/queries/company.ts`, `lib/schemas/estimate-template.ts` — Phase 24 reference implementation
- Project codebase: `app/(app)/settings/page.tsx` — entry card grid pattern
- Project codebase: `supabase/migrations/20260508000001_phase24_estimate_templates.sql` — exact migration pattern
- Project STATE.md — documented decisions: per-file getAuthContext, focused query for sub-pages, manual database.types.ts extension, revalidateTag cast

### Secondary (MEDIUM confidence)
- WebSearch: Vercel CNAME targets — confirmed `cname.vercel-dns-0.com` appears consistently across multiple sources

---

## Project Constraints (from CLAUDE.md)

- **Tech Stack**: Next.js 14+ App Router, TypeScript strict, Tailwind CSS, shadcn/ui, react-hook-form + zod — all required; no new UI libraries
- **Database**: Supabase PostgreSQL with RLS on all tables — migration must use `bunx supabase db push --db-url`; RLS inherited automatically for new column
- **Security**: Service role key never exposed to browser; all DB writes via server actions
- **Mobile**: Not directly applicable for a settings form, but all inputs must be mobile-friendly (44px min tap targets)
- **GSD Workflow**: All file changes through GSD phase execution only

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing libraries, no new dependencies
- Architecture: HIGH — direct clone of Phase 24 pattern from live codebase
- DNS instructions: MEDIUM — `cname.vercel-dns-0.com` from official Vercel docs but project-specific value may differ; mitigation is to include a note directing owners to confirm in Vercel dashboard
- Pitfalls: HIGH — all derived from documented project decisions in STATE.md

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (stable domain — Vercel DNS targets rarely change)
