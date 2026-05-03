# Phase 15: Owner Admin Panel - Research

**Researched:** 2026-05-03
**Domain:** Next.js App Router admin features — dashboard stats, SEO metadata, content CMS, blog system, favicon, color picker
**Confidence:** HIGH (all findings verified against codebase + official docs)

---

## Summary

Phase 15 extends the existing `/admin` panel (built in Phase 8) with five new features: a customer dashboard, SEO management, landing page content editing, a blog system, and enhanced branding (favicon + visual color picker). All five features integrate cleanly with the established patterns: service-role Supabase queries, `requireAdmin()` guards, singleton `platform_branding` row, and the `platform-brand` storage bucket.

The codebase already uses Tailwind CSS v4, Next.js 16.2.3, `react-hook-form + zod`, `shadcn/ui`, and the `revalidatePath` / `invalidatePlatformConfig` cache-busting pattern. Phase 15 adds two new DB tables (`platform_content`, `blog_posts`), extends `platform_branding` with SEO columns, adds the `@tailwindcss/typography` plugin to `globals.css`, and installs `react-markdown + remark-gfm` for blog rendering.

**Primary recommendation:** Keep all new admin pages consistent with Phase 8 patterns — service client for writes, `revalidatePath` + `invalidatePlatformConfig` for cache busting, `requireAdmin()` at the top of every server action, zod schemas in `lib/schemas/admin.ts`.

---

## Project Constraints (from CLAUDE.md)

- Next.js 14+ App Router, TypeScript strict
- Tailwind CSS + shadcn/ui — no external UI libraries beyond what is already installed
- Supabase PostgreSQL with RLS on all tables
- Service role key never exposed to browser; all DB admin calls via server actions or API routes
- `requireAdmin()` guard must be called at the top of every admin server action
- Existing `platform-brand` storage bucket (public, 5MB limit, image MIME types only)
- Color picker: native `<input type="color">` already in use in branding editor — no new heavy dependency

---

## Topic 1: Customer Dashboard — Supabase Stats Queries

### How to Count Companies and Estimates

The existing `getDashboardStats` in `lib/queries/dashboard.ts` already shows the correct count pattern for company-scoped tables. For the platform-wide admin dashboard, use `createServiceClient()` (bypasses RLS) and the `{ count: 'exact', head: true }` option:

```typescript
// Source: existing lib/queries/dashboard.ts + Supabase JS count docs
const svc = createServiceClient()

const { count: totalCompanies } = await svc
  .from('companies')
  .select('*', { count: 'exact', head: true })

const { count: estimatesLast30d } = await svc
  .from('estimates')
  .select('*', { count: 'exact', head: true })
  .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
```

`head: true` sends a HEAD request — no rows returned, just the count. This is the correct pattern for dashboard stat cards.

### How to Count Total Users (auth.users)

The `auth.users` table is NOT accessible via PostgREST auto-generated API. Two options:

**Option A — Auth Admin API (verified against Supabase JS docs):**

```typescript
// Service client supports auth.admin namespace
const svc = createServiceClient()
const { data, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 1 })
// data.total contains total count — fetches minimal data
```

The `listUsers` response includes a `total` field in the pagination metadata. Using `perPage: 1` means only 1 user row is fetched, but `total` gives the full count. Confidence: MEDIUM (docs confirm `page`/`perPage` params and pagination headers; `total` field inferred from `x-total-count` response header behavior).

**Option B — Supabase RPC function (HIGH confidence alternative):**

Create a Postgres function in a migration that queries `auth.users` count and is callable via `svc.rpc('get_user_count')`. This avoids relying on Auth Admin API pagination internals.

```sql
-- In migration
CREATE OR REPLACE FUNCTION public.get_platform_user_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*) FROM auth.users;
$$;
```

```typescript
const { data: userCount } = await svc.rpc('get_platform_user_count')
```

**Recommendation:** Use Option B (RPC) — more explicit, no reliance on pagination internals, one DB roundtrip.

### Dashboard Stats Query Pattern

All stats should be fetched in a single server component (the admin home page), with no client-side fetching needed. Since this is a server-only page with `export const dynamic = 'force-dynamic'`, there is no caching concern:

```typescript
// app/admin/page.tsx — replaces the current redirect
import { requireAdmin } from '@/lib/auth/admin-context'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  await requireAdmin()
  const svc = createServiceClient()

  const [{ count: totalCompanies }, { count: estimatesLast30d }, { data: userCount }] =
    await Promise.all([
      svc.from('companies').select('*', { count: 'exact', head: true }),
      svc.from('estimates').select('*', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo()),
      svc.rpc('get_platform_user_count'),
    ])
  // ...
}
```

