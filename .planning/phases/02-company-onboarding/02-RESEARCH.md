# Phase 2: Company Onboarding - Research

**Researched:** 2026-04-10
**Domain:** Multi-step onboarding wizard, Supabase Storage uploads, react-hook-form multi-step forms
**Confidence:** HIGH

## Summary

Phase 2 builds a 3-step onboarding wizard at `/onboarding` that collects company info, brand identity (industry + color + logo), and address/defaults. The existing codebase already has all infrastructure in place: the `companies` table with all columns, the `logos` Storage bucket with RLS policies, Supabase client wrappers, and established patterns for react-hook-form + zod validation. The primary implementation challenge is orchestrating a multi-step form where state persists across steps and logo upload happens client-side to Supabase Storage before form submission.

The onboarding page placeholder already exists at `app/onboarding/page.tsx` with auth gating via `getClaims()`. The `AuthCard` component provides a visual reference for the centered card pattern, though the onboarding card needs to be wider (600px vs 400px). The UI spec is comprehensive with exact copy, colors, accessibility requirements, and interaction contracts.

**Primary recommendation:** Build the wizard as a single client component with step state managed via React useState, a unified zod schema split across 3 steps, and logo upload via the browser-side Supabase client directly to Storage. Use a server action for the final company insert/update.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Single page with stepper -- all 3 steps on one `/onboarding` page. Content swaps with animated transitions. Step indicator bar at top shows progress.
- D-02: Wider card (~600px max-width) instead of the 400px AuthCard.
- D-03: "Skip for now" skips the ENTIRE wizard -- goes straight to `/dashboard`. A minimal `companies` row is created with just `user_id` (and company name if provided). No per-step skip.
- D-04: Back + Next navigation on every step. Step 1 has only Next. Steps 2-3 have Back + Next. Step 3's forward button says "Complete Setup". Stepper dots are also clickable for direct jump.
- D-05: App logo + "EstimateBuilder Pro" wordmark appears above the wizard card (consistent with auth pages).
- D-06: Industry presented as an icon card grid (2x4 or responsive grid). Each card has a Lucide icon + label. Tap to select, selected card gets highlight border.
- D-07: 9th "Other" card option -- selecting it reveals a text input to type a custom industry.
- D-08: Brand color picker uses a preset palette of 8-12 curated brand-safe colors shown as swatches, plus a "Custom" option that opens a hex input.
- D-09: Logo upload appears in Step 2 (brand identity step).
- D-10: Avatar circle pattern -- large circular placeholder showing company initial or generic icon. Click/tap to upload. After upload, shows preview in the circle with Change/Remove actions.
- D-11: Accepted formats: PNG, JPG. Max size: 2MB. Upload goes to Supabase Storage `logos` bucket with company-scoped path.
- D-12: Step 1 (Business Info): Only company name is required. Owner name, phone, email, website are all optional.
- D-13: Step 3 (Address & Defaults): Pre-filled with sensible defaults -- tax rate 0%, payment terms "Net 30", warranty "1 year", validity 30 days.
- D-14: Validation fires on blur (field-level) and on Next/Complete button click (form-level). Inline error messages under the field. Uses react-hook-form + zod.

