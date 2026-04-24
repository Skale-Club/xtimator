# Phase 1: Foundation & Auth - Research

**Researched:** 2026-04-09
**Domain:** Next.js 15 App Router, Supabase Auth SSR, PostgreSQL RLS, shadcn/ui, Bun
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Centered card layout on all auth pages. Single form card centered on a plain/subtle background. Works well on mobile.
- **D-02:** App logo + wordmark ("Xtimator") appears above the card on all auth pages.
- **D-03:** Google OAuth button at top of card, visual divider ("or"), then email/password form below.
- **D-04:** No landing/marketing page in v1. Root `/` redirects: logged-out → `/auth/login`, logged-in → `/dashboard`.
- **D-05:** Middleware protects **all routes except** `/auth/*` and `/estimate/*`. Everything else requires authentication.
- **D-06:** Executor infers the full column-level schema from `REQUIREMENTS.md` and domain knowledge. No pre-defined spec file.
- **D-07:** All primary keys use `UUID DEFAULT gen_random_uuid()`. Supabase-idiomatic standard.
- **D-08:** Hard-delete for v1 — no `deleted_at` soft-delete columns.
- **D-09:** Install the full app component set in Phase 1. Minimum set: `button`, `input`, `form`, `card`, `dialog`, `toast` (sonner), `badge`, `select`, `tabs`, `avatar`, `dropdown-menu`, `label`, `separator`, `sheet`, `skeleton`, `textarea`, `alert`, `alert-dialog`, `progress`, `scroll-area`, `tooltip`, `popover`, `calendar`, `checkbox`, `radio-group`, `switch`, `table`, `command`, `navigation-menu`.

### Claude's Discretion

