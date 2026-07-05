# Phase 154: Inbox Route Consolidation & Settings - Research

**Researched:** 2026-07-05
**Domain:** Next.js App Router file-move/rename + path-literal retargeting (no new UI, no data-layer change)
**Confidence:** HIGH

## Summary

This phase relocates one existing, fully-working admin page (`app/admin/whatsapp/page.tsx`, currently a two-tab Conversations/Accounts page over `AdminWhatsAppClient` + `AdminWhatsAppFilters` + `AdminWhatsAppAccounts`) and folds it together with a second existing page (`app/admin/whatsapp-templates/page.tsx`) into two new routes: `/admin/inbox` (Conversations only) and `/admin/inbox/settings` (Accounts + Templates tabs). The old routes become one-line `redirect()` stubs. Every hardcoded path reference must be retargeted, and five affected test files must be updated in the same change.

I read every file involved end-to-end (not just grepped) and cross-checked the CONTEXT.md's claimed file list, line numbers, and test assertions against the actual repository state. All of CONTEXT.md's claims verified as accurate: the 6 `revalidatePath('/admin/whatsapp')` calls in `lib/actions/admin-whatsapp-accounts.ts` are at exactly lines 157, 211, 329, 365, 447, 513; the 4 `/admin/whatsapp` literals in `admin-whatsapp-filters.tsx` are exactly as described; the nav file's two entries are at lines 25-26. I also found one artifact CONTEXT.md doesn't mention: a `154-UI-SPEC.md` already exists in the phase directory with a pre-approved copy/design contract (page titles, descriptions, settings-page JSX skeleton) that is more specific than CONTEXT.md's "Claude's discretion" notes on copy — the planner should treat UI-SPEC.md's copy as the source of truth over CONTEXT.md's looser suggestions, since they were both authored by the same pipeline and UI-SPEC is the later, more specific artifact.

I ran the full affected unit-test set (67 tests across the 5 named files) against the current codebase and confirmed a 100% green baseline before any change — this is the exact regression surface the phase must keep green after the rename.