### Claude's Discretion
- Exact animation/transition between steps (slide, fade, etc.)
- Specific Lucide icons for each industry card
- Exact preset color palette (8-12 brand-safe colors)
- Step indicator design (dots, numbered circles, or progress bar)
- Whether company initial in avatar placeholder uses first letter or two letters

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ONBOARD-01 | Multi-step wizard collects business info (name, owner name, phone, email, website) | Step 1 form with zod schema; company name required, rest optional. react-hook-form pattern established in auth forms. |
| ONBOARD-02 | User selects industry from INDUSTRIES config (8 options) | INDUSTRIES constant with 8 industries + "Other". Icon card grid with radiogroup semantics. |
| ONBOARD-03 | User picks brand primary color via color picker | 10 preset swatches + custom hex input. Stored in `companies.brand_primary_color` column. |
| ONBOARD-04 | User can upload company logo (stored in Supabase Storage) | Browser-side upload via `createClient()` from `lib/supabase/client.ts` to `logos` bucket. RLS policies already exist. |
| ONBOARD-05 | User can enter business address, license number, insurance info | Step 3 form fields; all optional. Maps to `companies.address/city/state/zip/license_number/insurance_info`. |
| ONBOARD-06 | User sets default tax rate, payment terms, and warranty terms | Step 3 with pre-filled defaults (0%, Net 30, 1 year, 30 days). Maps to `companies.default_*` columns. |
| ONBOARD-07 | After onboarding, user is redirected to main dashboard | Server action completes insert then `redirect('/dashboard')`. |
| ONBOARD-08 | Onboarding can be skipped and completed later via Settings | "Skip for now" creates minimal company row. Settings (Phase 7) will reuse same form fields. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-hook-form | ^7.72.1 | Form state management across wizard steps | Already installed, used in auth forms. Supports per-field validation, mode: "onBlur". |
| zod | ^4.3.6 | Schema validation for all form fields | Already installed, paired with @hookform/resolvers. |
| @hookform/resolvers | ^5.2.2 | Connects zod schemas to react-hook-form | Already installed, zodResolver pattern established. |
| @supabase/supabase-js | ^2.103.0 | Storage uploads (client-side) and DB operations (server-side) | Already installed. Browser client for Storage, server client for DB writes. |
| lucide-react | ^1.8.0 | Industry card icons and UI icons | Already installed. Icons specified in UI spec. |
| sonner | ^2.0.7 | Toast notifications for upload errors and success | Already installed, Toaster configured. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next-themes | ^0.4.6 | Dark mode support | Already configured; onboarding card must work in both themes. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single useForm across all steps | Separate useForm per step | Single form is simpler -- just validate subsets of fields per step. No need to merge form state. |
| Client-side Storage upload | Server action upload | Client-side is simpler, avoids streaming file through server, RLS policies handle auth. |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
app/
  onboarding/
    page.tsx                    # Server component: auth gate + render client wizard
lib/
  industries.ts                 # INDUSTRIES constant, Industry type, project-type lists
  actions/
    company.ts                  # Server action: createOrUpdateCompany
components/
  onboarding/
    onboarding-wizard.tsx       # Main wizard client component (step state, form)
    onboarding-card.tsx         # Wider card variant of AuthCard (600px)
    step-indicator.tsx          # 3-step progress indicator
    step-business-info.tsx      # Step 1: company name, owner, phone, email, website
    step-brand-identity.tsx     # Step 2: industry selector, color picker, logo upload
    step-address-defaults.tsx   # Step 3: address, license, insurance, defaults
    industry-selector.tsx       # Icon card grid for industry selection
    color-picker.tsx            # Preset swatches + custom hex input
    logo-uploader.tsx           # Avatar circle with upload/preview/remove
```

### Pattern 1: Multi-Step Form with Single useForm
**What:** One react-hook-form instance manages all fields across 3 steps. Each step renders a subset of fields. Navigation validates only current step fields.
**When to use:** When steps share a single submission and data persists across back/forward navigation.
**Example:**
```typescript
// Unified schema
const onboardingSchema = z.object({
  // Step 1
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  ownerName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
  website: z.string().url("Please enter a valid website URL").optional().or(z.literal("")),
  // Step 2
  industry: z.string().optional(),
  customIndustry: z.string().optional(),
  brandPrimaryColor: z.string().default("#0D9488"),
  // Step 3
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  licenseNumber: z.string().optional(),
  insuranceInfo: z.string().optional(),
  defaultTaxRate: z.coerce.number().min(0).max(100).default(0),
  defaultPaymentTerms: z.string().default("Net 30"),
  defaultWarrantyTerms: z.string().default("1 year"),
  defaultValidityDays: z.coerce.number().default(30),
})

// Per-step field arrays for selective validation
const STEP_FIELDS = {
  1: ["companyName", "ownerName", "phone", "email", "website"],
  2: ["industry", "customIndustry", "brandPrimaryColor"],
  3: ["address", "city", "state", "zip", "licenseNumber", "insuranceInfo",
      "defaultTaxRate", "defaultPaymentTerms", "defaultWarrantyTerms", "defaultValidityDays"],
} as const