- Exact Tailwind theme token values and color palette (neutral default for Phase 1)
- Specific waveform and animation choices on auth pages (keep clean)
- Exact shadcn/ui theme configuration (New York style locked; specific radius/color tokens are Claude's call)
- Error message copy for auth failures (follow Supabase error codes; be user-friendly)
- Whether to use `next-themes` for future dark mode groundwork (out of scope for v1 but provider cost is negligible)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can sign up with email and password via Supabase Auth | Supabase `signUp()` via `@supabase/ssr` browser client; server action pattern |
| AUTH-02 | User can sign in with email and password | Supabase `signInWithPassword()`; form with react-hook-form + zod |
| AUTH-03 | User can sign in with Google OAuth | `signInWithOAuth({ provider: 'google' })` + callback route handler |
| AUTH-04 | User session persists across browser refresh | `@supabase/ssr` cookie-based session; `updateSession` in middleware refreshes tokens |
| AUTH-05 | User can reset password via email link | `resetPasswordForEmail()` + `/auth/reset-password` page handling `type=recovery` |
| AUTH-06 | After first sign-up with no company record, redirect to `/onboarding` | Middleware or server component checks `companies` table for the user's `id` |
| AUTH-07 | User can sign out from any authenticated page | Server action calling `supabase.auth.signOut()`; redirects to `/auth/login` |
| SEC-01 | RLS enabled on all 8 database tables | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` in migrations |
| SEC-02 | Public share link routes bypass RLS for read-only estimate viewing | `/estimate/*` excluded from middleware; separate policy for anon reads on estimates |
| SEC-03 | Service role key never exposed to browser | Service role key only in API route handlers (server-side); never in client bundle |
| SEC-04 | Storage files scoped to owning company | Storage RLS policies using `storage.foldername(name)[1]` to match `company_id` |
</phase_requirements>

---

## Summary

Phase 1 establishes the entire technical foundation: Next.js scaffold with Bun as the package manager, Supabase client wiring for SSR auth, all 8 database tables with RLS, Storage bucket policies, and working auth UI (login, signup, password reset, Google OAuth). This is a greenfield project — no existing code exists beyond CLAUDE.md and docs/.

The critical decision point for this phase is the Supabase API key naming. The existing `.env.example` uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy format), but new Supabase documentation now recommends `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with the new `sb_publishable_...` key format. The Supabase project `prmqgcrnpuvpzruyzvuv.supabase.co` pre-dates November 2025 so it may still use legacy keys. The executor must check which key format the project uses and name env vars accordingly — both formats work with the same `@supabase/ssr` client code.

The Supabase SSR library has changed its recommended session validation method from `getSession()` to `getClaims()`. Using `getSession()` in server-side code is explicitly warned against in current docs. All middleware and server component auth checks must use `getClaims()`.

**Primary recommendation:** Scaffold with `bunx create-next-app@latest` (picks up Next.js 16 which is backward-compatible with App Router patterns), then wire Supabase SSR using `@supabase/ssr@0.10.2`, and write migrations using Supabase CLI 2.75.0 (already installed).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.3 (latest) | App framework; App Router, server components, API routes | Project constraint; latest stable |
| typescript | 5.x | Static typing with strict mode | Project constraint |
| tailwindcss | 4.2.2 | Utility-first CSS | Project constraint |
| @supabase/supabase-js | 2.103.0 | Supabase client SDK | Project constraint |
| @supabase/ssr | 0.10.2 | Cookie-based SSR auth for Next.js | Required for App Router auth |
| react-hook-form | 7.72.1 | Form state management | Project constraint |
| zod | 4.3.6 | Schema validation for forms and API | Project constraint |
| shadcn/ui (CLI) | 4.2.0 | Component library (New York style) | Project constraint |
| sonner | latest (via shadcn) | Toast notifications | D-09; included in component list |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @hookform/resolvers | latest | Connects zod schemas to react-hook-form | Every form with zod validation |
| next-themes | latest | Theme provider (light/dark groundwork) | Optional per Claude's Discretion — adds ~200 bytes |
| lucide-react | latest (via shadcn) | Icons used by shadcn/ui components | Already pulled in by shadcn |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @supabase/ssr | @supabase/auth-helpers-nextjs (0.15.0) | auth-helpers is deprecated; @supabase/ssr is the current replacement |
| sonner | react-hot-toast | sonner is shadcn/ui's official toast; use sonner |
| react-hook-form | Formik | react-hook-form is project constraint; no alternative considered |

**Installation (after scaffold):**
```bash
bun add @supabase/supabase-js @supabase/ssr @hookform/resolvers
bunx shadcn@latest init
bunx shadcn@latest add button input form card dialog badge select tabs avatar dropdown-menu label separator sheet skeleton textarea alert alert-dialog progress scroll-area tooltip popover calendar checkbox radio-group switch table command navigation-menu sonner
```

**Version verification (confirmed 2026-04-09):**
- `next`: 16.2.3
- `@supabase/ssr`: 0.10.2
- `@supabase/supabase-js`: 2.103.0
- `shadcn` CLI: 4.2.0
- `react-hook-form`: 7.72.1
- `zod`: 4.3.6
- `tailwindcss`: 4.2.2
- `bun`: 1.3.8 (installed)

---

## Architecture Patterns

### Recommended Project Structure
```
app/
├── (auth)/
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── reset-password/page.tsx
│   └── callback/route.ts        # OAuth code exchange
├── layout.tsx                   # Root layout with Toaster
├── page.tsx                     # Root redirect (logged-out→/auth/login, logged-in→/dashboard)
├── dashboard/                   # Protected (future phases)
└── estimate/                    # Public (bypasses middleware per D-05)
lib/
├── supabase/
│   ├── client.ts                # createBrowserClient for Client Components
│   ├── server.ts                # createServerClient for Server Components/Actions
│   └── proxy.ts                 # updateSession for middleware
middleware.ts                    # Session refresh + route protection
supabase/
├── migrations/
│   └── 20260409000001_initial_schema.sql
└── seed.sql
components/
└── ui/                          # shadcn/ui components (auto-generated)
types/
└── env.d.ts                     # TypeScript env var types
```

### Pattern 1: Supabase SSR Client Wiring (NEW API — getClaims, not getSession)

**What:** Three separate client creation utilities for different rendering contexts.
**When to use:** Always. Never import createClient directly outside these files.

```typescript
// lib/supabase/client.ts — for Client Components
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // or PUBLISHABLE_KEY if project uses new keys
  )
}
```

```typescript
// lib/supabase/server.ts — for Server Components, Server Actions, Route Handlers
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {} // Server Components can't set cookies; middleware handles this
        },
      },
    }
  )
}
```

```typescript
// lib/supabase/proxy.ts — session refresh (called by middleware)
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers ?? {}).forEach(([k, v]) =>
            supabaseResponse.headers.set(k, v)
          )
        },
      },
    }
  )

  // CRITICAL: Use getClaims(), NOT getSession()
  const { data: { claims } } = await supabase.auth.getClaims()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
  const isPublicEstimate = request.nextUrl.pathname.startsWith('/estimate')

  if (!claims && !isAuthRoute && !isPublicEstimate) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

```typescript
// middleware.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### Pattern 2: Google OAuth Flow (Two-Step)

**What:** Client triggers OAuth redirect; callback route exchanges code for session.
**When to use:** Any social login flow.

```typescript
// Trigger (Client Component action):
const supabase = createClient()
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
})

// app/(auth)/callback/route.ts — exchanges code for session:
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL(next, request.url))
}
```

### Pattern 3: Post-Auth Redirect (company check)

**What:** After sign-in, check if user has a `companies` record. No company → `/onboarding`; company exists → `/dashboard`.
**When to use:** After all auth events (email login, OAuth callback).

```typescript
// In callback route or sign-in server action:
const supabase = await createClient()
const { data: { claims } } = await supabase.auth.getClaims()

if (claims) {
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  return NextResponse.redirect(
    new URL(company ? '/dashboard' : '/onboarding', request.url)
  )
}
```

### Pattern 4: RLS Policy — company_id scoping

**What:** All user-owned tables have RLS policies that restrict access to rows where `company_id` matches the user's company.
**When to use:** Every table that holds user data (all 8 tables).

```sql
-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- SELECT: user can only read their company's rows
CREATE POLICY "company_select" ON projects
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );

-- INSERT: user can only insert rows for their company
CREATE POLICY "company_insert" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );

-- UPDATE and DELETE follow the same pattern
```

### Pattern 5: Storage Policy — company-scoped paths

**What:** Files stored under `{company_id}/...` prefix; policies validate the path prefix matches the user's company.

```sql
-- storage.objects INSERT policy for 'audio' bucket
CREATE POLICY "company_audio_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audio' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );

-- SELECT: same pattern for downloads
CREATE POLICY "company_audio_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'audio' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
```

### Pattern 6: Auth Form — react-hook-form + zod

```typescript
// Zod schema
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

// Form component
const form = useForm<z.infer<typeof loginSchema>>({
  resolver: zodResolver(loginSchema),
  defaultValues: { email: '', password: '' },
})

// Submit handler calls server action or API route
```

### Anti-Patterns to Avoid

- **Using `getSession()` in server code:** Supabase now explicitly warns against this. Use `getClaims()` instead — it validates the JWT signature. `getSession()` only reads from storage without revalidating.
- **Calling Supabase service role client from browser:** The service role key bypasses RLS. It must only appear in `process.env.SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix) and only be imported in API route handlers.
- **Creating new `NextResponse` after `updateSession`:** The middleware must return the exact `supabaseResponse` object that `createServerClient` wrote cookies to — creating a new response loses the cookie updates.
- **Missing `await` on `cookies()`:** In Next.js 15+, `cookies()` from `next/headers` is async and must be awaited.
- **Importing `@supabase/auth-helpers-nextjs`:** This package is deprecated. Use `@supabase/ssr` exclusively.
- **RLS without SELECT policy on UPDATE tables:** PostgreSQL requires a SELECT policy to exist for UPDATE/DELETE operations to work correctly in Supabase.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cookie management | Custom JWT cookie logic | `@supabase/ssr` `createServerClient` | Token rotation, PKCE flow, concurrent-request safety are solved |
| Google OAuth PKCE flow | Custom OAuth implementation | `supabase.auth.signInWithOAuth()` | PKCE nonce, code exchange, state parameter handled automatically |
| Form validation | Custom error state | `react-hook-form` + `zod` | Field-level errors, async validation, submit state management |
| Password reset flow | Custom token email | `supabase.auth.resetPasswordForEmail()` | Supabase handles email delivery and token validation |
| UI components | Custom Button/Input/Card | shadcn/ui (installed in bulk per D-09) | Consistent design, accessibility, Tailwind integration |
| Toast notifications | Custom toast component | `sonner` via shadcn | Animation, queuing, position management |

**Key insight:** Supabase Auth handles the entire token lifecycle (issue, refresh, revoke). The only custom logic needed is: redirect decisions based on business rules (company check) and UI (forms, pages).

---

## Common Pitfalls

### Pitfall 1: getClaims vs getSession confusion
**What goes wrong:** Developer uses `supabase.auth.getSession()` in middleware or server components to check auth. This reads from the cookie without re-validating the token signature.
**Why it happens:** Older docs and many tutorials still use `getSession()`. It was the old API.
**How to avoid:** Always use `getClaims()` in server code. The current Supabase example middleware uses `getClaims()`.
**Warning signs:** Middleware passes for requests with expired/tampered JWTs.

### Pitfall 2: Supabase API key naming mismatch
**What goes wrong:** Code uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` but `.env.local` has `NEXT_PUBLIC_SUPABASE_ANON_KEY`, causing `undefined` errors at runtime.
**Why it happens:** Supabase is migrating from legacy anon key to new publishable key format. The existing `.env.example` uses `ANON_KEY`. New Supabase docs show `PUBLISHABLE_KEY`.
**How to avoid:** Check the Supabase dashboard for the actual project's key format. The existing project (`prmqgcrnpuvpzruyzvuv`) uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` (per `.env.example`). Use that exact name. Both work with `@supabase/ssr`.
**Warning signs:** `createBrowserClient` receives `undefined` as second argument; silent auth failures.

### Pitfall 3: Missing `await` on `cookies()` in Next.js 15+
**What goes wrong:** `const cookieStore = cookies()` without `await` returns a promise object, not the cookie store. Cookie reads return `undefined`.
**Why it happens:** Next.js 15 made `cookies()` (and `headers()`) async.
**How to avoid:** Always `await cookies()` in server utilities. The server client factory must be an `async` function.
**Warning signs:** TypeScript won't catch this at compile time if types aren't strict; cookies appear empty at runtime.

### Pitfall 4: Creating new NextResponse in middleware breaking cookie sync
**What goes wrong:** After `updateSession`, creating a new `NextResponse` (e.g., for redirects) loses the session cookies that `createServerClient` wrote into `supabaseResponse`.
**Why it happens:** Supabase SSR writes auth cookies to the specific response object it holds internally. A new response object doesn't have those cookies.
**How to avoid:** For redirects in middleware, use `NextResponse.redirect()` but copy the set-cookie headers from `supabaseResponse` to the new redirect response.
**Warning signs:** Users are logged out after OAuth callback despite successful token exchange.

### Pitfall 5: RLS policies block all data reads
**What goes wrong:** RLS is enabled but policies only cover `INSERT`; `SELECT` returns empty. Or policies are written with `auth.uid() = user_id` but the table uses `company_id`, not `user_id`.
**Why it happens:** Schema has a `companies` table with `user_id`, and data tables reference `company_id`. The subquery pattern (`SELECT id FROM companies WHERE user_id = auth.uid()`) is required.
**How to avoid:** Test each policy immediately after writing. Use `supabase db reset` locally or query via the Supabase Dashboard Table Editor as an authenticated user.
**Warning signs:** Empty query results from authenticated requests; no errors returned (RLS silently filters).

### Pitfall 6: shadcn/ui component installation order
**What goes wrong:** Later phases try to `bunx shadcn add X` and it overwrites or conflicts with already-customized theme configuration.
**Why it happens:** Some shadcn components add CSS variables to `globals.css`; running init again can overwrite custom tokens.
**How to avoid:** Install all required components in Phase 1 as specified in D-09. After initial install, do not re-run `shadcn init`.
**Warning signs:** Theme colors reset after adding a new component.

### Pitfall 7: Google OAuth redirect URI not configured
**What goes wrong:** Google OAuth returns `redirect_uri_mismatch` error.
**Why it happens:** Google Cloud Console requires explicit allowed redirect URIs; `http://localhost:3000/auth/callback` must be added for dev and the production URL for prod.
**How to avoid:** Add both `http://localhost:3000/auth/callback` and `https://{vercel-domain}/auth/callback` to Google Cloud Console authorized redirect URIs before testing. Also add the Supabase project callback URL (`https://prmqgcrnpuvpzruyzvuv.supabase.co/auth/v1/callback`).
**Warning signs:** OAuth flow redirects to Google and returns immediately with an error page.

---

## Code Examples

### Database Migration: Initial Schema
```sql
-- Source: Supabase migration pattern, domain-derived schema

-- COMPANIES
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_name TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  license_number TEXT,
  insurance_info TEXT,
  industry TEXT,
  brand_primary_color TEXT DEFAULT '#2563EB',
  logo_url TEXT,
  default_tax_rate NUMERIC(5,4) DEFAULT 0,
  default_payment_terms TEXT,
  default_warranty_terms TEXT,
  default_validity_days INTEGER DEFAULT 30,
  notify_on_view BOOLEAN DEFAULT true,
  notify_on_accept BOOLEAN DEFAULT true,
  notify_on_decline BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CLIENTS
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  logo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PROJECTS
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  project_type TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  target_budget NUMERIC(12,2),
  total NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RECORDINGS
CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  duration_seconds INTEGER,
  transcript TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PHOTOS
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  ai_description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ESTIMATES
CREATE TABLE estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,
  share_token UUID DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'draft',
  summary TEXT,
  notes TEXT,
  timeline TEXT,
  payment_terms TEXT,
  warranty_terms TEXT,
  subtotal NUMERIC(12,2) DEFAULT 0,
  discount_type TEXT,
  discount_value NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  tax_rate NUMERIC(5,4) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  client_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ESTIMATE_SECTIONS
CREATE TABLE estimate_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) DEFAULT 0
);

-- ESTIMATE_ITEMS
CREATE TABLE estimate_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES estimate_sections(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ESTIMATE_ACTIVITY
CREATE TABLE estimate_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ENABLE RLS ON ALL TABLES
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_activity ENABLE ROW LEVEL SECURITY;
```

### RLS Policies Pattern (apply for each table)
```sql
-- COMPANIES: user_id direct match
CREATE POLICY "companies_select" ON companies FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "companies_insert" ON companies FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "companies_update" ON companies FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "companies_delete" ON companies FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- For all other tables (example: projects), use subquery:
CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- ESTIMATES: also needs anon read for public share links (SEC-02)
CREATE POLICY "estimates_anon_select_by_share_token" ON estimates FOR SELECT TO anon
  USING (share_token IS NOT NULL);
```

### Storage Bucket Creation (in migration or via Supabase dashboard)
```sql
-- Create buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('audio', 'audio', false, 52428800, ARRAY['audio/*']),   -- 50MB
  ('photos', 'photos', false, 10485760, ARRAY['image/*']),  -- 10MB
  ('pdfs', 'pdfs', false, 20971520, ARRAY['application/pdf']),
  ('logos', 'logos', false, 5242880, ARRAY['image/*']);

-- Storage policies (all buckets follow same pattern; example: photos)
CREATE POLICY "company_photos_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "company_photos_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "company_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | ~2023, deprecated 2024 | auth-helpers still works but is unmaintained; use @supabase/ssr |
| `supabase.auth.getSession()` in server | `supabase.auth.getClaims()` | Announced late 2024/2025 | getSession() doesn't re-validate JWT; getClaims() does |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) | New projects after Nov 2025 | Existing project likely still uses ANON_KEY; check dashboard |
| `cookies()` sync in Next.js 14 | `await cookies()` async in Next.js 15+ | Next.js 15 (Oct 2024) | Forgetting await returns a Promise, not cookie values |
| `pnpm dlx shadcn-ui@latest` | `bunx shadcn@latest` | Package renamed from `shadcn-ui` to `shadcn` | Wrong package name causes install failure |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs` (0.15.0): deprecated, still works but no new features
- `shadcn-ui` npm package: renamed to `shadcn` — old name installs wrong version

---

## Open Questions

1. **Supabase API key format for this project**
   - What we know: `.env.example` uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`; new Supabase projects (after Nov 2025) use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - What's unclear: The `prmqgcrnpuvpzruyzvuv` project was set up before research and may use either format
   - Recommendation: Executor must open Supabase dashboard → Project Settings → API Keys, verify the key format actually in `.env.local`, and use that exact env var name throughout. Both formats work identically in code.

2. **Next.js version to scaffold with**
   - What we know: CLAUDE.md says "Next.js 14+"; latest is 16.2.3; the `create-next-app` default installs latest (16)
   - What's unclear: Whether any Phase 1 patterns differ between 14 and 16
   - Recommendation: Scaffold with latest (`bunx create-next-app@latest`) which installs 16.x. All App Router patterns documented here apply. If there's a specific reason to pin 14, pin explicitly with `create-next-app@14`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| bun | Package manager, scaffold | ✓ | 1.3.8 | — |
| node | Next.js runtime | ✓ | 24.13.0 | — |
| git | Version control | ✓ | 2.52.0 | — |
| supabase CLI | Migrations | ✓ | 2.75.0 | Use Supabase dashboard SQL editor |
| Next.js scaffold (create-next-app) | Project scaffold | ✓ (via bunx) | 16.2.3 (latest) | — |

**Missing dependencies with no fallback:** None.

**Notes:**
- Supabase CLI 2.75.0 is installed and sufficient for `supabase migration new`, `supabase db push`, and `supabase link`.
- The Supabase project already exists (`prmqgcrnpuvpzruyzvuv.supabase.co`); no project creation needed.
- `.env.local` already exists with credentials; the scaffold must not overwrite it.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None yet — greenfield project |
| Config file | none — Wave 0 must create if tests are required |
| Quick run command | `bun test` (Bun built-in test runner) |
| Full suite command | `bun test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Sign up creates user in Supabase Auth | manual-only (requires live Supabase) | manual browser test | ❌ |
| AUTH-02 | Sign in with email/password succeeds | manual-only | manual browser test | ❌ |
| AUTH-03 | Google OAuth sign-in completes | manual-only (requires Google OAuth config) | manual browser test | ❌ |
| AUTH-04 | Session survives browser refresh | manual-only | manual browser test | ❌ |
| AUTH-05 | Password reset email is sent and link works | manual-only | manual browser test | ❌ |
| AUTH-06 | No-company user redirected to /onboarding | smoke | `bun test tests/middleware.test.ts` | ❌ Wave 0 |
| AUTH-07 | Sign-out clears session and redirects | manual-only | manual browser test | ❌ |
| SEC-01 | RLS blocks cross-user data access | manual-only (requires two test accounts) | manual SQL test | ❌ |
| SEC-02 | Public estimate share accessible without auth | smoke | `bun test tests/middleware.test.ts` | ❌ Wave 0 |
| SEC-03 | Service role key not in client bundle | unit | `bun test tests/env.test.ts` | ❌ Wave 0 |
| SEC-04 | Storage access blocked for wrong company | manual-only | manual browser test | ❌ |

**Justification for manual-only items:** Auth flows require a live Supabase instance with real OAuth credentials; unit/integration tests against Supabase Auth are out of scope for this phase. The auth flows are verified manually through the browser against the real project.

### Sampling Rate
- **Per task commit:** n/a (no automated tests for Phase 1 auth flows)
- **Per wave merge:** `bun test` if any test files exist
- **Phase gate:** Manual browser walkthrough of all 5 success criteria from ROADMAP.md before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/middleware.test.ts` — covers AUTH-06 (redirect logic), SEC-02 (public route bypass) using mock Request objects
- [ ] `tests/env.test.ts` — covers SEC-03 (verifies SUPABASE_SERVICE_ROLE_KEY is not prefixed with NEXT_PUBLIC_)
- [ ] Framework install: `bun test` is built-in — no install needed

---

## Sources

### Primary (HIGH confidence)
- Supabase SSR docs (`supabase.com/docs/guides/auth/server-side/nextjs`) — getClaims vs getSession, @supabase/ssr patterns
- Supabase RLS docs (`supabase.com/docs/guides/database/postgres/row-level-security`) — policy patterns, pitfalls
- Supabase Storage access control docs — storage.foldername() pattern
- Supabase Google OAuth docs — two-step OAuth flow, redirect URI setup
- npm registry — verified package versions (2026-04-09): next@16.2.3, @supabase/ssr@0.10.2, @supabase/supabase-js@2.103.0, shadcn@4.2.0, react-hook-form@7.72.1, zod@4.3.6, tailwindcss@4.2.2, bun@1.3.8
- shadcn/ui installation docs — New York style, component list, Toaster setup
- bun docs (bun.sh) — bunx is npx equivalent, 1.3.8 installed
- GitHub Supabase Next.js auth example — proxy.ts pattern, getClaims() usage

### Secondary (MEDIUM confidence)
- WebSearch: Supabase publishable key vs anon key migration timeline — confirmed Nov 2025 cutoff, backward-compatible
- Supabase quickstart Next.js — env var naming `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` shown in new docs

### Tertiary (LOW confidence)
- Next.js 15 async cookies() change — confirmed through multiple sources; specific migration notes not directly fetched from nextjs.org (their docs page returned 404 via WebFetch, but this is a well-documented breaking change)

---

## Project Constraints (from CLAUDE.md)

The following directives from CLAUDE.md are binding on the planner and executor:

| Directive | Constraint |
|-----------|------------|
| Next.js 14+ App Router | Must use App Router routing conventions; no Pages Router |
| TypeScript strict | `tsconfig.json` must have `"strict": true` |
| Tailwind CSS | No CSS-in-JS alternatives |
| shadcn/ui | No other component library; New York style |
| Zustand or React Context | State management (Phase 1 uses Context for auth; Zustand deferred) |
| react-hook-form + zod | All forms use this stack; no alternatives |
| Supabase PostgreSQL with RLS | RLS on all tables, no exceptions |
| Claude claude-sonnet-4-20250514 | AI calls only (not Phase 1) |
| OpenAI Whisper API | Audio transcription only (not Phase 1) |
| @react-pdf/renderer or puppeteer | PDF generation only (not Phase 1) |
| iOS Safari + Android Chrome | Audio recording and camera must work on mobile |
| Service role key never in browser | All AI/privileged calls must be server-side API routes |
| Bun | Package manager; use `bun add`, `bunx` — not npm/pnpm |
| ESLint | Configure in scaffold with Next.js default config |
| GSD Workflow Enforcement | All file changes go through GSD commands |

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry 2026-04-09
- Architecture: HIGH — verified against current Supabase SSR docs and official example
- Pitfalls: HIGH — getClaims/getSession from official docs; others from verified sources
- Validation: MEDIUM — test framework choice (bun test) is straightforward; test content estimated

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (30 days — stack is stable; Supabase API key migration is the most likely change)