**Primary recommendation:** Treat this as a pure move-and-retarget with zero logic changes. Copy files verbatim (do not retype them), then mechanically edit only the literal path strings called out below. Every test file's fix is either a literal-string swap or (in exactly one case — `tenant-whatsapp-surface.test.ts:183`) a target-path swap for an `existsSync` assertion.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Target file layout (move + rename, not rewrite):**
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
    └── whatsapp-templates-panel.tsx ← re-export or move of components/admin/whatsapp-templates-panel.tsx (Claude's discretion: prefer NOT moving it — leave in components/admin/, just import into the new settings page)

app/admin/whatsapp/page.tsx            ← REPLACED with a redirect stub: redirect('/admin/inbox')
app/admin/whatsapp-templates/page.tsx  ← REPLACED with a redirect stub: redirect('/admin/inbox/settings')
```

Keep `admin-whatsapp-accounts.tsx`'s CONTENT (props, component name `AdminWhatsAppAccounts`) unchanged — only its file location moves. Same for `admin-whatsapp-client.tsx` and `admin-whatsapp-filters.tsx` (content unchanged in 154, only relocated + path-literal updates in filters).

**Nav change — `components/admin/admin-nav.tsx`:** Replace lines 25-26 with ONE entry `{ href: '/admin/inbox', label: 'Inbox', Icon: Inbox }`. Import `Inbox` from `lucide-react`; `MessageCircle` may become unused — check and remove if so. No `activeBase` override needed.

**Settings page — `app/admin/inbox/settings/page.tsx`:** `await requireAdmin()` FIRST. Fetch same data as old two routes (`whatsapp_company_configs` + `whatsapp_authorized_senders` for Accounts, `listTemplates()` for Templates) — copy the exact `Promise.all` shape from old `page.tsx` lines 39-66, minus the conversations query. Use real shadcn `Tabs` component, `?tab=accounts|templates` URL param. "← Back to Inbox" link to `/admin/inbox`. Page title "Inbox Settings" (or similar).

**Redirect stubs:** Both old route files become a single `redirect()` call, no `requireAdmin()` in the stub (target page re-checks it).

**Every hardcoded path reference to retarget (treat as authoritative):**
| File (new location) | Old literal | New literal |
|---|---|---|
| `app/admin/inbox/page.tsx` (pageUrl/tabUrl helpers) | `/admin/whatsapp` | `/admin/inbox` |
| `app/admin/inbox/admin-whatsapp-filters.tsx` (4 occurrences) | `/admin/whatsapp` | `/admin/inbox` |
| `components/admin/admin-nav.tsx` (lines 25-26) | `/admin/whatsapp`, `/admin/whatsapp-templates` | collapsed into one `/admin/inbox` entry |
| `lib/actions/admin-whatsapp-accounts.ts` (6 occurrences of `revalidatePath('/admin/whatsapp')`) | `/admin/whatsapp` | `/admin/inbox/settings` |

**What must NOT change:** `lib/queries/admin-whatsapp.ts`, `lib/actions/admin-whatsapp.ts`, `lib/actions/admin-whatsapp-accounts.ts`, `lib/actions/admin-whatsapp-templates.ts` file/function/export names. `whatsapp_conversations`, `whatsapp_company_configs`, `whatsapp_authorized_senders`, `whatsapp_messages` DB table names. `app/admin/integrations/whatsapp` (credentials). `components/whatsapp/message-bubble.tsx`. `app/api/webhooks/whatsapp/route.ts`'s import of `lib/actions/admin-whatsapp-templates`.

**Test files to update:**
- `tests/unit/settings/tenant-whatsapp-surface.test.ts:183` — `existsSync(resolve(ROOT, 'app/admin/whatsapp/page.tsx'))` → `app/admin/inbox/page.tsx`
- `tests/e2e/admin-whatsapp.spec.ts` — navigates to `/admin/whatsapp`; update to `/admin/inbox`. Do NOT touch Sheet selectors (Phase 155's job).
- `tests/unit/admin/whatsapp-filters.test.ts` — check for `/admin/whatsapp` string assertions; retarget to `/admin/inbox`.
- `tests/unit/admin/whatsapp-account-actions.test.ts` — check for `revalidatePath('/admin/whatsapp')` assertions; retarget to `/admin/inbox/settings`.
- `tests/unit/admin/whatsapp-templates.test.ts`, `tests/unit/whatsapp/admin-authority-contract.test.ts` — read first; update any path/existence assertions found.

### Claude's Discretion

- Whether to physically move test files to mirror new source locations, or just update internal path-string assertions in place — prefer updating in place unless a test does literal `readFileSync` against an OLD file path that no longer has the real content.
- Exact wording of the Inbox page header/description copy — update to reference "Inbox" naturally.
- Whether `whatsapp-templates-panel.tsx` moves into `app/admin/inbox/settings/` or stays in `components/admin/` — prefer leaving it in `components/admin/` and just importing it.

### Deferred Ideas (OUT OF SCOPE)

- The master-detail conversation viewer redesign (table + Sheet → two-pane) — Phase 155, explicitly NOT this phase's job.
- Two-way reply/send, multi-channel, realtime — INBOXX-01/02/03 (v2), not in scope.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INBOX-01 | Single Inbox nav item; old routes redirect; every hardcoded path reference retargeted | Verified exact nav file lines (25-26), confirmed no other nav-config file exists, confirmed no `middleware.ts` exists (no route-matcher to update), confirmed all 4 filter-file literals + 6 revalidatePath literals via direct read + grep |
| INBOX-03 | `/admin/inbox/settings` tabbed page (Accounts + Templates), reusing existing components; back affordance; revalidatePath retargeted | Read full `admin-whatsapp-accounts.tsx` (362 lines) and `whatsapp-templates\page.tsx` (33 lines) to confirm exact props/data shape to replicate; confirmed `components/ui/tabs.tsx` is the real shadcn Tabs primitive (radix-ui based); found pre-existing `154-UI-SPEC.md` with an exact JSX skeleton for the new settings page |
| INBOX-04 | Integrations credentials untouched; data layer + `whatsapp_*` tables unchanged; all affected tests updated and green | Verified zero `revalidatePath`/`/admin/whatsapp` references in `lib/queries/admin-whatsapp.ts`, `lib/actions/admin-whatsapp.ts`, `lib/actions/admin-whatsapp-templates.ts` (only `admin-whatsapp-accounts.ts` has the 6 calls); ran the 5 named test files (67 tests) and confirmed 100% green baseline before any change; read every test file in full to determine exact assertions needing updates |

## Architecture Patterns

### Current file inventory (verified via direct Read, not assumed)

`app/admin/whatsapp/` contains exactly 5 files:
```
admin-whatsapp-accounts.tsx   (362 lines) — 'use client', AdminWhatsAppAccounts component
admin-whatsapp-client.tsx     (167 lines) — 'use client', AdminWhatsAppClient + Sheet
admin-whatsapp-filters.tsx    (163 lines) — 'use client', AdminWhatsAppFilters, 4× '/admin/whatsapp' literal
loading.tsx                   (41 lines)  — server skeleton, NO path literals inside, imports AdminShellSkeleton
page.tsx                      (208 lines) — server component, requireAdmin() first line, dynamic='force-dynamic'
```

`app/admin/whatsapp-templates/` contains exactly 1 file:
```
page.tsx (33 lines) — requireAdmin() first, listTemplates(), renders WhatsAppTemplatesPanel, NO path literals
```

**Important nuance for the planner:** `loading.tsx` and `whatsapp-templates/page.tsx` have ZERO path-literal references — they can be moved byte-for-byte with no text edits, only their file location changes (`loading.tsx` folds naturally as `app/admin/inbox/loading.tsx`; there's no separate `loading.tsx` needed for `/admin/inbox/settings` unless the plan wants one — CONTEXT.md's layout diagram doesn't show one for settings/, so this is a reasonable omission at Claude's discretion).

### Exact `page.tsx` split point (verified via full read)

The current `app/admin/whatsapp/page.tsx` (208 lines) has this exact structure that must split cleanly:
- Lines 1-11: imports (includes both `AdminWhatsAppAccounts` and `AdminWhatsAppFilters`/`AdminWhatsAppClient` — these need to split into two import sets across the two new pages)
- Lines 27-66: `requireAdmin()`, `parseAdminWhatsAppFilters`, tab param, `Promise.all` fetching `listAdminWhatsAppConversations` + `whatsapp_company_configs` + `whatsapp_authorized_senders` — **this Promise.all fetches BOTH conversations AND accounts data in a single call regardless of active tab.** The new Inbox page only needs the conversations fetch; the new Settings page only needs the configs/senders fetch (CONTEXT.md already calls this out: "minus the conversations query" for settings, and implicitly minus the accounts query for the Inbox page).
- Lines 74-100: `pageUrl`/`tabUrl` helpers — build `/admin/whatsapp?...` URLs with a `tab` param logic that no longer applies once Accounts moves to a separate route/page. **The new Inbox `pageUrl` helper should drop the `tab === 'accounts'` branch entirely** (dead code once there's only one tab on this page) — its `params.set('tab', 'accounts')` line (line 76/92) becomes meaningless since Inbox's `page.tsx` no longer renders an Accounts tab.
- Lines 105-141: header + hand-rolled `Link`-based tab UI switching between "Conversations" and "Accounts" — **this whole tab-switcher UI must be deleted** from the new Inbox page since there's only one view now (Conversations). The Settings page gets its own (different, shadcn-`Tabs`-based) tab switcher for Accounts/Templates.
- Lines 143-154: `tab === 'accounts'` branch → this entire block moves to the new Settings page's Accounts tab.
- Lines 155-204: `else` (conversations) branch → this becomes the entirety of the new Inbox page's body (filters + count + client table + pagination), with no tab-switch wrapper.

This means `app/admin/inbox/page.tsx` is NOT a byte-verbatim copy of the old `page.tsx` — CONTEXT.md's layout diagram says "same logic, Accounts tab REMOVED," which requires actually deleting the tab-switcher chrome and the accounts branch, not just relocating the file. Only `admin-whatsapp-client.tsx`, `admin-whatsapp-accounts.tsx`, and `loading.tsx` are true byte-verbatim relocations. `admin-whatsapp-filters.tsx` is a relocation + 4 literal-string edits. `page.tsx` (both old files) require real restructuring to assemble the two new pages, even though no new business logic is introduced.

### `admin-nav.tsx` — full current state (verified)

```tsx
const NAV_ITEMS = [
  { href: '/admin',              label: 'Dashboard',    Icon: LayoutDashboard },
  { href: '/admin/seo',          label: 'SEO',          Icon: Globe },
  { href: '/admin/landing',      label: 'Landing Page', Icon: Layout },
  { href: '/admin/blog',         label: 'Blog',         Icon: FileText },
  { href: '/admin/knowledge',    label: 'Knowledge',    Icon: BookOpen },
  { href: '/admin/legal',        label: 'Legal Pages',  Icon: Scale },
  { href: '/admin/branding',     label: 'Branding',     Icon: Palette },
  {
    href: '/admin/integrations/ai',
    activeBase: '/admin/integrations',
    label: 'Integrations',
    Icon: Settings2,
  },
  { href: '/admin/billing',      label: 'Billing',      Icon: CreditCard },
  { href: '/admin/companies',    label: 'Companies',    Icon: Building2 },
  { href: '/admin/whatsapp',     label: 'WhatsApp',     Icon: MessageCircle },        // line 25
  { href: '/admin/whatsapp-templates', label: 'WA Templates', Icon: MessageCircle },   // line 26
  { href: '/admin/admins',       label: 'Admins',       Icon: Users },
  { href: '/admin/events',       label: 'Event Log',    Icon: ScrollText },
] as const
```
`MessageCircle` is used ONLY by these two entries (verified: it appears at line 6 import and lines 25/26 only) — after collapsing to one `Inbox`-icon entry, `MessageCircle` becomes fully unused and must be removed from the lucide-react import on line 6, or the lint/build will flag an unused import.

The `isActive` logic (lines 52-57) already handles sub-route highlighting generically: `activeBase` defaults to `href` when the field is absent, and `pathname === activeBase || pathname.startsWith(activeBase + '/')`. So `/admin/inbox/settings` will highlight the single `Inbox` nav entry automatically — no `activeBase` field needs to be added for the new entry.

### Settings page composition (from pre-existing `154-UI-SPEC.md`)

A `154-UI-SPEC.md` already exists in the phase directory (generated by a prior UI-research pass, status "pending" approval) and specifies an exact JSX skeleton for `/admin/inbox/settings/page.tsx`:

```tsx
<div className="space-y-8">
  <Link href="/admin/inbox" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
    <ChevronLeft size={16} /> <T>Back to Inbox</T>
  </Link>

  <div className="space-y-2">
    <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
      <T>Inbox Settings</T>
    </h1>
    <p className="text-muted-foreground">
      <T>Manage WhatsApp account provisioning and message templates.</T>
    </p>
  </div>

  <Tabs defaultValue={initialTab} className="w-full gap-5">
    <div className="border-b border-border">
      <TabsList variant="line" className="w-auto h-auto bg-transparent p-0 gap-0 rounded-none justify-start">
        <TabsTrigger value="accounts"><T>Accounts</T></TabsTrigger>
        <TabsTrigger value="templates"><T>Templates</T></TabsTrigger>
      </TabsList>
    </div>
    <TabsContent value="accounts" className="mt-0">
      <AdminWhatsAppAccounts configs={configResult} senders={senderResult} companyId={filters.companyId} />
    </TabsContent>
    <TabsContent value="templates" className="mt-0">
      <WhatsAppTemplatesPanel templates={templates} />
    </TabsContent>
  </Tabs>
</div>
```

Copy contract from the same UI-SPEC (treat as authoritative over CONTEXT.md's looser "Claude's discretion" suggestions, since UI-SPEC is the more specific, later-generated artifact for the same phase):
- Inbox page `<h1>`: **"Inbox"**
- Inbox page description: **"Platform-managed conversations across every connected channel. Read-only conversation inspection."**
- Settings page `<h1>`: **"Inbox Settings"**
- Settings page description: **"Manage WhatsApp account provisioning and message templates."**
- Back affordance: **"Back to Inbox"** with `ChevronLeft` (16px) icon, muted text-link style (mirrors `app/admin/companies/[id]/page.tsx`'s existing back-link pattern)
- Settings tabs: **"Accounts"** and **"Templates"**
- Nav item label: **"Inbox"**, icon `Inbox` from lucide-react
- Empty state ("No WhatsApp conversations yet.") stays unchanged — Phase 155's job to redesign

`components/ui/tabs.tsx` (verified via read) is a standard shadcn/radix wrapper (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) already used elsewhere (e.g. `app/admin/legal/page.tsx`, per UI-SPEC) with a `variant="line"` style on `TabsList` — no new shadcn install needed, this component already exists in the repo.

**Radix `Tabs` is uncontrolled-by-default (`defaultValue`) and purely client-side** — for the tab selection to be shareable via URL (`?tab=accounts|templates`) and SSR-readable on load (mirroring the old page's `?tab=accounts|conversations` pattern), the planner needs either (a) a thin client wrapper component that reads/writes the `tab` search param via `useRouter().replace` on `onValueChange`, seeded with `defaultValue={initialTab}` computed server-side from `searchParams`, or (b) reuse of the old page's simpler `Link`-based tab-switcher pattern instead of Radix `Tabs` for this specific need. UI-SPEC explicitly leaves this implementation detail to the planner/executor, only fixing the contract: tab state must be shareable via URL on load.

### Redirect stub pattern (Next.js, verified against training knowledge — LOW risk, standard API)

```tsx
import { redirect } from 'next/navigation'

export default function Page() {
  redirect('/admin/inbox')
}
```

This is a Server Component using Next's `redirect()` from `next/navigation`, which throws a special `NEXT_REDIRECT` error internally caught by the framework — this is standard, stable Next.js App Router behavior (no version-specific behavior change needed to verify; this API has been stable since Next 13). No `requireAdmin()` gate needed in the stub itself since the redirect target re-checks it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL-syncable tabs | A custom tab-state manager from scratch | Either the old page's proven `Link`-based `tabUrl()` pattern, or a thin client component wrapping `components/ui/tabs.tsx`'s Radix primitive with `useRouter().replace` | The old page already solved this exact problem (URL-backed tab param with SSR default) — reuse the pattern rather than inventing a new state-sync mechanism |
| Path redirects | Custom middleware-based redirect logic | Next.js `redirect()` from `next/navigation` in a simple page stub | No `middleware.ts` exists in this repo (confirmed) — introducing one just for two redirects would be a bigger footprint than two one-line page stubs |
| Data fetching for the settings page | New queries/actions | Copy the EXACT `Promise.all` shape (minus conversations) already in the old `page.tsx` lines 39-66 | The query shape, types, and error handling are already correct and tested |

**Key insight:** Every piece of business logic this phase needs already exists and is already tested. The only genuinely new code is: (1) the settings page shell/composition, (2) two redirect stubs, (3) the nav array edit, (4) path-literal find/replace in the filters file and the accounts-actions file.

## Common Pitfalls

### Pitfall 1: Copying `page.tsx` verbatim instead of splitting it
**What goes wrong:** If the executor just copies the old 208-line `page.tsx` to the new location and does a path find/replace, the new Inbox page will still have the Accounts tab, the two-tab switcher UI, and will fetch `whatsapp_company_configs`/`whatsapp_authorized_senders` data it no longer uses.
**Why it happens:** CONTEXT.md's file-layout diagram says "same logic" for `page.tsx`, which could be misread as byte-verbatim. It also explicitly says "Accounts tab REMOVED" — the two statements together mean "same conversations-fetching/rendering logic, minus the accounts branch and tab-switcher chrome."
**How to avoid:** Explicitly delete the tab-switcher `<div className="flex gap-1 border-b">...</div>` block, the `tab === 'accounts'` conditional branch, and the accounts-related Promise.all query when assembling the new Inbox `page.tsx`. Verify `pageUrl`/`tabUrl` helpers no longer reference `tab === 'accounts'`.
**Warning signs:** New Inbox page bundle size unexpectedly includes `AdminWhatsAppAccounts` import; new page still renders two tabs.

### Pitfall 2: Forgetting `admin-authority-contract.test.ts` re-scans directories at test-run time
**What goes wrong:** Assuming this test needs a path-literal update because it references `app/admin/whatsapp` conceptually.
**Why it happens:** The test's name and JSDoc mention "admin-only WhatsApp authority model," which sounds route-related.
**How to avoid:** This test (verified via full read) does NOT contain any `/admin/whatsapp` or `/admin/whatsapp-templates` string literal — it dynamically walks `app/`, `components/`, `lib/` directories at test-run time via `collectTsFiles`/`collectTestFiles` and greps for patterns like `.from("company_whatsapp")`, `syncOwnerPhone`, raw-phone logging. It will automatically pick up files at their NEW location with no changes needed. Confirm this by re-running the test after the move — it should still pass with zero edits to the test file itself.
**Warning signs:** None expected — this is a "no action needed" item, but worth explicitly verifying post-move since it's an authority/security contract test.

### Pitfall 3: `whatsapp-templates.test.ts` and most of `admin-authority-contract.test.ts` don't need path edits — but assume they do
**What goes wrong:** Spending effort searching these two files for path literals to edit.
**Why it happens:** They're named similarly to files that DO need edits.
**How to avoid:** Verified via full read: `tests/unit/admin/whatsapp-templates.test.ts` (137 lines) tests only `lib/actions/admin-whatsapp-templates` module functions (`createTemplate`, `listTemplates`, `applyTemplateStatusUpdate`, `submitTemplateToMeta`) — zero route-path references, zero changes needed. `admin-authority-contract.test.ts` has one relevant assertion at line 183 (`existsSync(resolve(ROOT, 'app/admin/whatsapp/page.tsx'))).toBe(true)`) inside a test titled "admin conversation components still compile" — wait, this is actually in `tenant-whatsapp-surface.test.ts`, not `admin-authority-contract.test.ts` (see next pitfall for the correction).
**Warning signs:** N/A — this is a scoping clarification.

### Pitfall 4: There are TWO different `existsSync('app/admin/whatsapp/page.tsx')` assertions in TWO different test files — CONTEXT.md only names one
**What goes wrong:** Fixing only `tests/unit/settings/tenant-whatsapp-surface.test.ts:183` (the one CONTEXT.md explicitly calls out) and missing that this exact assertion appears TWICE — once in that file, and the CONTEXT.md description is accurate for that one. However, on closer inspection: `tenant-whatsapp-surface.test.ts` line 183 IS the one described. There is no second occurrence in `admin-authority-contract.test.ts` — that file has no `app/admin/whatsapp` reference at all (verified: only `lib/actions/admin-whatsapp.ts`, `components/whatsapp/message-bubble.tsx`, and `app/(app)/projects/[id]/page.tsx` existence checks). This note exists to confirm: **CONTEXT.md's test list is accurate and complete for path-literal assertions** — no additional occurrences were found in the grep audit beyond what's listed.
**How to avoid:** Trust the CONTEXT.md test list; it was cross-checked against a full-repo grep of `/admin/whatsapp` and `admin/whatsapp-templates` (35 + 14 files respectively) and no additional test file beyond the 6 named ones (`tenant-whatsapp-surface.test.ts`, `admin-whatsapp.spec.ts`, `whatsapp-filters.test.ts`, `whatsapp-account-actions.test.ts`, `whatsapp-templates.test.ts`, `admin-authority-contract.test.ts`) contains a relevant route-path assertion. One unrelated false-positive grep hit: `tests/unit/notifications/category-migration.test.ts:40` contains the literal substring `admin/whatsapp` but only as part of an unrelated key-list string (`'drops payment/trial/quota/admin/whatsapp/ai_job keys'`) — this is NOT a route reference and needs NO change.
**Warning signs:** None — flagged here purely so the planner doesn't waste a task investigating that file.

### Pitfall 5: `admin-whatsapp.spec.ts` (e2e) has 18 occurrences of `/admin/whatsapp`-family paths across two describe blocks — one requires live admin creds, one doesn't
**What goes wrong:** Updating only the "static contract (source-level)" describe block (which does `readFileSync` against `app/admin/whatsapp/*.tsx` paths — 8 occurrences) and missing the first describe block ("Admin WhatsApp page (WAADM-02)") which does live `page.goto('/admin/whatsapp...')` navigation (5 occurrences across 4 tests) — both blocks are in the same file and both need path updates, even though the first block is skipped by default (`test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, ...)`) since CI/local runs without seeded admin creds.
**Why it happens:** The first block being conditionally skipped might make it seem lower priority, but CONTEXT.md's instruction is unconditional: "navigates to `/admin/whatsapp`; update to `/admin/inbox`."
**How to avoid:** Update ALL 18 occurrences in this single file: the 5 `page.goto`/`h1` assertions in the first describe block, AND the 8 `readFileSync(resolve(process.cwd(), 'app/admin/whatsapp/...'))` calls in the second (source-level) describe block — pointing each at its new file location (`app/admin/inbox/page.tsx`, `app/admin/inbox/admin-whatsapp-filters.tsx`, `app/admin/inbox/admin-whatsapp-client.tsx`, `app/admin/inbox/settings/admin-whatsapp-accounts.tsx`). Do NOT touch Sheet-related assertions (none of the current assertions reference `Sheet`, so this constraint is naturally satisfied).
**Warning signs:** `test.skip` on the live-nav block might make CI green even if those 5 assertions are stale (since skipped tests don't fail) — meaning a broken `/admin/whatsapp` reference could silently persist through CI unnoticed. Explicitly verify all 18 occurrences are fixed, not just the 8 that would fail immediately in a normal test run.

## Code Examples

### Verified current `admin-whatsapp-filters.tsx` occurrences requiring edit (4 total, confirmed via full read)
```typescript
// Line 48 — inside pushParam()
router.replace(`/admin/whatsapp?${params.toString()}`)

// Line 117 — inside dateFrom onChange handler
router.replace(`/admin/whatsapp?${params.toString()}`)

// Line 134 — inside dateTo onChange handler
router.replace(`/admin/whatsapp?${params.toString()}`)

// Line 144 — "Clear filters" button onClick
onClick={() => router.replace('/admin/whatsapp')}
```
All 4 become `/admin/inbox`.

### Verified `page.tsx` pageUrl/tabUrl literal occurrences (2 total)
```typescript
// Line 85 — pageUrl()
return `/admin/whatsapp?${params.toString()}`

// Line 99 — tabUrl()
return `/admin/whatsapp?${params.toString()}`
```
Both become `/admin/inbox` in the new Inbox page's simplified `pageUrl` helper (the `tabUrl` helper itself becomes unnecessary once there's only one tab on this page, per the "Accounts tab REMOVED" decision — but if the planner keeps some minimal tab affordance, retarget accordingly).

### `revalidatePath` occurrences (6 total, all in `lib/actions/admin-whatsapp-accounts.ts`)
```typescript
// Line 157 — saveWhatsAppAccount, create-new-config branch
revalidatePath('/admin/whatsapp')

// Line 211 — saveWhatsAppAccount, update branch
revalidatePath('/admin/whatsapp')

// Line 329 — saveWhatsAppSender, update-existing branch
revalidatePath('/admin/whatsapp')

// Line 365 — saveWhatsAppSender, create-new branch
revalidatePath('/admin/whatsapp')

// Line 447 — setWhatsAppSenderStatus
revalidatePath('/admin/whatsapp')

// Line 513 — removeWhatsAppSender
revalidatePath('/admin/whatsapp')
```
All 6 become `revalidatePath('/admin/inbox/settings')` since Accounts now lives there.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Two separate nav items ("WhatsApp", "WA Templates") pointing at `/admin/whatsapp` and `/admin/whatsapp-templates` | Single "Inbox" nav item at `/admin/inbox`, with Accounts+Templates folded into `/admin/inbox/settings` | This phase (154) | Nav surface area shrinks by one item; old bookmarks/links still work via redirect stubs |
| Hand-rolled `Link`-based tabs (`tabUrl()` helper + manual active-state className logic) for Conversations/Accounts | Real shadcn `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (Radix-based) for Accounts/Templates on the new settings page | This phase (154) | The Inbox page itself no longer needs ANY tab switcher (single view); only the new Settings page gets a (nicer) tab UI |

**Deprecated/outdated:** N/A — no library or framework deprecations are involved in this phase; this is purely an internal route reorganization.

## Open Questions

1. **Should the Inbox page's `pageUrl` helper keep a vestigial `tab` param at all?**
   - What we know: The old page's `pageUrl`/`tabUrl` helpers both accept/set a `tab` query param that distinguished Conversations vs. Accounts views on the SAME route.
   - What's unclear: Once Accounts moves to `/admin/inbox/settings`, the Inbox page has only one view — CONTEXT.md doesn't explicitly say to strip the `tab` param handling, only that the Accounts tab/branch is removed.
   - Recommendation: Strip the `tab` param entirely from the Inbox page's `pageUrl` (dead parameter otherwise) — pagination/filter URLs become simpler `/admin/inbox?companyId=...&page=2` with no `tab=` noise. This is a natural simplification consistent with "Accounts tab REMOVED," not a scope expansion.

2. **Does the new Settings page need its own `loading.tsx`?**
   - What we know: CONTEXT.md's layout diagram lists a `loading.tsx` only under `app/admin/inbox/`, not under `settings/`.
   - What's unclear: Whether omitting one for `/admin/inbox/settings` is intentional or an oversight.
   - Recommendation: Omit it — Next.js loading.tsx is optional per-segment, and the old `whatsapp-templates/page.tsx` had none either (verified: no `loading.tsx` exists in `app/admin/whatsapp-templates/`). Consistent with prior art; not adding new scope.

## Environment Availability

No external service/tool dependencies — this phase is Next.js App Router file moves + React component composition + test updates, all within the existing repo toolchain (Node/npm, Vitest, Playwright — all already configured and verified working via a live test run below).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (unit) + Playwright (e2e, `test:e2e` script) |
| Config file | `vitest.config.ts` (unit), `playwright.config.ts` (e2e) |
| Quick run command | `npx vitest run tests/unit/admin/whatsapp-filters.test.ts tests/unit/admin/whatsapp-account-actions.test.ts tests/unit/admin/whatsapp-templates.test.ts tests/unit/whatsapp/admin-authority-contract.test.ts tests/unit/settings/tenant-whatsapp-surface.test.ts` |
| Full suite command | `npm test` (vitest run, full unit suite) |

**Confirmed baseline (ran live during research):** all 5 named unit-test files, 67 tests total, 100% passing before any change. This is the exact regression gate for INBOX-04.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INBOX-01 | Nav collapses to one Inbox item; old routes redirect; path literals retargeted | unit (source-contract) | `npx vitest run tests/unit/admin/whatsapp-filters.test.ts` | ✅ (needs literal-string updates for `/admin/whatsapp` → `/admin/inbox`) |
| INBOX-01 | Redirect stubs work at old URLs | e2e | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` | ✅ (needs path updates; requires `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` for the live-nav describe block, source-contract block runs unconditionally) |
| INBOX-03 | Settings page renders Accounts + Templates tabs, reuses existing components | unit (source-contract) | `npx vitest run tests/unit/admin/whatsapp-account-actions.test.ts` | ✅ (needs `revalidatePath` target updated to `/admin/inbox/settings`) |
| INBOX-04 | Data layer / DB table names unchanged; test files updated and green | unit | `npx vitest run tests/unit/settings/tenant-whatsapp-surface.test.ts tests/unit/whatsapp/admin-authority-contract.test.ts tests/unit/admin/whatsapp-templates.test.ts` | ✅ (only `tenant-whatsapp-surface.test.ts:183` needs a path-target edit; the other two need NO changes per full-file review) |

### Sampling Rate
- **Per task commit:** `npx vitest run` scoped to the 5 named unit-test files (fast, ~3s per the confirmed baseline run)
- **Per wave merge:** `npm test` (full unit suite) + `npx playwright test tests/e2e/admin-whatsapp.spec.ts`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. All 6 test files already exist, already exercise the exact code paths this phase touches, and a live baseline run confirms 100% green before the change. No new test framework setup, no new fixtures needed.

## Sources

### Primary (HIGH confidence — direct repository reads, this session)
- `app/admin/whatsapp/page.tsx` (208 lines, full read)
- `app/admin/whatsapp/admin-whatsapp-filters.tsx` (163 lines, full read)
- `app/admin/whatsapp/admin-whatsapp-client.tsx` (167 lines, full read)
- `app/admin/whatsapp/admin-whatsapp-accounts.tsx` (362 lines, full read)
- `app/admin/whatsapp/loading.tsx` (41 lines, full read)
- `app/admin/whatsapp-templates/page.tsx` (33 lines, full read)
- `components/admin/admin-nav.tsx` (79 lines, full read)
- `lib/actions/admin-whatsapp-accounts.ts` (529 lines, full read)
- `components/ui/tabs.tsx` (92 lines, full read)
- `tests/e2e/admin-whatsapp.spec.ts` (337 lines, full read)
- `tests/unit/admin/whatsapp-filters.test.ts` (364 lines, full read)
- `tests/unit/admin/whatsapp-account-actions.test.ts` (420 lines, full read)
- `tests/unit/admin/whatsapp-templates.test.ts` (138 lines, full read)
- `tests/unit/whatsapp/admin-authority-contract.test.ts` (175 lines, full read)
- `tests/unit/settings/tenant-whatsapp-surface.test.ts` (186 lines, full read)
- `.planning/phases/154-inbox-route-consolidation-settings/154-CONTEXT.md` (full read)
- `.planning/phases/154-inbox-route-consolidation-settings/154-UI-SPEC.md` (full read — pre-existing artifact not mentioned in task prompt, discovered during grep audit)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` (relevant sections read)
- Live grep audit: `/admin/whatsapp` (35 files), `admin/whatsapp-templates` (14 files) across entire repo
- Live test run: `npx vitest run` on all 5 named unit-test files — 67/67 passing baseline confirmed
- Confirmed absence of `middleware.ts` in repo root (no route-matcher config to update)
- Confirmed `lib/queries/admin-whatsapp.ts`, `lib/actions/admin-whatsapp.ts`, `lib/actions/admin-whatsapp-templates.ts` contain zero `revalidatePath`/`/admin/whatsapp` references (grep, zero matches)
- Confirmed `app/api/webhooks/whatsapp/route.ts:127` imports `@/lib/actions/admin-whatsapp-templates` (module-path import, unaffected by page move)
- Confirmed `components/admin/whatsapp-templates-panel.tsx` is imported only by `app/admin/whatsapp-templates/page.tsx` currently (single import site, safe to leave in place and add a second import site at the new settings page)

### Secondary (MEDIUM confidence)
- Next.js `redirect()` from `next/navigation` behavior in Server Components — standard, stable App Router API since Next 13; not independently re-verified against current Next.js docs this session (training-data knowledge), but this is well-established, low-risk, unlikely-to-have-changed API surface.

### Tertiary (LOW confidence)
None — every claim in this document is grounded in a direct repository read or a live command run during this research session.

## Metadata

**Confidence breakdown:**
- Standard stack: N/A (no new libraries/dependencies introduced)
- Architecture: HIGH — every file involved was read in full, not sampled or grepped-only
- Pitfalls: HIGH — derived directly from cross-referencing CONTEXT.md's claims against actual file contents and a live test run, not speculative

**Research date:** 2026-07-05
**Valid until:** 14 days (this is an internal-repo research artifact tied to the exact current state of these files; if other phases touch these same files before 154 executes, re-verify line numbers before planning)