// Navigate forward with validation
async function handleNext() {
  const fieldsToValidate = STEP_FIELDS[currentStep]
  const isValid = await form.trigger(fieldsToValidate)
  if (isValid) setCurrentStep(prev => prev + 1)
}
```

### Pattern 2: Client-Side Supabase Storage Upload
**What:** Upload logo directly from browser to Supabase Storage using the anon-key client. RLS policies enforce company-scoped paths.
**When to use:** For file uploads where the authenticated user has direct Storage access via RLS.
**Example:**
```typescript
import { createClient } from '@/lib/supabase/client'

async function uploadLogo(file: File, companyId: string): Promise<string> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()
  const path = `${companyId}/logo.${ext}`

  const { error } = await supabase.storage
    .from('logos')
    .upload(path, file, { upsert: true })

  if (error) throw error

  const { data: { publicUrl } } = supabase.storage
    .from('logos')
    .getPublicUrl(path)

  return publicUrl
}
```

### Pattern 3: Server Action for Company Persistence
**What:** Server action inserts or upserts company record. Called on "Complete Setup" or "Skip for now".
**When to use:** For database mutations that need server-side auth validation.
**Example:**
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function createOrUpdateCompany(data: CompanyFormData) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('companies')
    .upsert({
      user_id: claims.sub,
      name: data.companyName || 'My Company',
      owner_name: data.ownerName || null,
      // ... all fields
    }, { onConflict: 'user_id' })

  if (error) return { error: 'Could not save your company details. Please check your connection and try again.' }
  redirect('/dashboard')
}
```

### Pattern 4: INDUSTRIES Config for Cross-Phase Reuse
**What:** Typed constant defining industries with associated project types, reusable in Phase 4's project creation wizard.
**When to use:** Shared configuration that multiple phases reference.
**Example:**
```typescript
// lib/industries.ts
export interface Industry {
  id: string
  label: string
  icon: string // Lucide icon component name
  projectTypes: string[]
}

export const INDUSTRIES: Industry[] = [
  {
    id: 'cleaning',
    label: 'Cleaning',
    icon: 'SprayCan',
    projectTypes: ['Deep Cleaning', 'Regular Maintenance', 'Move-In/Out', 'Post-Construction', 'Carpet Cleaning'],
  },
  {
    id: 'painting',
    label: 'Painting',
    icon: 'Paintbrush',
    projectTypes: ['Interior Painting', 'Exterior Painting', 'Cabinet Refinishing', 'Staining', 'Wallpaper'],
  },
  // ... 6 more industries
]
```

### Anti-Patterns to Avoid
- **Separate forms per step:** Creates complexity merging form state and loses data when navigating back. Use one form instance with per-step validation.
- **Uploading logo via server action:** Unnecessarily streams file through the Next.js server. Client-side Storage upload is direct and uses existing RLS policies.
- **Blocking on logo upload before proceeding:** Logo upload should be independent of step navigation. Upload can happen asynchronously; the URL is stored when complete.
- **Hardcoding industry list in the component:** Must be in a shared config file so Phase 4 project creation can import the same list.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation | Custom validation logic | zod + react-hook-form + zodResolver | Edge cases with email/URL validation, async validation, field-level vs form-level |
| File type/size validation | Custom file checks | HTML `accept` attribute + client-side size check before upload | Browser handles file picker filtering; just validate in JS before upload |
| Color validation | Custom hex parser | Regex `/^#[0-9A-Fa-f]{6}$/` | Simple pattern; no library needed |
| Step progress indicator | Custom progress component | Composable from shadcn Button/div + Lucide Check icon | No library needed for 3 steps |
| Toast notifications | Custom alert system | sonner (already configured) | Already set up in the project |

## Common Pitfalls

### Pitfall 1: Logo Upload Timing (Chicken-and-Egg)
**What goes wrong:** Logo uploads need a company-scoped path (`{company_id}/logo.png`), but the company record may not exist yet during onboarding.
**Why it happens:** The company row is created on "Complete Setup", but logo upload happens in Step 2.
**How to avoid:** Two approaches: (a) Create a minimal company row on page load or skip action, then use that ID for uploads; or (b) Upload to a temp path using the user's auth UID, then move/rename on company creation. Approach (a) is simpler -- upsert a minimal row with just `user_id` when the wizard mounts, capture the returned `id`, use it for Storage paths. The final "Complete Setup" does an UPDATE, not INSERT.
**Warning signs:** Upload fails with RLS error because the Storage policy checks `companies.user_id` match and the company row doesn't exist yet.

