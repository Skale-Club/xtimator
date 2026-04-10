# Phase 3: Dashboard & Client Management - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the persistent app shell (sidebar + topbar on desktop, bottom nav on mobile), the main dashboard with stat cards and project list (search, filter, sort, quick actions), and full client CRUD with logo upload. This phase delivers the primary navigation and data views that all subsequent phases build on.

</domain>

<decisions>
## Implementation Decisions

### App Shell Layout
- **D-01:** Sidebar navigation on desktop (collapsed icon-only at narrow widths, expanded with labels at wider). Sidebar contains: Dashboard, Clients, New Project (prominent CTA), Settings. Company logo + name at top of sidebar.
- **D-02:** Bottom navigation bar on mobile (per UX-03). 4-5 icon tabs: Dashboard, Clients, New Project (center, prominent), Settings. Minimum 44px touch targets (UX-02).
- **D-03:** Topbar on desktop shows company name (from companies table), user avatar/initial with dropdown menu (Settings, Sign Out). On mobile, topbar shows page title and hamburger/sheet for overflow.
- **D-04:** The app shell is a layout component wrapping all authenticated routes (`/dashboard`, `/clients`, `/projects/*`, `/settings`). Auth routes (`/auth/*`) and public routes (`/estimate/*`) do NOT use the shell.
- **D-05:** Skeleton loaders (UX-04) in all data-loading areas: stat cards, project list, client list. Use shadcn/ui `Skeleton` component.

### Dashboard Stats
- **D-06:** 4 stat cards in a responsive 2x2 grid (1 column on mobile): Total Projects, Pending Estimates, Accepted, Total Revenue. Each card has an icon, label, and value. Revenue formatted as USD.
- **D-07:** Stats are computed server-side from real database queries (projects + estimates tables). No mock data.

### Project List
- **D-08:** Table layout on desktop (shadcn/ui `Table`), card layout on mobile. Each row/card shows: project name, client name, project type, status badge, total amount, date.
- **D-09:** Status badges with distinct colors: Draft (gray), Processing (yellow), Ready (blue), Sent (purple), Accepted (green), Declined (red), Archived (muted).
- **D-10:** Search bar filters by project name or client name (DASH-03). Client-side filtering for v1 (data set will be small).
- **D-11:** Filter tabs for status (All, Draft, Processing, Ready, Sent, Accepted, Declined, Archived) per DASH-04. Horizontal scrollable on mobile.
- **D-12:** Sort dropdown: Newest first (default), Oldest first, Highest value, Alphabetical (DASH-05).
- **D-13:** Quick actions per project: View, Edit, Delete, Duplicate (DASH-07). On desktop: dropdown menu on row. On mobile: swipe or long-press menu.
- **D-14:** Delete confirmation uses shadcn/ui `AlertDialog` (DASH-08).
- **D-15:** "+ New Project" button prominently placed — top-right of project list section on desktop, FAB-style or in bottom nav on mobile (DASH-06).

### Client Management
- **D-16:** `/clients` page with list view. Each client row shows: name, email, phone, project count. Searchable and filterable.
- **D-17:** Create/edit client uses a Sheet (side drawer) from shadcn/ui — not a full page or modal. Name required, email/phone/address/notes optional (CLIENT-02).
- **D-18:** Client logo upload reuses the same avatar-circle pattern from onboarding (Phase 2). Stored in `logos` bucket with client-scoped path (CLIENT-03).
- **D-19:** View client page (`/clients/[id]`) shows client details + associated projects list (CLIENT-05). Uses same project list component from dashboard.
- **D-20:** Delete client with AlertDialog confirmation (CLIENT-06). If client has projects, show warning but still allow delete (hard delete per D-08 from Phase 1).

### Empty States
- **D-21:** Dashboard empty state (no projects): illustration/icon + "Create your first project" CTA button.
- **D-22:** Client list empty state: illustration/icon + "Add your first client" CTA button.
- **D-23:** Search/filter no-results state: "No projects match your search" with clear filter option.

### Claude's Discretion
- Exact sidebar width and collapse breakpoint
- Specific icons for navigation items and stat cards (Lucide icons)
- Exact color values for status badges
- Animation/transition for sidebar collapse and mobile nav
- Whether project list uses server-side or client-side pagination (data will be small in v1)
- Exact empty state illustration choice (Lucide icon vs SVG illustration)
- Table column widths and responsive breakpoints

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — DASH-01 through DASH-08 (dashboard), CLIENT-01 through CLIENT-06 (clients), UX-01 through UX-06 (mobile/UX)
- `.planning/PROJECT.md` — Tech stack constraints, key decisions, Supabase project details

### Prior Phase Context
- `.planning/phases/01-foundation-auth/01-CONTEXT.md` — Auth patterns (getClaims, server actions), shadcn/ui New York style, D-09 component set, middleware rules
- `.planning/phases/02-company-onboarding/02-CONTEXT.md` — Logo upload pattern, form validation approach, avatar-circle component

### Database Schema
- `supabase/migrations/20260409000001_initial_schema.sql` — All table schemas (companies, clients, projects, estimates, etc.), RLS policies, Storage bucket policies

### Existing Code
- `app/dashboard/page.tsx` — Current placeholder to be replaced with full dashboard
- `app/layout.tsx` — Root layout where app shell wraps authenticated routes
- `components/onboarding/logo-uploader.tsx` — Logo upload pattern to reuse for client logos
- `lib/actions/company.ts` — Server action pattern for Supabase mutations
- `lib/supabase/server.ts` — Server-side Supabase client
- `lib/supabase/client.ts` — Browser-side Supabase client for Storage uploads

### Roadmap
- `.planning/ROADMAP.md` §Phase 3 — Plan descriptions, success criteria

No external specs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Full shadcn/ui component set installed: `table`, `card`, `badge`, `dialog`, `alert-dialog`, `dropdown-menu`, `sheet`, `skeleton`, `tabs`, `avatar`, `button`, `input`, `form`, `select`, `command`, `navigation-menu`, `scroll-area`, `tooltip`, `popover`, `separator`
- `components/onboarding/logo-uploader.tsx` — Avatar-circle upload pattern reusable for client logos
- `lib/actions/company.ts` — Server action pattern (getClaims → query → redirect)
- `lib/supabase/server.ts` and `lib/supabase/client.ts` — Supabase clients ready

### Established Patterns
- `getClaims()` for auth validation in server components (not `getSession()`)
- Server actions in `lib/actions/` for mutations
- react-hook-form + zod for form validation
- shadcn/ui New York style throughout
- Hard delete (D-08 from Phase 1)
- Toast notifications via sonner

### Integration Points
- `app/dashboard/page.tsx` ��� Replace placeholder with full dashboard
- `app/layout.tsx` — Wrap with app shell layout for authenticated routes
- Middleware already protects `/dashboard`, `/clients`, `/settings` routes
- `companies` table has company name/logo for shell display
- `clients` and `projects` tables exist in schema for CRUD operations

</code_context>

<specifics>
## Specific Ideas

- The app shell layout established here is the foundation all subsequent phases build on — it must be solid and responsive
- Project list will initially be empty for new users; the empty state is the first thing they see after onboarding
- Client CRUD is a prerequisite for Phase 4's project creation wizard (select existing client)
- The stat cards will show zeros initially — that's fine, they'll populate as projects are created
- Reuse the logo uploader component pattern from Phase 2 for client logos

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-dashboard-client-management*
*Context gathered: 2026-04-10*
