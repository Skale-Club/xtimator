---
phase: quick-260609-hkz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/admin/whatsapp/page.tsx
  - components/admin/admin-nav.tsx
autonomous: true
requirements: [WAADMIN-01]
must_haves:
  truths:
    - "A super-admin can navigate to /admin/whatsapp via the admin sidebar"
    - "The page lists every whatsapp_conversations row across all tenant companies, newest activity first"
    - "Each row shows contact phone, contact name (muted '(unknown)' when null), associated tenant company name, unread count badge, last message preview, and last message timestamp"
    - "A summary line above the table shows the total count or an empty state"
    - "All user-facing strings are wrapped in the <T> i18n component"
  artifacts:
    - path: "app/admin/whatsapp/page.tsx"
      provides: "Server Component admin list view for WhatsApp conversations"
      contains: "requireAdmin"
      min_lines: 80
    - path: "components/admin/admin-nav.tsx"
      provides: "WhatsApp nav entry in admin sidebar"
      contains: "/admin/whatsapp"
  key_links:
    - from: "app/admin/whatsapp/page.tsx"
      to: "whatsapp_conversations table"
      via: "requireServiceClient().from('whatsapp_conversations')"
      pattern: "from\\(['\"]whatsapp_conversations['\"]\\)"
    - from: "app/admin/whatsapp/page.tsx"
      to: "companies table"
      via: "service client query joined in app code by company_id"
      pattern: "from\\(['\"]companies['\"]\\)"
    - from: "components/admin/admin-nav.tsx"
      to: "/admin/whatsapp"
      via: "NAV_ITEMS entry"
      pattern: "/admin/whatsapp"
---

<objective>
Add a read-only platform-admin section at `/admin/whatsapp` that lists every phone number that has sent WhatsApp messages to Xtimator across all tenant companies.

Purpose: Gives a platform super-admin cross-tenant visibility into inbound WhatsApp activity (which numbers are talking to the bot, for which company, and when), which is currently only visible per-tenant inside the authenticated app.

Output:
- New page `app/admin/whatsapp/page.tsx` (Server Component, force-dynamic)
- New sidebar nav entry in `components/admin/admin-nav.tsx`
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Reference page to mirror (layout/markup, Card variant="glass", table styling, <T> usage, Badge, empty state, summary line):
@app/admin/companies/page.tsx

# Nav file to edit:
@components/admin/admin-nav.tsx

<interfaces>
<!-- Verified contracts — use these directly, no codebase exploration needed. -->

Auth + service client (verified exports):
```typescript
// lib/auth/admin-context.ts
export async function requireAdmin(): Promise<AdminContext>   // throws notFound() if not super-admin

// lib/supabase/service.ts
export function requireServiceClient()   // non-nullable service-role client; bypasses RLS
```

i18n component (verified — components/i18n/t.tsx):
```typescript
// Static child: <T>Companies</T>
// Interpolated:  <T text={`${n} numbers total`} />
// Single string child only.
```

whatsapp_conversations columns (verified from migration 20260527000001_whatsapp_inbox.sql):
```
id UUID, company_id UUID, contact_phone TEXT (E.164), contact_name TEXT (nullable),
client_id UUID (nullable), last_message_at TIMESTAMPTZ (nullable),
last_message_preview TEXT (nullable), last_inbound_at TIMESTAMPTZ (nullable),
unread_count INT (default 0), created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
UNIQUE (company_id, contact_phone)
```
RLS deny-all → MUST use requireServiceClient(), never an authenticated client.

companies columns needed (verified): id UUID, name TEXT
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create the /admin/whatsapp list page</name>
  <files>app/admin/whatsapp/page.tsx</files>
  <action>
Create `app/admin/whatsapp/page.tsx` as a Server Component, mirroring `app/admin/companies/page.tsx` exactly for structure, imports, and markup.

Required boilerplate (copy the companies page pattern):
- `import { requireAdmin } from '@/lib/auth/admin-context'`
- `import { requireServiceClient } from '@/lib/supabase/service'`
- `import { Card } from '@/components/ui/card'`
- `import { Badge } from '@/components/ui/badge'`
- `import { T } from '@/components/i18n/t'`
- `export const dynamic = 'force-dynamic'`
- `export default async function AdminWhatsAppPage()` that calls `await requireAdmin()` then `const svc = requireServiceClient()`.

Data fetching (two service-client queries, joined in app code — do NOT use a Supabase FK embed):
1. Query `whatsapp_conversations`:
   ```ts
   const { data: convData } = await svc
     .from('whatsapp_conversations')
     .select('id, company_id, contact_phone, contact_name, last_message_at, last_message_preview, last_inbound_at, unread_count')
     .order('last_message_at', { ascending: false, nullsFirst: false })
     .limit(500)
   const conversations = (convData ?? []) as ConversationRow[]
   ```