### Pitfall 2: Logos Bucket Visibility
**What goes wrong:** `logos` bucket is private (`public: false`). `getPublicUrl()` returns a URL but it won't be accessible without auth.
**Why it happens:** The migration creates the logos bucket with `public: false`.
**How to avoid:** Use `createSignedUrl()` for display, or change the bucket to public if logos should be visible on public estimate share pages (they will be -- per SHARE-03). Alternatively, store the Storage path (not URL) in `logo_url` and generate signed URLs at render time. The best approach for this project: since logos appear on public share pages (Phase 7), the bucket should be public. This may need a migration or Supabase dashboard change.
**Warning signs:** Logo preview works during upload (using object URL) but breaks after page reload.

### Pitfall 3: Zod Optional String Fields with Email/URL Validation
**What goes wrong:** `z.string().email().optional()` still fails when the field is an empty string `""`.
**Why it happens:** Empty string is not `undefined`, so `.optional()` doesn't skip validation.
**How to avoid:** Use `z.string().email().optional().or(z.literal(""))` or use `.transform()` to convert empty strings to undefined before validation.
**Warning signs:** User leaves email field empty, gets "invalid email" error.

### Pitfall 4: Form Mode for Blur Validation
**What goes wrong:** Validation only fires on submit, not on blur as required by D-14.
**Why it happens:** react-hook-form defaults to `mode: "onSubmit"`.
**How to avoid:** Set `mode: "onBlur"` in the useForm config. Combine with `trigger()` on step navigation.
**Warning signs:** User tabs through fields without seeing validation feedback.

### Pitfall 5: companies.name NOT NULL Constraint on Skip
**What goes wrong:** "Skip for now" tries to create a company row with NULL name, but the column is `NOT NULL`.
**Why it happens:** D-03 says skip creates a minimal row with just `user_id`.
**How to avoid:** Provide a default name like "My Company" or the user's email when skipping. The schema requires `name TEXT NOT NULL`.
**Warning signs:** Skip action fails with database constraint violation.

### Pitfall 6: Missing unique constraint on companies.user_id
**What goes wrong:** Upsert on `user_id` fails because there's no UNIQUE constraint on that column.
**Why it happens:** The migration creates `user_id UUID NOT NULL REFERENCES auth.users(id)` but does not add a UNIQUE constraint.
**How to avoid:** Check if a company exists first (SELECT), then INSERT or UPDATE accordingly. Or add a unique index in a new migration. The auth signIn action already does a SELECT check, so the pattern exists.
**Warning signs:** `upsert({ onConflict: 'user_id' })` throws an error at runtime.

## Code Examples

### Existing Auth Form Pattern (reference for consistency)
```typescript
// Source: app/(auth)/login/page.tsx
// Key patterns to replicate:
// 1. useTransition for isPending state
// 2. zodResolver(schema) in useForm
// 3. Form + FormField + FormItem + FormLabel + FormControl + FormMessage structure
// 4. min-h-[44px] on inputs for mobile touch targets (UX-02)
// 5. Loader2 spinner on submit button during pending
const form = useForm<LoginValues>({
  resolver: zodResolver(loginSchema),
  defaultValues: { email: '', password: '' },
})
```

### Supabase Storage Upload (client-side)
```typescript
// Source: Supabase docs + existing client.ts
import { createClient } from '@/lib/supabase/client'

// Upload with upsert to allow logo replacement
const { data, error } = await supabase.storage
  .from('logos')
  .upload(`${companyId}/logo.${ext}`, file, {
    cacheControl: '3600',
    upsert: true,
  })
```

### Server Action Pattern (established in Phase 1)
```typescript
// Source: lib/actions/auth.ts
// Key patterns:
// 1. 'use server' directive
// 2. getClaims() for auth validation (NOT getSession)
// 3. Return { error: string } on failure
// 4. redirect() on success (throws, does not return)
```