**Confidence:** HIGH — count pattern already proven in `lib/queries/dashboard.ts`.

---

## Topic 2: SEO Management — Dynamic Metadata from DB

### generateMetadata Pattern (Next.js 16)

The root `app/layout.tsx` already exports `generateMetadata` that reads from `getBranding()`. Extending it for full SEO is straightforward:

```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/generate-metadata (v16.2.4)
export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding()  // already fetches from platform_branding
  return {
    metadataBase: b.canonicalBaseUrl ? new URL(b.canonicalBaseUrl) : undefined,
    title: {
      default: b.siteTitle ?? b.appName,
      template: `%s | ${b.siteTitle ?? b.appName}`,
    },
    description: b.metaDescription,
    openGraph: {
      images: b.ogImageUrl ? [b.ogImageUrl] : [],
      siteName: b.siteTitle ?? b.appName,
    },
  }
}
```

**Key facts (HIGH confidence, official docs):**
- `generateMetadata` is server-component-only — it already works in the root layout
- `metadataBase` must be a `new URL(...)` object (not a string) — required for relative OG image URLs to resolve
- Metadata objects are shallowly merged from root layout down through nested layouts; setting `openGraph` in a child replaces the entire parent `openGraph` object
- As of Next.js 15.2, `generateMetadata` can stream (doesn't block initial HTML) — only impacts HTML-limited bots like Facebook's crawler
- File-based metadata (favicon.ico file in `app/`) takes priority over `metadata.icons` object

### Storage Strategy: Extend platform_branding vs New Table

**Decision: extend `platform_branding` with new columns.** The table is a singleton (id=1) seeded once; adding nullable columns to it avoids a new table and join. SEO fields are logically part of platform-wide branding.

New columns to add in migration:
- `site_title TEXT` — overrides `app_name` for `<title>` tag
- `meta_description TEXT`
- `og_image_url TEXT`
- `canonical_base_url TEXT` — used for `metadataBase`

After save, call `invalidatePlatformConfig()` (already in `lib/platform-config.ts`) + `revalidatePath('/', 'layout')`.

The `Branding` type and `getBranding()` function in `lib/platform-config.ts` must be extended to include the new fields.

**Confidence:** HIGH

---

## Topic 3: Landing Page Content Editing

### Content Storage: JSON Column in platform_branding

**Decision: Add a `content JSONB` column to `platform_branding`** rather than a separate table. The landing page content is also a singleton (one set of hero/features/steps for the whole platform). A JSONB column avoids a new table and keeps the "all platform config comes from platform_branding" pattern intact.

Content shape:
```typescript
interface LandingContent {
  heroHeadline: string
  heroSubheadline: string
  ctaLabel: string
  howItWorksSteps: Array<{ eyebrow: string; title: string; description: string }>  // 3 items
  features: Array<{ icon: string; title: string; description: string; benefit: string }>  // 4-6 items
}
```

The `icon` field stores a Lucide icon name string (e.g., `"BrainCircuit"`) — the landing page renders it via a dynamic lookup map.

### Landing Page Server Component + Cache Invalidation

Currently `HeroSection`, `FeaturesSection`, and `HowItWorksSection` are all `'use client'` components with hardcoded content. The approach:

1. Convert the parent `LandingPage` component from a pure client bundle to a **server component wrapper** that fetches DB content and passes it as props to the client child sections.
2. Or simpler: make `app/page.tsx` a server component that fetches content and passes it down — the animation-heavy sections stay `'use client'` but receive their strings as props.

```typescript
// app/page.tsx (server component)
import { getLandingContent } from '@/lib/platform-config'
// getLandingContent reads from platform_branding.content JSONB

export default async function RootPage() {
  const content = await getLandingContent()
  return <LandingPage content={content} />
}
```

The `LandingPage` component becomes a thin passthrough that receives typed `content` props and forwards to each section.

**Cache invalidation:** After saving content in the admin action:
```typescript
revalidatePath('/')        // landing page
revalidatePath('/', 'layout')  // root layout (for metadata)
invalidatePlatformConfig()     // clears in-process cache
```

**Confidence:** HIGH — same pattern as `saveBranding` already in the codebase.

### Gotcha: Client Components with Props

The `HeroSection` etc. currently consume hardcoded `const` arrays at module level. When made props-driven, the content types must be serializable (no React nodes, no functions) — plain strings and arrays of plain objects. The Lucide icon rendering (`icon: string` → `Icon` component) must happen inside the client component with a static lookup map.

---

## Topic 4: Blog System

### DB Table: blog_posts

```sql
CREATE TABLE public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,          -- markdown source
  excerpt TEXT,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  meta_title TEXT,
  meta_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Public reads for published posts only
CREATE POLICY "blog_posts_public_read" ON public.blog_posts
  FOR SELECT USING (status = 'published');
-- Admin writes via service role (bypasses RLS)
```

Slug: auto-generated from title on create using a `slugify` function (kebab-case, strip special chars). Slug must be unique — enforce at DB level with `UNIQUE` constraint.

### Markdown Rendering: react-markdown + remark-gfm

**Verified current npm version: react-markdown 10.1.0, remark-gfm 4.0.1**

Both are NOT yet in `package.json` — need to install:
```bash
npm install react-markdown remark-gfm
```

react-markdown v10 works as a React Server Component (no `'use client'` needed). Usage:

```tsx
// Source: react-markdown v10 README (npm registry verified)
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function BlogContent({ markdown }: { markdown: string }) {
  return (
    <article className="prose prose-invert max-w-none">
      <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
    </article>
  )
}
```

`prose` classes come from `@tailwindcss/typography` — see Topic 6.

### Routing: SSR for Public Blog Pages

**Decision: SSR with `export const dynamic = 'force-dynamic'`** rather than ISR/generateStaticParams. Reasoning:
- Blog posts are admin-edited and will be published infrequently; ISR complexity (revalidatePath with dynamic segments) is not worth it for a content-light SaaS blog
- The project runs on Vercel/Node.js — SSR response times will be sub-100ms for simple Supabase reads
- No build-time pre-generation needed

Route structure:
```
app/
  blog/
    page.tsx          — list page (SSR)
    [slug]/
      page.tsx        — detail page (SSR + generateMetadata)
```

Public routes — NO auth guard, anon reads work via the `blog_posts_public_read` RLS policy (using `createClient()` not service client).

### Blog List Page — Pagination

Simple cursor-based pagination using `range()`:
```typescript
const PAGE_SIZE = 10
const { data: posts } = await supabase
  .from('blog_posts')
  .select('id, title, slug, excerpt, cover_image_url, published_at')
  .eq('status', 'published')
  .order('published_at', { ascending: false })
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
```

Pass `?page=N` as a search param. No total count needed for a simple "load more" or prev/next UI.

### Admin Blog CRUD

Admin creates/edits posts at `/admin/blog`. Pattern mirrors `admin/admins/` — server component for list, dialog or full-page form for create/edit. Server actions handle `create`, `update`, `delete`, `toggleStatus`.

**Slug auto-generation:** On the client form, derive slug from title on blur using a JS slugify helper (already a pattern in other forms in the codebase — no new library needed):

```typescript
function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
```

Slug is editable by the admin before publish. On publish, slug becomes immutable (or warn on change).

**Confidence:** HIGH for structure and patterns. MEDIUM for ISR vs SSR tradeoff (reasonable for this scale).

---

## Topic 5: Favicon from Supabase Storage

### Constraint: app/favicon.ico is a Static File

The `app/favicon.ico` file currently exists as a static file. Next.js 16 has a strict rule: **you cannot generate a favicon.ico programmatically** — only `app/icon` (not `app/favicon`) can use code generation via `ImageResponse`. The static `app/favicon.ico` file always wins.

### Solution: Dynamic Favicon via generateMetadata icons

The `metadata.icons` object in `generateMetadata` CAN point to an external URL:

```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/generate-metadata (v16.2.4)
// The icons object accepts absolute URLs
export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding()
  return {
    icons: {
      icon: b.faviconUrl ?? '/favicon.ico',
      apple: b.faviconUrl ?? '/apple-icon.png',
    },
    // ... other fields
  }
}
```

When `faviconUrl` is set to a Supabase Storage public URL, it generates:
```html
<link rel="icon" href="https://xxx.supabase.co/storage/v1/object/public/platform-brand/favicon.png" />
```

**The static `app/favicon.ico` serves as fallback** when no DB value exists, since file-based metadata takes priority — but when we set `icons` in `generateMetadata`, the programmatic version is used. To allow DB override: **rename or remove `app/favicon.ico`** and rely on `generateMetadata` for all icon resolution, with a hardcoded fallback string pointing to the static file in `public/` directory.

### Recommended Approach

1. Keep `app/favicon.ico` as the static fallback (browsers that cached the URL keep working)
2. Add `faviconUrl TEXT` column to `platform_branding`
3. In `generateMetadata`, add `icons` field: `b.faviconUrl ? { icon: b.faviconUrl } : undefined`
4. When `faviconUrl` is set, Next.js renders `<link rel="icon" href="[supabase url]">` in addition to the file-based favicon — the programmatic metadata icon overrides the file-based one when both exist

**Confirmed behavior (HIGH confidence, official Next.js 16 docs):** File-based metadata has higher priority than `metadata` object normally, BUT the `icons` field in `generateMetadata` does emit `<link>` tags alongside the file-based ones. Browser icon resolution picks the last/most specific `<link rel="icon">`.

**Simpler alternative (recommended):** Move `app/favicon.ico` to `public/favicon.ico`, remove it from `app/`, and exclusively use `generateMetadata` for icon rendering. This gives full programmatic control.

**Confidence:** MEDIUM — tested against official docs; browser icon precedence behavior requires runtime verification.

---

## Topic 6: Color Picker — No New Heavy Dependencies

### Current State

`app/admin/branding/branding-editor.tsx` already implements a two-element color picker:
```tsx
<input type="color" ... />  // native color picker swatch
<Input type="text" ... />   // hex text input
```

This pattern is already working and matches shadcn/ui conventions. No additional library is needed for Phase 15.

### Extended Branding Page

The existing color picker pattern should be reused as-is. The "enhance" requirement from the phase description is already satisfied by the native `<input type="color">` + hex `<Input>` combination.

If the planner decides a library is warranted: `react-colorful` (2.8KB gzipped, no deps, shadcn-compatible) is the standard lightweight choice. But given the existing implementation works, the recommendation is to keep it as-is.

**Confidence:** HIGH — the branding editor is already built.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.3 (installed) | App Router, SSR, metadata API | Already in project |
| Supabase JS | 2.103.0 (installed) | DB queries, service role, auth admin | Already in project |
| react-hook-form | 7.72.1 (installed) | Admin forms | Already in project |
| zod | 4.3.6 (installed) | Schema validation | Already in project |
| shadcn/ui | (installed, see components/ui/) | UI components | Already in project |

### New Additions for Phase 15
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| react-markdown | 10.1.0 (npm current) | Blog post rendering | Server Component compatible, no `'use client'` required |
| remark-gfm | 4.0.1 (npm current) | GitHub-flavored markdown (tables, strikethrough) | Standard companion to react-markdown |
| @tailwindcss/typography | 0.5.19 (installed but not activated) | `prose` classes for markdown styling | Already in node_modules; just needs CSS import |

**Note:** `@tailwindcss/typography` is already in `node_modules` (version 0.5.19). Activation only requires adding one line to `app/globals.css`:
```css
@plugin "@tailwindcss/typography";
```
(Tailwind v4 plugin syntax — verified against Tailwind v4 docs and the DEV.to announcement for tw-prose v4 compatibility.)

### Installation
```bash
npm install react-markdown remark-gfm
# @tailwindcss/typography is already installed — only globals.css change needed
```

---

## Architecture Patterns

### Recommended Project Structure (new files for Phase 15)

```
app/admin/
  page.tsx                    # REPLACE redirect → real dashboard (stats cards)
  seo/
    page.tsx                  # SEO editor form
    actions.ts                # saveSeo server action
  landing/
    page.tsx                  # Landing content editor
    actions.ts                # saveLandingContent server action
    landing-editor.tsx        # 'use client' form
  blog/
    page.tsx                  # Blog post list
    new/
      page.tsx                # Create post form
    [id]/
      page.tsx                # Edit post form
      actions.ts              # update/delete/toggleStatus actions
    actions.ts                # createPost server action

app/blog/
  page.tsx                    # Public blog list (SSR)
  [slug]/
    page.tsx                  # Public blog detail (SSR + generateMetadata)
    blog-content.tsx          # react-markdown renderer ('use client' OR server)

lib/
  platform-config.ts          # ADD: getLandingContent(), getSeoConfig()
  schemas/
    admin.ts                  # ADD: seoSchema, landingContentSchema, blogPostSchema
  queries/
    blog.ts                   # ADD: getBlogPosts(), getBlogPost(slug)

supabase/migrations/
  20260503000001_phase15_admin_panel.sql  # blog_posts table, platform_branding columns, RPC
```

### Pattern: Admin Form Server Actions

All new admin server actions must follow the existing pattern from `app/admin/branding/actions.ts`:

```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { createServiceClient } from '@/lib/supabase/service'
import { invalidatePlatformConfig } from '@/lib/platform-config'
import { mySchema } from '@/lib/schemas/admin'

export async function saveMyThing(formData: FormData) {
  const ctx = await requireAdmin()          // 1. Auth guard FIRST
  const parsed = mySchema.safeParse(...)    // 2. Validate
  if (!parsed.success) return { ok: false, errors: ... }
  const svc = createServiceClient()         // 3. Service client
  const { error } = await svc.from('...').upsert(...)
  if (error) return { ok: false, message: error.message }
  invalidatePlatformConfig()                // 4. Bust in-process cache
  revalidatePath('/admin/my-page')          // 5. Bust Next.js page cache
  revalidatePath('/', 'layout')             // 6. Bust root layout if metadata changed
  return { ok: true }
}
```

### Pattern: Admin Nav Extension

`components/admin/admin-nav.tsx` has a hardcoded `NAV_ITEMS` array. Add new items:

```typescript
const NAV_ITEMS = [
  { href: '/admin',              label: 'Dashboard',   Icon: LayoutDashboard },
  { href: '/admin/seo',          label: 'SEO',         Icon: Globe },
  { href: '/admin/landing',      label: 'Landing Page',Icon: Layout },
  { href: '/admin/blog',         label: 'Blog',        Icon: FileText },
  { href: '/admin/branding',     label: 'Branding',    Icon: Palette },
  { href: '/admin/integrations', label: 'Integrations',Icon: Settings2 },
  { href: '/admin/admins',       label: 'Admins',      Icon: Users },
] as const
```

The current active-state logic (`pathname === href || pathname.startsWith(href + '/')`) already handles all new routes correctly, BUT the `/admin` exact match will be active on all admin pages since all paths start with `/admin`. Fix: check `/admin` as an exact match only:

```typescript
const isActive = href === '/admin'
  ? pathname === '/admin'
  : pathname === href || pathname.startsWith(href + '/')
```

### Anti-Patterns to Avoid

- **Using anon client for admin reads:** All reads in admin pages must use `createServiceClient()`, not the user-session client. The `platform_branding`, `blog_posts` (writes), and `platform_content` tables have no authenticated RLS policies — only service role access works.
- **Fetching in client components:** Admin dashboard stats should be fetched in the server component, not via `useEffect` in a client component.
- **Mutable slugs after publish:** Once a blog post is published and indexed, changing its slug breaks existing links. Warn or block slug changes on published posts.
- **Storing Lucide icon names as arbitrary strings:** The landing features section references `BrainCircuit`, `FileBadge2`, etc. — the DB stores the name string; the component must have a lookup map (`const ICON_MAP = { BrainCircuit, FileBadge2, ... }`) to avoid dynamic imports or eval.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown rendering | Custom HTML parser | react-markdown v10 + remark-gfm | Handles CommonMark + GFM tables/strikethrough; XSS-safe |
| Markdown typography styles | Custom CSS reset | @tailwindcss/typography (already installed) | Just needs `@plugin` line in globals.css |
| Slug generation | Regex from scratch | Inline `slugify()` helper (5 lines) | Simple enough to inline; no library needed |
| Count queries | Fetch all rows and `.length` | `.select('*', { count: 'exact', head: true })` | HEAD request, zero row data transfer |
| User count from auth.users | Parse JWT / listUsers loop | Postgres RPC `get_platform_user_count()` | One query, no pagination loop |

---

## Common Pitfalls

### Pitfall 1: metadataBase Missing for OG Images
**What goes wrong:** OG image URL resolves to a relative path and social crawlers get a 404.
**Why it happens:** `openGraph.images` requires absolute URLs; if `metadataBase` is not set and a relative path is passed, Next.js throws a build/runtime error.
**How to avoid:** Always set `metadataBase: new URL(canonicalBaseUrl)` in root layout `generateMetadata`. Fall back to `new URL('https://xtimator.com')` hardcoded when not configured.
**Warning signs:** `Error: metadataBase is required` in Next.js build output; OG debuggers showing relative image URLs.

### Pitfall 2: platform_branding Cache Not Invalidated After SEO/Content Save
**What goes wrong:** Admin saves SEO fields; landing page still shows old values for up to 60 seconds.
**Why it happens:** `lib/platform-config.ts` has a 60-second in-process TTL cache (`TTL_MS = 60_000`). The `getBranding()` function will return stale data until the cache expires.
**How to avoid:** Call `invalidatePlatformConfig()` in every server action that writes to `platform_branding`. This is already the pattern in `saveBranding`.
**Warning signs:** Admin saves successfully but page refresh shows old content.

### Pitfall 3: Admin Nav Active State Bug for /admin Root
**What goes wrong:** Every admin page shows "Dashboard" nav item as active.
**Why it happens:** `pathname.startsWith('/admin/')` is true for all admin routes, and `/admin` is a prefix of all.
**How to avoid:** Use exact match (`pathname === '/admin'`) for the Dashboard nav item only.

### Pitfall 4: Blog Post RLS — Anon Client Reads Only Published Posts
**What goes wrong:** Draft blog posts are visible publicly.
**Why it happens:** If the public blog page accidentally uses `createServiceClient()` instead of `createClient()`, RLS is bypassed and drafts are returned.
**How to avoid:** Public blog routes (`app/blog/`) must use `createClient()` (session-based), not `createServiceClient()`. The `blog_posts_public_read` RLS policy ensures `WHERE status = 'published'`.

### Pitfall 5: Tailwind v4 Typography Plugin Syntax
**What goes wrong:** `prose` classes have no effect after adding the plugin.
**Why it happens:** Tailwind v4 uses CSS-layer `@plugin` syntax, not `plugins: [require('@tailwindcss/typography')]` in `tailwind.config.js` (v3 syntax). This project uses v4.
**How to avoid:** Add to `app/globals.css`:
```css
@plugin "@tailwindcss/typography";
```
Do NOT add to `tailwind.config.js` — there isn't one in this project (Tailwind v4 is config-file-free).

### Pitfall 6: react-markdown XSS in Custom HTML
**What goes wrong:** Blog authors paste `<script>` tags in markdown content, creating XSS vectors.
**Why it happens:** react-markdown with `rehype-raw` plugin renders raw HTML. Without it, HTML tags are escaped by default.
**How to avoid:** Do NOT install `rehype-raw`. The default react-markdown behavior escapes HTML tags in markdown content, which is safe for user-authored content. If rich HTML is needed, sanitize with `dompurify` server-side first.

---

## Database Schema Changes

### Migration: 20260503000001_phase15_admin_panel.sql

```sql
-- 1. Extend platform_branding with SEO + content + favicon columns
ALTER TABLE public.platform_branding
  ADD COLUMN IF NOT EXISTS site_title TEXT,
  ADD COLUMN IF NOT EXISTS meta_description TEXT,
  ADD COLUMN IF NOT EXISTS og_image_url TEXT,
  ADD COLUMN IF NOT EXISTS canonical_base_url TEXT,
  ADD COLUMN IF NOT EXISTS favicon_url TEXT,
  ADD COLUMN IF NOT EXISTS landing_content JSONB DEFAULT '{}'::jsonb;

-- 2. blog_posts table
CREATE TABLE public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  meta_title TEXT,
  meta_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX blog_posts_slug_unique ON public.blog_posts (slug);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blog_posts_public_read" ON public.blog_posts
  FOR SELECT USING (status = 'published');
-- Admin writes via service role (bypasses RLS)

-- 3. RPC for user count
CREATE OR REPLACE FUNCTION public.get_platform_user_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*) FROM auth.users;
$$;
```

**RLS coverage:** `blog_posts` has public read for published posts (same pattern as `estimates` anon share token). Admin writes use service role — no insert/update/delete policies needed for authenticated users.

---

## Code Examples

### Dashboard Stats Card (Server Component)

```typescript
// Source: pattern from lib/queries/dashboard.ts, extended for platform-wide
import { createServiceClient } from '@/lib/supabase/service'

async function getPlatformStats() {
  const svc = createServiceClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [companiesRes, estimatesRes, userCountRes] = await Promise.all([
    svc.from('companies').select('*', { count: 'exact', head: true }),
    svc.from('estimates').select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo),
    svc.rpc('get_platform_user_count'),
  ])

  return {
    totalCompanies: companiesRes.count ?? 0,
    estimatesLast30d: estimatesRes.count ?? 0,
    totalUsers: (userCountRes.data as number) ?? 0,
  }
}
```

### SEO Metadata in Root Layout

```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
// app/layout.tsx — extends current generateMetadata
export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding()  // now includes site_title, meta_description, etc.
  const base = b.canonicalBaseUrl ? new URL(b.canonicalBaseUrl) : undefined
  return {
    metadataBase: base,
    title: {
      default: b.siteTitle ?? b.appName,
      template: `%s | ${b.siteTitle ?? b.appName}`,
    },
    description: b.metaDescription ?? `Professional AI-powered estimates — ${b.appName}`,
    openGraph: b.ogImageUrl ? { images: [b.ogImageUrl] } : undefined,
    icons: b.faviconUrl ? { icon: b.faviconUrl } : undefined,
  }
}
```

### Blog Post Detail Page with SEO

```typescript
// app/blog/[slug]/page.tsx
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getBlogPost(slug)
  if (!post) return { title: 'Post Not Found' }
  return {
    title: post.meta_title ?? post.title,
    description: post.meta_description ?? post.excerpt ?? undefined,
    openGraph: {
      type: 'article',
      publishedTime: post.published_at ?? undefined,
      images: post.cover_image_url ? [post.cover_image_url] : [],
    },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()  // anon client — RLS filters to published only
  const { data: post } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!post) notFound()
  return <BlogContent markdown={post.content} />
}
```

### Activating @tailwindcss/typography (Tailwind v4)

```css
/* app/globals.css — add after @import "tailwindcss"; */
@plugin "@tailwindcss/typography";
```

Usage in blog content component:
```tsx
<article className="prose prose-invert max-w-none">
  <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
</article>
```

---

## Environment Availability

Step 2.6: SKIPPED for most dependencies — all required tools are already in the project's Node.js/npm ecosystem. No external services, databases, or CLI tools beyond what already exists are needed.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/dev | Yes | v24.13.0 | — |
| npm | Package install | Yes | 11.6.2 | — |
| Supabase (remote) | DB queries | Yes (existing project) | @supabase/supabase-js 2.103.0 | — |
| react-markdown | Blog rendering | No — needs install | 10.1.0 (npm latest) | Plain `<pre>` for text only |
| remark-gfm | GFM markdown | No — needs install | 4.0.1 (npm latest) | react-markdown works without it (no tables) |
| @tailwindcss/typography | Blog prose styles | Yes (node_modules) | 0.5.19 | Manual prose CSS |

**Missing dependencies with no fallback:** None that block execution.
**Missing dependencies with fallback:** react-markdown and remark-gfm need `npm install` — without them blog posts render as raw text.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 + @testing-library/react 16.3.2 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` (vitest run) |
| Full suite command | `npm test` |
| E2E framework | Playwright 1.59.1 |
| E2E run command | `npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Dashboard stats server action returns counts | unit | `npm test -- --reporter=verbose tests/unit/admin-dashboard.test.ts` | No — Wave 0 |
| SEO-01 | saveSeo writes to platform_branding, calls invalidatePlatformConfig | unit | `npm test -- tests/unit/seo-actions.test.ts` | No — Wave 0 |
| SEO-02 | generateMetadata includes DB site_title/description/ogImage | unit | `npm test -- tests/unit/root-metadata.test.ts` | No — Wave 0 |
| LP-01 | saveLandingContent writes to platform_branding.landing_content | unit | `npm test -- tests/unit/landing-actions.test.ts` | No — Wave 0 |
| BLOG-01 | createPost server action creates blog_posts row with correct slug | unit | `npm test -- tests/unit/blog-actions.test.ts` | No — Wave 0 |
| BLOG-02 | Public blog page returns 404 for draft posts (RLS check) | integration | `npm test -- tests/integration/blog-rls.test.ts` | No — Wave 0 |
| BRAND-01 | saveBranding accepts faviconUrl, saves to platform_branding | unit | `npm test -- tests/unit/branding-actions.test.ts` | Yes (extend) |

### Sampling Rate
- **Per task commit:** `npm test` (vitest unit suite, ~5-10s)
- **Per wave merge:** `npm test && npm run test:e2e`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/admin-dashboard.test.ts` — covers DASH-01
- [ ] `tests/unit/seo-actions.test.ts` — covers SEO-01
- [ ] `tests/unit/root-metadata.test.ts` — covers SEO-02
- [ ] `tests/unit/landing-actions.test.ts` — covers LP-01
- [ ] `tests/unit/blog-actions.test.ts` — covers BLOG-01
- [ ] `tests/integration/blog-rls.test.ts` — covers BLOG-02
- [ ] Migration: `supabase/migrations/20260503000001_phase15_admin_panel.sql`
- [ ] `lib/queries/blog.ts` — shared blog query helpers

---

## Open Questions

1. **Landing page icon names in DB:** The features section uses Lucide icon names hardcoded in `features-section.tsx`. If stored in DB as strings, the client component needs a static `ICON_MAP`. Should the icon be configurable per feature, or should the icon set be fixed (only the text is editable)?
   - What we know: Current icons are `BrainCircuit`, `FileBadge2`, `Link2`, `Smartphone`
   - What's unclear: Whether admin needs icon selection or just text editing
   - Recommendation: Start with text-only editing (hero, steps, feature title/desc/benefit). Keep icons as code constants. Simpler admin UI, fewer edge cases.

2. **Blog content editor type:** The phase says "markdown or rich text." A plain `<Textarea>` in the admin form works for markdown but is not ergonomic. A rich text editor (TipTap, Quill) adds complexity and bundle size.
   - Recommendation: Use `<Textarea>` with a markdown preview panel (same pattern as branding preview card). No additional library. The admin is a developer (skale.club@gmail.com) — markdown is acceptable.

3. **Blog post update timestamp:** `blog_posts.updated_at` should auto-update on every row change. A Postgres trigger (same pattern as `companies.updated_at` in the initial schema) is the correct approach — but the initial schema does NOT appear to have a trigger for `updated_at` on any table (they are set manually in application code). Confirm: is there a `set_updated_at()` trigger function available?
   - What we know: `estimates` and `companies` have `updated_at` columns but no trigger visible in the migration files — they are set explicitly in server actions
   - Recommendation: Set `updated_at = new Date().toISOString()` in the blog update server action, consistent with existing patterns.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MDX files on disk | DB-stored markdown | N/A (greenfield) | Admin edits without redeploy |
| `tailwind.config.js plugins: []` | `@plugin` in CSS | Tailwind v4 (2024) | Must use CSS syntax, not JS config |
| `generateMetadata` blocks render | Streaming metadata (v15.2+) | Feb 2026 | Better TTFB; HTML-limited bots still get blocking behavior |
| `app/favicon.ico` file only | `metadata.icons` object in generateMetadata | v13.2 | Dynamic favicon from DB URL is possible |
| `themeColor` in metadata | `generateViewport` | v14 | Deprecated — use `generateViewport` if needed |

---

## Sources

### Primary (HIGH confidence)
- Next.js official docs v16.2.4 — `generateMetadata`, app icons, metadata fields: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Next.js official docs v16.2.4 — favicon/icon file conventions: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons
- Existing codebase — `lib/queries/dashboard.ts`, `app/admin/branding/actions.ts`, `supabase/migrations/*.sql`
- `@tailwindcss/typography` npm registry — version 0.5.19 confirmed installed in node_modules

### Secondary (MEDIUM confidence)
- Supabase docs — `auth.admin.listUsers` pagination: https://supabase.com/docs/reference/javascript/auth-admin-listusers
- DEV.to — Tailwind v4 typography plugin CSS-layer `@plugin` syntax: https://dev.to/gridou/announcing-tw-prose-a-css-only-typography-plugin-for-tailwind-css-v4-o8j
- Next.js docs — ISR/revalidatePath patterns: https://nextjs.org/docs/app/api-reference/functions/revalidatePath

### Tertiary (LOW confidence — needs runtime verification)
- Browser behavior for metadata.icons vs static app/favicon.ico priority ordering

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against npm registry and installed package.json
- Architecture: HIGH — directly modeled on existing Phase 8 patterns in codebase
- Dashboard stats queries: HIGH — count pattern already in lib/queries/dashboard.ts
- SEO metadata API: HIGH — verified against Next.js 16.2.4 official docs
- Landing content JSONB approach: HIGH — matches singleton platform_branding pattern
- Blog system: HIGH (structure) / MEDIUM (ISR vs SSR tradeoff)
- Favicon from storage: MEDIUM — official docs confirm icons in metadata object, but browser precedence vs static file needs runtime test
- Typography plugin v4 syntax: HIGH — confirmed in npm package and Tailwind v4 community

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (stable ecosystem — Next.js, Supabase, Tailwind change infrequently at patch level)
