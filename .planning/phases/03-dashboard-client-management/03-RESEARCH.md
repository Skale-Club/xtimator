# Phase 3: Dashboard & Client Management - Research

**Researched:** 2026-04-10
**Domain:** Next.js App Router layouts, server components, Supabase CRUD, responsive navigation
**Confidence:** HIGH

## Summary

Phase 3 builds the persistent app shell (sidebar + bottom nav), the main dashboard with stat cards and project list, and full client CRUD with logo upload. This is a UI-heavy phase with moderate data layer work. All required shadcn/ui components are already installed. The database schema (companies, clients, projects) and RLS policies are in place from Phase 1. The established patterns -- getClaims() for auth, server actions in `lib/actions/`, react-hook-form + zod for forms, sonner for toasts -- carry forward directly.

The key architectural decision is the app shell layout: a Next.js layout component at `app/(app)/layout.tsx` that wraps all authenticated routes, providing sidebar on desktop and bottom nav on mobile. This layout fetches company data server-side for the shell header and passes it down. All data fetching for dashboard stats and lists should use server components with Supabase queries through RLS.

**Primary recommendation:** Use a Next.js route group `(app)` with a shared layout for the app shell. Server components fetch data; client components handle search/filter/sort state. Reuse the existing LogoUploader pattern for client logos.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Sidebar navigation on desktop (collapsed icon-only at narrow widths, expanded with labels at wider). Sidebar contains: Dashboard, Clients, New Project (prominent CTA), Settings. Company logo + name at top of sidebar.
- D-02: Bottom navigation bar on mobile. 4-5 icon tabs: Dashboard, Clients, New Project (center, prominent), Settings. Minimum 44px touch targets (UX-02).
- D-03: Topbar on desktop shows company name (from companies table), user avatar/initial with dropdown menu (Settings, Sign Out). On mobile, topbar shows page title and hamburger/sheet for overflow.
- D-04: App shell is a layout component wrapping all authenticated routes (/dashboard, /clients, /projects/*, /settings). Auth routes (/auth/*) and public routes (/estimate/*) do NOT use the shell.
- D-05: Skeleton loaders (UX-04) in all data-loading areas using shadcn/ui Skeleton component.
- D-06: 4 stat cards in responsive 2x2 grid (1 column on mobile): Total Projects, Pending Estimates, Accepted, Total Revenue (USD).
- D-07: Stats computed server-side from real database queries.
- D-08: Table layout on desktop (shadcn/ui Table), card layout on mobile.
- D-09: Status badges with distinct colors: Draft (gray), Processing (yellow), Ready (blue), Sent (purple), Accepted (green), Declined (red), Archived (muted).
- D-10: Search bar filters by project name or client name. Client-side filtering for v1.
- D-11: Filter tabs for status. Horizontal scrollable on mobile.
- D-12: Sort dropdown: Newest first (default), Oldest first, Highest value, Alphabetical.
- D-13: Quick actions per project: View, Edit, Delete, Duplicate. Desktop: dropdown menu. Mobile: swipe or long-press menu.
- D-14: Delete confirmation uses shadcn/ui AlertDialog.
- D-15: "+ New Project" button prominently placed.
- D-16: /clients page with list view. Each client row shows: name, email, phone, project count.
- D-17: Create/edit client uses Sheet (side drawer) from shadcn/ui. Name required, email/phone/address/notes optional.
- D-18: Client logo upload reuses avatar-circle pattern from onboarding. Stored in logos bucket with client-scoped path.
- D-19: View client page (/clients/[id]) shows client details + associated projects list.
- D-20: Delete client with AlertDialog confirmation. If client has projects, show warning but still allow (hard delete).
- D-21: Dashboard empty state: illustration/icon + "Create your first project" CTA.
- D-22: Client list empty state: illustration/icon + "Add your first client" CTA.
- D-23: Search/filter no-results state: "No projects match your search" with clear filter option.

### Claude's Discretion
- Exact sidebar width and collapse breakpoint
- Specific icons for navigation items and stat cards (Lucide icons)
- Exact color values for status badges
- Animation/transition for sidebar collapse and mobile nav
- Whether project list uses server-side or client-side pagination (data small in v1)
- Exact empty state illustration choice (Lucide icon vs SVG illustration)
- Table column widths and responsive breakpoints

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | Dashboard shows total projects, pending estimates, accepted count, total revenue | Server-side aggregate queries on projects + estimates tables |
| DASH-02 | Project list with name, client, type, status badge, total, date | Server component query joining projects + clients; StatusBadge component |
| DASH-03 | Search projects by name or client name | Client-side filter state with useMemo; search input component |
| DASH-04 | Filter by status tabs | Client-side tabs component filtering project array |
| DASH-05 | Sort projects | Client-side sort with dropdown controlling sort key/direction |
| DASH-06 | "+ New Project" button prominently accessible | Link to /projects/new (Phase 4 builds the wizard) |
| DASH-07 | Quick actions: View, Edit, Delete, Duplicate | DropdownMenu per row; server actions for delete/duplicate |
| DASH-08 | Delete project with confirmation dialog | AlertDialog wrapping delete server action |
| CLIENT-01 | Searchable, filterable client list | Server component fetch + client-side search similar to dashboard |
| CLIENT-02 | Create client (name required, others optional) | Sheet component + react-hook-form + zod schema + server action |
| CLIENT-03 | Upload client logo to Supabase Storage | Reuse LogoUploader with path `{company_id}/clients/{client_id}/logo.{ext}` |
| CLIENT-04 | Edit client details | Same Sheet form pre-populated; update server action |
| CLIENT-05 | View client's associated projects | /clients/[id] page with project list filtered by client_id |
| CLIENT-06 | Delete client with confirmation | AlertDialog + server action; warning if has projects |
| UX-01 | All screens responsive on mobile | App shell with sidebar/bottom nav; table->card responsive switch |
| UX-02 | 44px minimum touch targets on mobile | Bottom nav buttons, action buttons sized appropriately |
| UX-03 | Bottom navigation bar on mobile | Bottom nav component in app shell layout |
| UX-04 | Skeleton loaders while content loads | Suspense boundaries with skeleton fallbacks |
| UX-05 | Toast notifications for success/errors | sonner already integrated; toast on CRUD operations |
| UX-06 | Form validation with zod + react-hook-form | Client form uses zodResolver pattern from Phase 2 |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.3 | App Router, layouts, server components | Project foundation |
| react | 19.2.4 | UI rendering | Project foundation |
| @supabase/ssr | 0.10.2 | Server/client Supabase clients | Auth + data layer |
| @supabase/supabase-js | 2.103.0 | Supabase JS client | Database + Storage |
| shadcn/ui (radix-ui) | 1.4.3 | All UI components | D-09 locked decision |
| react-hook-form | 7.72.1 | Form state management | CLAUDE.md constraint |
| zod | 4.3.6 | Schema validation | CLAUDE.md constraint |
| @hookform/resolvers | 5.2.2 | Zod resolver for RHF | Connects zod + RHF |
| lucide-react | 1.8.0 | Icons | Already used throughout |
| sonner | 2.0.7 | Toast notifications | Already integrated |
| tailwind-merge | 3.5.0 | Class merging | Already used by shadcn/ui |

### No Additional Dependencies Required
This phase uses only libraries already in package.json. No new installs needed.

## Architecture Patterns

### Recommended Project Structure
```
app/
  (app)/                    # Route group for authenticated shell
    layout.tsx              # App shell: sidebar + topbar + bottom nav
    dashboard/
      page.tsx              # Server component: stats + project list
      loading.tsx           # Skeleton fallback
    clients/
      page.tsx              # Server component: client list
      loading.tsx           # Skeleton fallback
      [id]/
        page.tsx            # Client detail + projects
        loading.tsx
  (auth)/                   # Existing auth routes (no shell)
    auth/
      login/page.tsx
      ...
  onboarding/               # Existing (no shell)
  estimate/                 # Future public routes (no shell)
components/
  app-shell/
    sidebar.tsx             # Desktop sidebar navigation
    bottom-nav.tsx          # Mobile bottom navigation
    topbar.tsx              # Desktop topbar with company name + user menu
    mobile-header.tsx       # Mobile header with page title
    nav-items.ts            # Shared nav config (icon, label, href)
  dashboard/
    stat-card.tsx           # Single stat card component
    stat-cards.tsx          # Grid of 4 stat cards
    project-list.tsx        # Client component: search, filter, sort, render
    project-table-row.tsx   # Desktop table row
    project-card.tsx        # Mobile card view
    project-actions.tsx     # Quick action dropdown
    status-badge.tsx        # Colored status badge
    empty-state.tsx         # Reusable empty state component
  clients/
    client-list.tsx         # Client component: search, render
    client-sheet.tsx        # Create/edit client Sheet form
    client-logo-uploader.tsx # Adapted from onboarding LogoUploader
lib/
  actions/
    client.ts              # Server actions: createClient, updateClient, deleteClient
    project.ts             # Server actions: deleteProject, duplicateProject
  queries/
    dashboard.ts           # getDashboardStats, getProjects
    clients.ts             # getClients, getClientById, getClientProjects
```

### Pattern 1: Route Group for App Shell (D-04)
**What:** Use Next.js route group `(app)` to wrap authenticated pages with the shell layout, while leaving auth and public routes outside.
**When to use:** Any authenticated page that needs sidebar/topbar/bottom-nav.
**Example:**
```typescript
// app/(app)/layout.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/app-shell/sidebar'
import { Topbar } from '@/components/app-shell/topbar'
import { BottomNav } from '@/components/app-shell/bottom-nav'

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null
  if (!claims) redirect('/auth/login')

  // Fetch company for shell display
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, logo_url, owner_name')
    .eq('user_id', claims.sub)
    .single()

  if (!company) redirect('/onboarding')

  return (
    <div className="flex h-screen">
      <Sidebar company={company} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar company={company} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
```

### Pattern 2: Server Component Data Fetch + Client Component Interactivity
**What:** Server components fetch data via Supabase, pass as props to client components that handle search/filter/sort.
**When to use:** Dashboard page, client list page -- anywhere data needs interactive filtering.
**Example:**
```typescript
// app/(app)/dashboard/page.tsx (server component)
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null
  if (!claims) redirect('/auth/login')

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  // Fetch stats
  const stats = await getDashboardStats(supabase, company!.id)
  // Fetch projects with client names
  const projects = await getProjects(supabase, company!.id)

  return (
    <>
      <StatCards stats={stats} />
      <ProjectList projects={projects} />
    </>
  )
}
```

### Pattern 3: Server Actions for Mutations
**What:** All create/update/delete operations as server actions following the getClaims() pattern from Phase 2.
**When to use:** Client CRUD, project delete/duplicate.
**Example:**
```typescript
// lib/actions/client.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createClientAction(formData: ClientFormData) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) return { error: 'No company found' }

  const { data: client, error } = await supabase
    .from('clients')
    .insert({ ...formData, company_id: company.id })
    .select()
    .single()

  if (error) return { error: 'Failed to create client' }

  revalidatePath('/clients')
  return { data: client }
}
```

### Pattern 4: Client Logo Storage Path
**What:** Client logos stored at `{company_id}/clients/{client_id}/logo.{ext}` in the `logos` bucket.
**Why:** Company logos use `{user_id}/logo.{ext}` (Phase 2 pattern). Client logos need a different path to avoid collisions. The storage RLS policy checks `(storage.foldername(name))[1]` matches company_id, so the first path segment must be the company_id (not user_id).
**Important:** The existing company logo uses user_id as the first segment -- but the storage policy checks company_id. For client logos, use company_id as first segment: `{company_id}/clients/{client_id}/logo.{ext}`.

### Pattern 5: Responsive Table/Card Switch
**What:** Render Table on md+ screens, Card list on mobile using Tailwind responsive classes.
**Example:**
```typescript
// Desktop table (hidden on mobile)
<div className="hidden md:block">
  <Table>...</Table>
</div>
// Mobile card view (hidden on desktop)  
<div className="md:hidden space-y-3">
  {projects.map(p => <ProjectCard key={p.id} project={p} />)}
</div>
```

### Anti-Patterns to Avoid
- **Fetching data in client components:** All initial data loads should happen in server components. Client components only handle search/filter/sort on already-fetched data.
- **Using getSession() instead of getClaims():** Locked decision from Phase 1 -- always use getClaims() pattern.
- **Nested layouts that re-fetch company data:** The app shell layout fetches company once; child pages should not re-fetch company info for the shell.
- **Using router.push() for data mutations:** Use server actions + revalidatePath() instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Side drawer for forms | Custom sliding panel | shadcn/ui Sheet | Already installed, handles focus trap, backdrop, animation |
| Confirmation dialogs | Custom modal | shadcn/ui AlertDialog | Accessible, handles escape key, focus management |
| Status badges | Custom styled spans | shadcn/ui Badge with variant mapping | Consistent styling, proper semantics |
| Dropdown menus | Custom popover | shadcn/ui DropdownMenu | Keyboard navigation, proper ARIA roles |
| Skeleton loading | Custom pulse divs | shadcn/ui Skeleton | Consistent animation, proper sizing |
| Search input | Custom input with icon | shadcn/ui Input with Lucide Search icon | Pattern consistency |
| Tab filtering | Custom tab buttons | shadcn/ui Tabs | Accessible, keyboard navigable |
| Toast notifications | Custom notification | sonner (already integrated) | Stacking, auto-dismiss, positioning |
| Logo upload | New uploader | Adapt existing LogoUploader from onboarding | Validation, preview, file handling proven |
| Currency formatting | Manual string formatting | Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }) | Handles edge cases, locale-aware |

## Common Pitfalls

### Pitfall 1: Moving dashboard/page.tsx into route group breaks existing links
**What goes wrong:** The existing `app/dashboard/page.tsx` serves `/dashboard`. Moving it to `app/(app)/dashboard/page.tsx` still serves `/dashboard` (route groups are invisible in URLs), but leaving the old file in place causes a conflict.
**How to avoid:** Delete `app/dashboard/page.tsx` when creating `app/(app)/dashboard/page.tsx`. The URL stays `/dashboard`.

### Pitfall 2: Bottom nav overlapping page content on mobile
**What goes wrong:** Fixed bottom nav covers the last items in scrollable content.
**How to avoid:** Add `pb-20` (padding-bottom) to the main content area on mobile. The shell layout should handle this with `pb-20 md:pb-6`.

### Pitfall 3: Client logo upload path must use company_id not user_id
**What goes wrong:** The logos bucket storage policy checks `(storage.foldername(name))[1]` against company_id. If you use user_id as the first path segment (like the onboarding company logo does), the RLS policy may fail for client logos.
**How to avoid:** Store client logos at `{company_id}/clients/{client_id}/logo.{ext}`. Verify the existing company logo upload works -- it currently uses `{user_id}/logo.{ext}` which may need review.
**Warning signs:** 403 errors on storage upload.

### Pitfall 4: Supabase query for stats requires company_id
**What goes wrong:** Attempting to query projects/estimates without filtering by company_id returns nothing (RLS blocks it) or incorrect data.
**How to avoid:** Always get company_id first, then query. The RLS allows access only to rows matching the user's company.

### Pitfall 5: zodResolver cast workaround
**What goes wrong:** Zod v4 has type mismatches with react-hook-form's zodResolver.
**How to avoid:** Use the same `zodResolver(schema) as any` cast pattern established in Phase 2 (STATE.md decision).

### Pitfall 6: Delete client with ON DELETE SET NULL for projects
**What goes wrong:** The schema has `client_id UUID REFERENCES clients(id) ON DELETE SET NULL` on projects table. Deleting a client sets project.client_id to NULL -- it does NOT delete the projects. The UI should warn about this but allow the delete (D-20).
**How to avoid:** Show warning "This client has N projects. Deleting will remove the client association from those projects." Use AlertDialog.

### Pitfall 7: Empty company after fresh onboarding
**What goes wrong:** The shell layout queries company data. If onboarding was skipped (ONBOARD-08), company may exist with minimal data (just name and user_id).
**How to avoid:** Handle null/empty fields gracefully in the topbar/sidebar. Use fallback text for missing company name or logo.

## Code Examples

### Dashboard Stats Query
```typescript
// lib/queries/dashboard.ts
import { SupabaseClient } from '@supabase/supabase-js'

export interface DashboardStats {
  totalProjects: number
  pendingEstimates: number
  acceptedEstimates: number
  totalRevenue: number
}

export async function getDashboardStats(
  supabase: SupabaseClient,
  companyId: string
): Promise<DashboardStats> {
  // Total projects
  const { count: totalProjects } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  // Pending estimates (status = 'draft' or 'sent' but not responded)
  const { count: pendingEstimates } = await supabase
    .from('estimates')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_current', true)
    .in('status', ['draft', 'sent'])

  // Accepted estimates
  const { count: acceptedEstimates } = await supabase
    .from('estimates')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_current', true)
    .eq('client_response', 'accepted')

  // Total revenue (sum of accepted estimate totals)
  const { data: revenueData } = await supabase
    .from('estimates')
    .select('total')
    .eq('company_id', companyId)
    .eq('is_current', true)
    .eq('client_response', 'accepted')

  const totalRevenue = (revenueData ?? []).reduce(
    (sum, e) => sum + Number(e.total ?? 0),
    0
  )

  return {
    totalProjects: totalProjects ?? 0,
    pendingEstimates: pendingEstimates ?? 0,
    acceptedEstimates: acceptedEstimates ?? 0,
    totalRevenue,
  }
}
```

### Status Badge Component
```typescript
// components/dashboard/status-badge.tsx
import { Badge } from '@/components/ui/badge'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:      { label: 'Draft',      className: 'bg-gray-100 text-gray-700 hover:bg-gray-100' },
  processing: { label: 'Processing', className: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100' },
  ready:      { label: 'Ready',      className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  sent:       { label: 'Sent',       className: 'bg-purple-100 text-purple-700 hover:bg-purple-100' },
  accepted:   { label: 'Accepted',   className: 'bg-green-100 text-green-700 hover:bg-green-100' },
  declined:   { label: 'Declined',   className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  archived:   { label: 'Archived',   className: 'bg-muted text-muted-foreground hover:bg-muted' },
}

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return <Badge className={config.className}>{config.label}</Badge>
}
```

### Client Form Zod Schema
```typescript
// lib/schemas/client.ts
import { z } from 'zod'

export const clientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  zip: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
})

export type ClientFormValues = z.infer<typeof clientSchema>
```

### Navigation Config
```typescript
// components/app-shell/nav-items.ts
import { LayoutDashboard, Users, FolderPlus, Settings } from 'lucide-react'

export const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Clients', href: '/clients', icon: Users },
  { label: 'New Project', href: '/projects/new', icon: FolderPlus, primary: true },
  { label: 'Settings', href: '/settings', icon: Settings },
] as const
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 + jsdom |
| Config file | vitest.config.ts |
| Quick run command | `npm test` |
| Full suite command | `npm test && npm run test:e2e` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Dashboard stats computed correctly | unit | `npx vitest run tests/unit/dashboard-stats.test.ts -t "stats"` | Wave 0 |
| DASH-02 | Project list renders with all fields | unit | `npx vitest run tests/unit/project-list.test.tsx -t "render"` | Wave 0 |
| DASH-03 | Search filters projects by name/client | unit | `npx vitest run tests/unit/project-list.test.tsx -t "search"` | Wave 0 |
| DASH-04 | Status filter tabs work | unit | `npx vitest run tests/unit/project-list.test.tsx -t "filter"` | Wave 0 |
| DASH-05 | Sort controls work | unit | `npx vitest run tests/unit/project-list.test.tsx -t "sort"` | Wave 0 |
| DASH-07 | Quick actions trigger correct behavior | unit | `npx vitest run tests/unit/project-actions.test.tsx` | Wave 0 |
| CLIENT-02 | Client form validates name required | unit | `npx vitest run tests/unit/client-schema.test.ts` | Wave 0 |
| CLIENT-01 | Client list renders and searches | unit | `npx vitest run tests/unit/client-list.test.tsx` | Wave 0 |
| UX-04 | Skeleton loaders render | unit | `npx vitest run tests/unit/loading.test.tsx` | Wave 0 |
| UX-06 | Client form zod validation | unit | `npx vitest run tests/unit/client-schema.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/dashboard-stats.test.ts` -- covers DASH-01
- [ ] `tests/unit/project-list.test.tsx` -- covers DASH-02, DASH-03, DASH-04, DASH-05
- [ ] `tests/unit/client-schema.test.ts` -- covers CLIENT-02, UX-06
- [ ] `tests/unit/status-badge.test.tsx` -- covers status badge rendering

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pages Router getServerSideProps | App Router server components | Next.js 13+ (stable 14+) | Data fetching in component, no prop drilling |
| API routes for all mutations | Server Actions ('use server') | Next.js 14+ | Simpler form handling, automatic revalidation |
| useEffect data fetching | Server component fetch + Suspense | Next.js 13+ | No loading states to manage, no waterfalls |
| getSession() for auth | getClaims() for JWT validation | Supabase SSR 0.10+ | Re-validates JWT signature against Supabase |

## Open Questions

1. **Company logo path inconsistency**
   - What we know: Phase 2 stores company logo at `{user_id}/logo.{ext}`. Storage RLS checks `(storage.foldername(name))[1]` against company_id.
   - What's unclear: Whether user_id and company_id happen to work interchangeably in the current setup, or if this is a latent bug.
   - Recommendation: For client logos, use `{company_id}/clients/{client_id}/logo.{ext}`. If the company logo upload is broken, note it but don't fix in this phase.

2. **Duplicate project action**
   - What we know: DASH-07 requires a Duplicate quick action. No server action pattern for duplicating a row with related records exists yet.
   - What's unclear: For v1, projects have no related records yet (recordings, photos, estimates come in later phases), so duplicating is just a simple INSERT copying columns.
   - Recommendation: Implement a simple single-row duplicate server action. Deep-copy of related records can be added later.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: package.json, app/layout.tsx, lib/actions/company.ts, middleware.ts, supabase/migrations/20260409000001_initial_schema.sql
- CONTEXT.md decisions (D-01 through D-23) -- locked by user
- REQUIREMENTS.md -- DASH-01 to DASH-08, CLIENT-01 to CLIENT-06, UX-01 to UX-06
- STATE.md -- established patterns from Phase 1 and Phase 2

### Secondary (MEDIUM confidence)
- Next.js App Router route groups, layouts, and server components patterns -- well-established since Next.js 14

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified in package.json
- Architecture: HIGH -- follows established Next.js App Router patterns; route groups and layouts are standard
- Pitfalls: HIGH -- derived from codebase inspection and known schema constraints

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable stack, no fast-moving dependencies)