### OnboardingCard (wider AuthCard variant)
```typescript
// Adapt from components/auth/auth-card.tsx
// Changes: max-w-[600px] instead of max-w-[400px], add StepIndicator in card header
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 + jsdom |
| Config file | `vitest.config.ts` |
| Quick run command | `bun test` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ONBOARD-01 | Wizard collects business info fields | unit | `bun test tests/unit/onboarding-schema.test.ts -t "step 1"` | Wave 0 |
| ONBOARD-02 | Industry selection from INDUSTRIES config | unit | `bun test tests/unit/industries.test.ts` | Wave 0 |
| ONBOARD-03 | Brand color picker stores valid hex | unit | `bun test tests/unit/onboarding-schema.test.ts -t "color"` | Wave 0 |
| ONBOARD-04 | Logo upload to Storage | manual-only | N/A (requires Supabase connection) | N/A |
| ONBOARD-05 | Address/license/insurance fields accepted | unit | `bun test tests/unit/onboarding-schema.test.ts -t "step 3"` | Wave 0 |
| ONBOARD-06 | Default tax/payment/warranty terms | unit | `bun test tests/unit/onboarding-schema.test.ts -t "defaults"` | Wave 0 |
| ONBOARD-07 | Redirect to dashboard after completion | manual-only | N/A (requires server action + redirect) | N/A |
| ONBOARD-08 | Skip creates minimal company row | unit | `bun test tests/unit/onboarding-schema.test.ts -t "skip"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/industries.test.ts` -- covers ONBOARD-02 (INDUSTRIES config structure, project types)
- [ ] `tests/unit/onboarding-schema.test.ts` -- covers ONBOARD-01, 03, 05, 06, 08 (zod schema validation)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getSession()` | `getClaims()` | Phase 1 decision | All auth checks must use getClaims() -- established pattern |
| Zustand localStorage (CLAUDE.md legacy) | Supabase database | Phase 1 migration | Company data stored in Supabase, not localStorage |
| formData-based server actions | react-hook-form + server action | Phase 1 auth forms | Validated data passed to server action via FormData |

## Open Questions

1. **Logos bucket public vs private**
   - What we know: Migration creates `logos` bucket as private. RLS policies exist for authenticated access.
   - What's unclear: Phase 7 needs logos visible on public share pages (SHARE-03). Private bucket means signed URLs expire.
   - Recommendation: For now, store the Storage path in `logo_url`. Defer public access decision to Phase 7. Use `createSignedUrl()` or object URLs for preview during onboarding.

2. **Unique constraint on companies.user_id**
   - What we know: No UNIQUE constraint exists. Upsert requires a unique/exclusion constraint.
   - What's unclear: Whether to add a migration now or use SELECT-then-INSERT/UPDATE pattern.
   - Recommendation: Use SELECT-then-INSERT/UPDATE pattern (matches existing auth.ts pattern). Adding a unique constraint migration is optional but clean -- can be included in Plan 01.

3. **Company ID availability for logo upload path**
   - What we know: Logo upload (Step 2) needs a company-scoped path, but company row may not exist yet.
   - What's unclear: Best approach to get company ID before final submission.
   - Recommendation: Create a minimal company row first (either on wizard mount or on Step 1 "Next"), then use the returned ID for Storage paths. Final submission does UPDATE.

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/20260409000001_initial_schema.sql` -- companies table schema, logos bucket, RLS policies
- `app/(auth)/login/page.tsx` -- react-hook-form + zod pattern, AuthCard usage
- `lib/actions/auth.ts` -- server action pattern, getClaims() usage
- `lib/supabase/client.ts` -- browser-side Supabase client for Storage uploads
- `.planning/phases/02-company-onboarding/02-CONTEXT.md` -- all locked decisions D-01 through D-14
- `.planning/phases/02-company-onboarding/02-UI-SPEC.md` -- complete UI contract (layout, colors, copy, accessibility)
- `package.json` -- all dependency versions verified from project

### Secondary (MEDIUM confidence)
- Supabase Storage upload API (`supabase.storage.from().upload()`) -- based on training data for supabase-js v2; API stable

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and used in Phase 1
- Architecture: HIGH - patterns directly adapted from existing auth forms and server actions
- Pitfalls: HIGH - identified from schema analysis (NOT NULL constraint, missing UNIQUE, private bucket)

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable -- no external dependencies changing)
