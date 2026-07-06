# Phase 154: Inbox Route Consolidation & Settings - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning
**Mode:** Autonomous run (discuss skipped per explicit user authorization to execute unattended). This phase is a structural/routing rename — deliberately does NOT touch the conversation-viewer UI (table + `Sheet`) at all; that visual refactor is Phase 155's job. Keeping this phase's diff to routing + settings-page assembly is what makes it low-risk.

<domain>
## Phase Boundary

Collapse the two super-admin nav items "WhatsApp" and "WA Templates" into a single **Inbox** nav item at `/admin/inbox`. The existing `/admin/whatsapp` page (table + tabs + `Sheet`) moves to `/admin/inbox` VERBATIM — same components, same behavior, just relocated + renamed. The Accounts tab and the whole Templates page fold into a new `/admin/inbox/settings` tabbed page. Old routes become thin redirects. Every hardcoded path reference (nav, pagination, filters, `revalidatePath`) is retargeted. Integrations > WhatsApp (credentials) and the internal `whatsapp_*` data-layer/DB naming are explicitly OUT of scope — untouched.

</domain>

<decisions>
## Implementation Decisions

### Target file layout (move + rename, not rewrite)

```
app/admin/inbox/
├── page.tsx                    ← moved from app/admin/whatsapp/page.tsx, same logic,
│                                  Accounts tab REMOVED (moves to settings/), title/copy → "Inbox"
├── admin-whatsapp-client.tsx   ← moved verbatim from app/admin/whatsapp/ (Phase 155 touches this; 154 leaves it byte-identical, just relocated)
├── admin-whatsapp-filters.tsx  ← moved from app/admin/whatsapp/, all '/admin/whatsapp' literals → '/admin/inbox'
├── loading.tsx                 ← moved from app/admin/whatsapp/
└── settings/
    └── page.tsx                ← NEW: requireAdmin() gate, shadcn Tabs "Accounts" | "Templates"
    └── admin-whatsapp-accounts.tsx  ← moved verbatim from app/admin/whatsapp/
    └── whatsapp-templates-panel.tsx ← re-export or move of components/admin/whatsapp-templates-panel.tsx (Claude's discretion: moving it under settings/ vs. leaving it in components/admin/ and just importing — importing in place is simpler and lower-risk; prefer NOT moving components/admin/whatsapp-templates-panel.tsx, just import it into the new settings page)

app/admin/whatsapp/page.tsx            ← REPLACED with a redirect stub: `redirect('/admin/inbox')`
app/admin/whatsapp-templates/page.tsx  ← REPLACED with a redirect stub: `redirect('/admin/inbox/settings')`
```

Keep `app/admin/whatsapp/admin-whatsapp-accounts.tsx`'s CONTENT (props, component name `AdminWhatsAppAccounts`) unchanged — only its file location moves to `app/admin/inbox/settings/`. Same for `admin-whatsapp-client.tsx` and `admin-whatsapp-filters.tsx` (content unchanged in 154, only relocated + path-literal updates in filters).

### Nav change — `components/admin/admin-nav.tsx`

