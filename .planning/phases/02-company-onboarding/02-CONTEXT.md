# Phase 2: Company Onboarding - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-step onboarding wizard that captures business identity (company info, industry, branding, address, defaults), uploads a company logo to Supabase Storage, and persists the `companies` row. After completion (or skip), user lands on `/dashboard`. The wizard can be skipped entirely; incomplete fields are editable later in Settings (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Wizard Layout & Flow
- **D-01:** Single page with stepper — all 3 steps on one `/onboarding` page. Content swaps with animated transitions. Step indicator bar at top shows progress (1/3, 2/3, 3/3).
- **D-02:** Wider card (~600px max-width) instead of the 400px AuthCard from Phase 1. More room for form fields, especially Step 3 with address + defaults.
- **D-03:** "Skip for now" skips the ENTIRE wizard — goes straight to `/dashboard`. A minimal `companies` row is created with just `user_id` (and company name if provided). No per-step skip.
- **D-04:** Back + Next navigation on every step. Step 1 has only Next. Steps 2-3 have Back + Next. Step 3's forward button says "Complete Setup". Stepper dots are also clickable for direct jump.
- **D-05:** App logo + "EstimateBuilder Pro" wordmark appears above the wizard card (consistent with auth pages).

### Industry Selector & Brand Picker
- **D-06:** Industry presented as an icon card grid (2x4 or responsive grid). Each card has a Lucide icon + label. Tap to select, selected card gets highlight border.
- **D-07:** 9th "Other" card option — selecting it reveals a text input to type a custom industry. Stored as a custom string in the `companies.industry` column.
- **D-08:** Brand color picker uses a preset palette of 8-12 curated brand-safe colors shown as swatches, plus a "Custom" option that opens a hex input. Most users pick a preset.

### Logo Upload
- **D-09:** Logo upload appears in Step 2 (brand identity step) alongside industry selector and color picker.
- **D-10:** Avatar circle pattern — large circular placeholder showing company initial or generic icon. Click/tap to upload. After upload, shows preview in the circle with Change/Remove actions.
- **D-11:** Accepted formats: PNG, JPG. Max size: 2MB. Upload goes to Supabase Storage `logos` bucket with company-scoped path.

### Form Density & Validation
- **D-12:** Step 1 (Business Info): Only company name is required. Owner name, phone, email, website are all optional.
- **D-13:** Step 3 (Address & Defaults): Pre-filled with sensible defaults — tax rate 0%, payment terms "Net 30", warranty "1 year", validity 30 days. Address fields and license/insurance are all optional.
- **D-14:** Validation fires on blur (field-level) and on Next/Complete button click (form-level). Inline error messages under the field. Uses react-hook-form + zod, consistent with Phase 1 auth forms.

### Step Content Summary
- **Step 1 — Business Info:** Company name (required), owner name, phone, email, website
- **Step 2 — Brand Identity:** Industry selector (icon cards + Other), brand primary color (presets + custom), logo upload (avatar circle)
- **Step 3 — Address & Defaults:** Business address (street, city, state, zip), license number, insurance info, default tax rate, payment terms, warranty terms

### Claude's Discretion
- Exact animation/transition between steps (slide, fade, etc.)
- Specific Lucide icons for each industry card
- Exact preset color palette (8-12 brand-safe colors)
- Step indicator design (dots, numbered circles, or progress bar)
- Whether company initial in avatar placeholder uses first letter or two letters

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — ONBOARD-01 through ONBOARD-08 define all onboarding requirements
- `.planning/PROJECT.md` — Tech stack constraints, Supabase project URL, key decisions

### Phase 1 Context
- `.planning/phases/01-foundation-auth/01-CONTEXT.md` — Auth page patterns (AuthCard, getClaims), shadcn/ui New York style, D-09 component set

### Database Schema
- `supabase/migrations/20260409000001_initial_schema.sql` — `companies` table with all columns already defined (name, owner_name, phone, email, website, address, city, state, zip, license_number, insurance_info, industry, brand_primary_color, logo_url, default_tax_rate, default_payment_terms, default_warranty_terms, default_validity_days)

### Existing Code
- `app/onboarding/page.tsx` — Current placeholder page to be replaced with wizard
- `components/auth/auth-card.tsx` — Visual reference for centered card pattern (wider version needed)
- `lib/supabase/server.ts` — Server-side Supabase client for API routes
- `lib/supabase/client.ts` — Browser-side Supabase client for Storage uploads

### Roadmap
- `.planning/ROADMAP.md` §Phase 2 — Plan descriptions, success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/auth/auth-card.tsx` — Centered card layout pattern (logo + wordmark above card). Can be adapted to wider onboarding variant.
- Full shadcn/ui component set installed: `form`, `input`, `select`, `card`, `button`, `tabs`, `progress`, `avatar`, `radio-group`, `switch`, `label`, `separator`, `tooltip`, `popover`, `checkbox`
- `lib/supabase/server.ts` and `lib/supabase/client.ts` — Supabase clients ready for Storage uploads and server actions
- `lib/actions/auth.ts` — Server action pattern established in Phase 1

### Established Patterns
- `getClaims()` for auth validation in server components (not `getSession()`)
- Server actions in `lib/actions/` for mutations
- react-hook-form + zod for form validation (used in auth forms)
- shadcn/ui New York style throughout

### Integration Points
- `/onboarding` route exists as placeholder — replace with wizard component
- `companies` table ready — wizard writes to this on completion
- Supabase Storage `logos` bucket with RLS policies already created
- Middleware redirects: no company → `/onboarding`, has company → `/dashboard`

</code_context>

<specifics>
## Specific Ideas

- The `companies` table already has all columns — no migration needed for Phase 2
- Storage `logos` bucket and RLS policies were created in Phase 1 migration
- Auth middleware already handles the redirect logic (no company record → onboarding)
- The INDUSTRIES config should export types usable in Phase 4's project creation wizard (project types per industry)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-company-onboarding*
*Context gathered: 2026-04-10*