2. Query `companies` for name resolution and build a Map:
   ```ts
   const { data: companyData } = await svc.from('companies').select('id, name')
   const companyNames = new Map((companyData ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))
   ```
   Resolve each row's tenant name via `companyNames.get(row.company_id)`. When missing/empty, render a muted fallback `<span className="text-muted-foreground"><T>(unknown company)</T></span>`.

Define a local `ConversationRow` type matching the selected columns (mark nullable ones `| null`).

Header block (mirror companies page tone):
- `<h1>` with the same `text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight` classes wrapping `<T>WhatsApp</T>`.
- A `text-muted-foreground` description paragraph in `<T>`, e.g. "Every phone number that has sent a WhatsApp message to the platform, across all tenant companies. Read-only."
- A `text-xs text-muted-foreground` summary line: when `conversations.length === 0` render `<T>No WhatsApp conversations yet.</T>`, otherwise `<T text={`${conversations.length} numbers total.`} />`.

Table (reuse the exact `Card variant="glass"` + `overflow-x-auto` + `<table className="w-full text-sm">` + thead/tbody classes from the companies page). Columns in this order:
1. Phone — `<th>Phone</th>`; cell `className="px-4 py-3 font-mono text-xs"` rendering `row.contact_phone`.
2. Name — cell renders `row.contact_name` when truthy, else `<span className="text-muted-foreground"><T>(unknown)</T></span>`.
3. Company — resolved tenant name (or the muted `(unknown company)` fallback above).
4. Unread — `<Badge variant="outline">{row.unread_count}</Badge>`.
5. Last message — preview text truncated gracefully: wrap in `<span className="block max-w-[280px] truncate text-muted-foreground">{row.last_message_preview ?? '—'}</span>`.
6. Last activity — human-readable timestamp from `row.last_message_at` (fall back to `row.last_inbound_at`). Format with `new Date(ts).toLocaleString()` guarded for null → render `—` when both null. Cell `className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap"`.

Empty `<tbody>` state: a single `<tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground"><T>No conversations found.</T></td></tr>` (mirror companies page).

This is a read-only list view: NO row links, NO detail/thread page, NO pagination, NO mutations, NO client components. Do NOT modify the DB schema, RLS, or the webhook handler.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>app/admin/whatsapp/page.tsx exists; tsc passes; page queries whatsapp_conversations and companies via requireServiceClient, renders the 6 columns ordered by last_message_at desc, resolves company names in app code, and uses <T> for every user-facing string.</done>
</task>

<task type="auto">
  <name>Task 2: Add the WhatsApp entry to the admin sidebar nav</name>
  <files>components/admin/admin-nav.tsx</files>
  <action>
Edit `components/admin/admin-nav.tsx`:
1. Add `MessageCircle` to the existing `lucide-react` import on line 6 (append it to the destructured list).
2. Add a new entry to the `NAV_ITEMS` array, placed after the Companies entry (operationally adjacent): `{ href: '/admin/whatsapp', label: 'WhatsApp', Icon: MessageCircle },`.

Do not change anything else — the `NAV_ITEMS.map` render loop, the `isActive` prefix-match logic, and the `t(label)` translation already handle the new entry automatically.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>admin-nav.tsx imports MessageCircle and NAV_ITEMS contains the { href: '/admin/whatsapp', label: 'WhatsApp', Icon: MessageCircle } entry; tsc passes; the sidebar renders a WhatsApp link that becomes active on /admin/whatsapp.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` is clean (no new type errors).
- Visiting `/admin/whatsapp` as a super-admin renders the list; non-admins get notFound() via `requireAdmin()` (existing behavior, untouched).
- The sidebar shows a "WhatsApp" item that highlights when on `/admin/whatsapp`.
- All visible strings flow through `<T>` (no hardcoded user-facing English outside `<T>`).
</verification>

<success_criteria>
- `/admin/whatsapp` lists all `whatsapp_conversations` rows across tenants, ordered by `last_message_at` desc, with the 6 requested columns and a summary/empty-state line.
- Company name is resolved from `company_id` via an app-code Map join (no FK embed), with a muted fallback.
- Service-role client is used for both queries (deny-all RLS respected); no authenticated client touches whatsapp_conversations.
- Sidebar nav includes the WhatsApp entry.
- No schema/RLS/webhook changes; no detail page, pagination, or mutations.
</success_criteria>

<output>
After completion, create `.planning/quick/260609-hkz-add-whatsapp-panel-to-admin-dashboard-li/260609-hkz-SUMMARY.md`
</output>