Replace lines 25-26 (the two WhatsApp/WA-Templates entries) with ONE entry:
```ts
{ href: '/admin/inbox', label: 'Inbox', Icon: Inbox },
```
Import `Inbox` from `lucide-react` (add to the existing lucide-react import line 6; `MessageCircle` may become unused — check and remove if so). No `activeBase` field needed — the existing `isActive` logic (`pathname === activeBase || pathname.startsWith(activeBase + '/')`) already makes `/admin/inbox/settings` highlight the Inbox nav item for free, since `activeBase` defaults to `href` when absent (mirrors how `/admin/integrations/ai` already handles `/admin/integrations/*` sub-routes — but Inbox doesn't even need the explicit `activeBase` override since its own href IS the base, unlike Integrations whose href points to a sub-page `/ai`).

### Settings page — `app/admin/inbox/settings/page.tsx`

- `await requireAdmin()` FIRST (mirrors every other admin page — the service-role reads below bypass RLS, so this gate is the real access control).
- Fetch the SAME data the old two routes fetched: `whatsapp_company_configs` + `whatsapp_authorized_senders` (for Accounts) and `listTemplates()` (for Templates) — copy the exact `Promise.all` shape from the current `app/admin/whatsapp/page.tsx` lines 39-66, minus the conversations query (that stays on the Inbox page itself).
- shadcn `Tabs` (already used elsewhere, e.g. the old page's own hand-rolled `Link`-based tabs, or the real `Tabs` component from `components/ui/tabs.tsx` — prefer the real `Tabs` component for a cleaner two-tab UI, defaulting to `?tab=accounts|templates` in the URL just like the old page did with `?tab=accounts|conversations`).
- A "← Back to Inbox" link at the top pointing to `/admin/inbox`.
- Page title: "Inbox Settings" (or similar — Claude's discretion on exact copy, keep it short).

### Redirect stubs

Both old route files become a single `redirect()` call (Next.js `redirect` from `next/navigation`), no `requireAdmin()` needed in the stub itself since the target page re-checks it. Example shape:
```tsx
import { redirect } from 'next/navigation'
export default function Page() { redirect('/admin/inbox') }
```
(For `/admin/whatsapp-templates` → `redirect('/admin/inbox/settings')`.)

### Every hardcoded path reference to retarget (from the grep audit — treat this list as authoritative)

| File (new location) | Old literal | New literal |
|---|---|---|
| `app/admin/inbox/page.tsx` (pageUrl/tabUrl helpers) | `/admin/whatsapp` | `/admin/inbox` |
| `app/admin/inbox/admin-whatsapp-filters.tsx` (4 occurrences: 2× `router.replace` in date handlers, 1× in `pushParam`, 1× in "Clear filters") | `/admin/whatsapp` | `/admin/inbox` |
| `components/admin/admin-nav.tsx` (lines 25-26) | `/admin/whatsapp`, `/admin/whatsapp-templates` | collapsed into one `/admin/inbox` entry |
| `lib/actions/admin-whatsapp-accounts.ts` (6 occurrences of `revalidatePath('/admin/whatsapp')`) | `/admin/whatsapp` | `/admin/inbox/settings` (Accounts now lives there — revalidate the page that actually shows the mutated data) |

### What must NOT change

- `lib/queries/admin-whatsapp.ts`, `lib/actions/admin-whatsapp.ts`, `lib/actions/admin-whatsapp-accounts.ts`, `lib/actions/admin-whatsapp-templates.ts` — file names, function names, and exports stay identical. Only the `revalidatePath` string arguments change (see table above).
- `whatsapp_conversations`, `whatsapp_company_configs`, `whatsapp_authorized_senders`, `whatsapp_messages` — DB table names untouched.
- `app/admin/integrations/whatsapp` (via `lib/admin/integrations-providers.ts`'s `whatsapp` category + `whatsapp-config-form.tsx` + `whatsapp-system-prompt-form.tsx`) — completely untouched.
- `components/whatsapp/message-bubble.tsx` — untouched (Phase 155 uses it, unchanged here).
- `app/api/webhooks/whatsapp/route.ts`'s import of `lib/actions/admin-whatsapp-templates` — untouched (different import path, unaffected by the page move).

### Test files to update (confirmed by grep — do not miss any)

- `tests/unit/settings/tenant-whatsapp-surface.test.ts:183` — asserts `existsSync(resolve(ROOT, 'app/admin/whatsapp/page.tsx'))).toBe(true)` → update path to `app/admin/inbox/page.tsx` (the redirect stub at the old path still technically exists too — but the test's INTENT is "the admin surface exists," so point it at the new real page).
- `tests/e2e/admin-whatsapp.spec.ts` — navigates to `/admin/whatsapp`; update to `/admin/inbox`. Do NOT touch Sheet-related selectors in this phase (Phase 155's job) unless the move itself breaks something — Phase 154 should be a pure path retarget for this spec.
- `tests/unit/admin/whatsapp-filters.test.ts` — check for `/admin/whatsapp` string assertions; retarget to `/admin/inbox`. File itself may stay at its current test path (moving test files 1:1 with source isn't required — only if the test does `readFileSync` on the source file's OLD path, in which case update that path too).
- `tests/unit/admin/whatsapp-account-actions.test.ts` — check for `revalidatePath('/admin/whatsapp')` assertions; retarget to `/admin/inbox/settings`.
- `tests/unit/admin/whatsapp-templates.test.ts`, `tests/unit/whatsapp/admin-authority-contract.test.ts` — read first; update any path/existence assertions found (may need no changes if they only test action logic, not routes).

### Claude's Discretion

- Whether to physically move test files to mirror the new source locations, or just update their internal path-string assertions in place — prefer updating assertions in place (lower risk, smaller diff) unless a test does a literal `readFileSync` against the OLD file path that no longer has the real content (then it must be repointed).
- Exact wording of the Inbox page header/description copy (currently "WhatsApp" / "Platform-managed WhatsApp accounts and conversations...") — update to reference "Inbox" naturally.
- Whether `whatsapp-templates-panel.tsx` gets moved into `app/admin/inbox/settings/` or stays in `components/admin/` and is just imported — prefer leaving it in `components/admin/` (it's already a reusable component, not page-specific) and only creating the new settings page that imports it.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (move or import verbatim — do not rewrite logic)
- [`app/admin/whatsapp/page.tsx`](../../../app/admin/whatsapp/page.tsx) — the exact page being split: Conversations logic (query + filters + client + pagination) stays as `/admin/inbox`'s page; Accounts logic (the `tab === 'accounts'` branch + its data fetch) moves to the new settings page.
- [`app/admin/whatsapp/admin-whatsapp-filters.tsx`](../../../app/admin/whatsapp/admin-whatsapp-filters.tsx) — 4 hardcoded `/admin/whatsapp` literals to retarget, read in full above.
- [`app/admin/whatsapp/admin-whatsapp-accounts.tsx`](../../../app/admin/whatsapp/admin-whatsapp-accounts.tsx) — `AdminWhatsAppAccounts` component, moves to settings/ unchanged.
- [`app/admin/whatsapp-templates/page.tsx`](../../../app/admin/whatsapp-templates/page.tsx) — the exact `listTemplates()` + `WhatsAppTemplatesPanel` shape to fold into the settings Templates tab.
- [`components/admin/admin-nav.tsx`](../../../components/admin/admin-nav.tsx) — lines 6 (lucide import), 9-29 (`NAV_ITEMS`), 52-57 (`isActive` logic already supports sub-route highlighting via `activeBase` defaulting to `href`).
- [`lib/actions/admin-whatsapp-accounts.ts`](../../../lib/actions/admin-whatsapp-accounts.ts) — 6× `revalidatePath('/admin/whatsapp')` to retarget.
- `components/ui/tabs.tsx` — the real shadcn Tabs primitive to use for the new settings page (cleaner than hand-rolling `Link`-based tabs again).

### Established Patterns
- Every admin page: `await requireAdmin()` FIRST, before any service-role read (load-bearing authz, verified by index-position tests elsewhere in this codebase).
- `export const dynamic = 'force-dynamic'` on admin pages reading live `searchParams`.
- Redirect stubs via Next's `redirect()` from `next/navigation` — same mechanism already used elsewhere in the app (e.g. `app/(app)/whatsapp/page.tsx` uses `notFound()` for its tombstone; a `redirect()` tombstone is the same idea, different target).

### Integration Points
- No schema/migration changes — this phase is pure routing + component relocation.
- `components/admin/admin-nav.tsx` is the single nav-definition file; no other nav config exists to update.

</code_context>

<specifics>
## Specific Ideas

No new visual design in this phase — literally relocate existing, working UI. The only "new" surface is the Settings tabbed page shell, which should look like every other admin page (glass Card, page header pattern) with a simple `Tabs` switch, not a bespoke design.

</specifics>

<deferred>
## Deferred Ideas

- The master-detail conversation viewer redesign (table + Sheet → two-pane) — Phase 155, explicitly NOT this phase's job.
- Two-way reply/send, multi-channel, realtime — INBOXX-01/02/03 (v2), not in scope.

</deferred>
