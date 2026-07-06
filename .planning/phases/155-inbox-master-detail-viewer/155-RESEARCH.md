# Phase 155: Inbox Master-Detail Viewer - Research

**Researched:** 2026-07-05
**Domain:** Next.js App Router client-state refactor (table+Sheet → two-pane master-detail), URL-driven selection, no data-layer change
**Confidence:** HIGH

## Summary

This phase replaces `AdminWhatsAppClient`'s current table + right-side `Sheet` overlay with a persistent two-pane layout (conversation list left, thread right) on the same page. I read every file this phase touches end-to-end: the current `admin-whatsapp-client.tsx` (167 lines, table + `Sheet` + `openThread` local-state pattern), `admin-whatsapp-filters.tsx` (163 lines, the exact `useSearchParams`/`router.replace` shallow-update pattern to mirror for the new `conversation` param), `page.tsx` (208 lines, confirms the `Row` type and `AdminWhatsAppClient` invocation site), `message-bubble.tsx` (149 lines, `MessageBubble`/`AudioMessage`, unchanged), `lib/actions/admin-whatsapp.ts` (`loadAdminConversationThread`, 77 lines, unchanged read-only server action), `lib/whatsapp/inbox-types.ts` (`ConversationThread` type), `components/dashboard/empty-state.tsx` (58 lines, the `EmptyState` component the UI-SPEC mandates reusing for "no conversation selected"), `app/admin/layout.tsx` (confirms `<main>` is `flex-1 overflow-y-auto px-8 py-8` — the scroll container this phase's page content must opt out of), and `tests/e2e/admin-whatsapp.spec.ts` (337 lines — confirmed **zero** `Sheet`/`SheetTitle`/`SheetContent` selector references exist today; the e2e spec asserts on `h1` text, URL params, and `readFileSync` source-contract checks only).

Since Phase 154 has NOT executed yet, I researched against the file's current pre-154 location (`app/admin/whatsapp/`) per the task's explicit instruction — content is confirmed byte-identical to what will exist post-154 at `app/admin/inbox/`, per Phase 154's own research which states `admin-whatsapp-client.tsx` and `admin-whatsapp-filters.tsx` (with only 4 path-literal edits) move verbatim.

I also independently verified the Xphere reference (`C:\Users\Vanildo\Dev\xphere\src\components\chat\chat-layout.tsx` and `conversation-list.tsx`) is directly readable from this session and confirmed the structural patterns CONTEXT.md/UI-SPEC.md already extracted from it: the `hidden md:flex` / `md:hidden flex` dual-render pattern for desktop-vs-mobile (not CSS-only hide, but two separate render trees, each mounting only its own children), the `role="button"` + `tabIndex={0}` conversation card pattern, and the `mobileView: 'list' | 'chat'` state-driven single-column toggle. Xphere's version is far more complex (client-side polling/pagination hook, realtime subscriptions, resizable pane, third contact-info panel) — none of that applies here; Xtimator's version is fully SSR-driven (server-fetched rows + filters), read-only, and needs only 2 panes, confirming CONTEXT.md's scope-reduction decisions are sound and sufficient.

I ran the existing unit-test baseline (`whatsapp-filters.test.ts` + `admin-authority-contract.test.ts`, 33 tests) live and confirmed 100% green before any change.

**Primary recommendation:** Convert `AdminWhatsAppClient` from local `useState<Row|null>` selection to `useSearchParams`-driven `conversation` param (mirroring `AdminWhatsAppFilters`' own `pushParam`/`router.replace` pattern exactly), replace the `<table>` + `<Sheet>` JSX with a `flex` two-pane container per the UI-SPEC's exact class contract, and thread selection through `page.tsx` (Server Component) so a direct link / refresh can pass the initial `conversation` id as a prop instead of requiring a client-side round trip before the first paint.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Layout shape** (reference: Xphere's `chat-layout.tsx`/`conversation-list.tsx`/`chat-area.tsx`) — two panes, not three (no contact-info panel):
```
┌─────────────────────────┬───────────────────────────────────────┐
│ Conversation List (left)│  Thread (right)                       │
│ - search/filters header │  - header: contact name/phone/company │
│ - scrollable rows       │  - scrollable message list             │
│ - pagination footer     │  - "Read-only, last 30 days" footer   │
└─────────────────────────┴───────────────────────────────────────┘
```
- Left pane: fixed width acceptable (`w-[320px]` or `w-[360px]`) — resizing is Claude's discretion to skip.
- Right pane: `flex-1`, fills remaining width.
- Container: `flex` row, height locked to the available admin content area, `min-h-0` on both panes so each scrolls independently (list scrolls, thread scrolls, page itself doesn't scroll as a whole).

**Conversation list (left pane)** — Xphere-style row styling, using Xtimator's OWN tokens (not Xphere's CSS variables):
- Row: `flex items-center gap-3 px-3 py-2.5 rounded-md`-ish, hover `hover:bg-muted/20` (matches existing table-row hover), selected `bg-muted/60` + left accent border `border-l-2 border-[hsl(var(--primary))]`.
- Content: contact name (`text-sm font-medium`, fallback "(unknown)" — reuse exact fallback copy), last-message preview (`text-xs text-muted-foreground truncate`), company as secondary muted label (reuse `(unknown company)` fallback), timestamp (`text-xs text-muted-foreground whitespace-nowrap`, reuse `toLocaleString()`), unread indicator (reuse `<Badge variant="outline">{row.unread_count}</Badge>` — Claude's discretion vs. a dot, must stay visually distinguishable).
- Keep EXISTING keyboard accessibility pattern (`role="button"`, `tabIndex={0}`, Enter/Space) — apply to the new row component instead of `<tr>`.
- Header of this pane: reuse `AdminWhatsAppFilters` unchanged logic, placed at top of list pane.
- Footer of this pane: reuse existing pagination Prev/Next + "Page X of Y", unchanged logic.

**Thread (right pane)** — reuse existing thread-loading logic verbatim:
- Data: SAME `loadAdminConversationThread(conversationId, companyId)` server action, no new query. Reuse `MessageBubble` unchanged.
- Selection state: replace `useState<Row|null>` "openRow" with `?conversation=<id>` URL state (via `useSearchParams` + `router.replace` shallow update — mirror `InboxFilters`/`AdminWhatsAppFilters`'s own pattern so filter changes and conversation selection compose in the same query string).
- **Deep-linking**: `page.tsx` (Server Component) reads `searchParams.conversation` and can pre-resolve/pass the initially-selected id so a direct link/refresh shows the right thread without a client-side flash (Claude's discretion on exact SSR-vs-client-fetch split; simplest correct approach: pass raw `conversation` id as a prop, client component calls `loadAdminConversationThread` on mount/id-change, same as today's `openThread`, just triggered by prop/URL change instead of click).
- **Empty state**: no `?conversation=` set → right pane shows centered placeholder ("Select a conversation to view its messages" or similar) instead of blank.
- Footer note ("Read-only. Shows up to the last 30 days of messages.") unchanged copy.
- Header of this pane: contact name/phone + company (same fields `SheetHeader` shows today), rendered as normal pane header instead of `SheetHeader`.

**Mobile behavior** — below `md`/`lg` breakpoint (confirmed: `md:` is the existing convention), collapse to a SINGLE column:
- No conversation selected → show list (full width).
- Conversation selected → show thread (full width) with visible "← Back" affordance clearing `?conversation=` and returning to list.
- Mirrors Xphere's `mobileView: 'list' | 'chat'` toggle conceptually; implement via CSS or conditional rendering, whichever is simpler given existing responsive patterns.

**What must NOT change in this phase:**
- `components/ui/sheet.tsx` itself is not modified — just no longer used by this feature.
- `lib/queries/admin-whatsapp.ts`, `lib/actions/admin-whatsapp.ts` — unchanged (same functions, same signatures).
- The Settings page (Phase 154's `/admin/inbox/settings`) — untouched.
- No reply/send UI added anywhere (locked read-only decision).

### Claude's Discretion

- Resizable left pane — optional, skip if it adds meaningful complexity; fixed-width satisfies the locked requirement.
- Numeric badge vs. plain dot for unread indicator — either acceptable, must remain visually clear.
- Exact empty-state copy/icon for "no conversation selected."

### Deferred Ideas (OUT OF SCOPE)

- Contact-info third panel, realtime subscriptions, multi-channel — INBOXX-01/02/03 (v2).
- Resizable list pane — optional/discretionary this phase, not required.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INBOX-02 | Two-pane master-detail conversation viewer at `/admin/inbox`: Xphere-style list left (search/filters + pagination) + thread right (read-only, `MessageBubble`, 30-day note); `?conversation=<id>` shallow selection, no modal; direct link/refresh SSR-selects thread; empty-state prompts a pick; mobile collapses to single column with back affordance | Read full current `admin-whatsapp-client.tsx` (table+Sheet, `openThread`, `Row` type), `admin-whatsapp-filters.tsx` (the exact `pushParam`/`router.replace` pattern to mirror for `conversation` param), `page.tsx` (confirms `Row` shape + prop wiring site + where SSR-selected id must be threaded from `searchParams`), `lib/actions/admin-whatsapp.ts` (`loadAdminConversationThread` signature unchanged), `components/dashboard/empty-state.tsx` (exact props for the mandated empty state), `app/admin/layout.tsx` (`<main>` scroll-container behavior the two-pane container must work within), `tests/e2e/admin-whatsapp.spec.ts` (confirmed zero existing Sheet-selector assertions — nothing to break, but the `admin-whatsapp-client.tsx` readFileSync contract test `loadAdminConversationThread(row.id, row.company_id)` at line ~181 must still match verbatim in the refactored source), Xphere's `chat-layout.tsx`/`conversation-list.tsx` (verified structural patterns: dual-render mobile/desktop trees, row anatomy, keyboard-accessible card pattern) |

## Architecture Patterns

### Current implementation — exact mechanics to replace (verified via full read)

`app/admin/whatsapp/admin-whatsapp-client.tsx` (167 lines) today:
```typescript
export function AdminWhatsAppClient({ conversations }: { conversations: Row[] }) {
  const [openRow, setOpenRow] = useState<Row | null>(null)
  const [thread, setThread] = useState<ConversationThread | null>(null)
  const [loading, setLoading] = useState(false)

  async function openThread(row: Row) {
    setOpenRow(row)
    setThread(null)
    setLoading(true)
    const res = await loadAdminConversationThread(row.id, row.company_id)
    if (res.ok) {
      setThread(res.thread)
    } else {
      toast.error(res.error)
      setOpenRow(null)
    }
    setLoading(false)
  }
  // ...renders <table> with onClick={() => openThread(row)} rows,
  // then a <Sheet open={openRow !== null} ...> containing SheetHeader + MessageBubble list + footer
}
```
This entire component body must be restructured: the `<table>` becomes the list-pane's row-rendering, and the `<Sheet>` becomes the thread-pane's always-mounted (not overlay) content. The `openThread` async-fetch logic is preserved almost verbatim — only the trigger changes from a click handler that sets local state, to an effect that reacts to the `conversation` URL param (which itself changes via a click handler that calls `router.replace`).

### Recommended state-management shape for the two-pane client component

Keep this component as a **single 'use client' component** (`AdminWhatsAppClient` or renamed) receiving `conversations: Row[]` (from the server-fetched list, unchanged) **plus** a new prop, e.g. `initialConversationId: string | null` (server-resolved from `searchParams.conversation`), so first paint doesn't have to wait on a client-side `useSearchParams()` read before firing the thread fetch. This mirrors Phase 154 research's finding that `AdminWhatsAppFilters` already receives all its filter values as props from the server component rather than reading `searchParams` itself for anything except writing shallow updates — the new component should follow the same shape:

```typescript
'use client'
import { useRouter, useSearchParams } from 'next/navigation'

export function AdminWhatsAppClient({
  conversations,
  initialConversationId,
}: {
  conversations: Row[]
  initialConversationId: string | null
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const selectedId = sp.get('conversation') ?? initialConversationId
  // derive `selectedRow` from `conversations.find(r => r.id === selectedId)` when present in the
  // current page's rows; if not present (selected via direct link to a row on a different filter/page),
  // the thread fetch still succeeds because loadAdminConversationThread takes a raw id + companyId is
  // optional-with-verification — but company_id enrichment for the header (contact name/phone) needs
  // a fallback: use `thread.conversation` fields (already returned by loadAdminConversationThread) as the
  // source of truth for the header, NOT `selectedRow`, since selectedRow may be undefined off-page.

  const [thread, setThread] = useState<ConversationThread | null>(null)
  const [loading, setLoading] = useState(false)

  function selectConversation(row: Row) {
    const params = new URLSearchParams(sp.toString())
    params.set('conversation', row.id)
    router.replace(`/admin/inbox?${params.toString()}`, { scroll: false })
  }

  function clearSelection() {
    const params = new URLSearchParams(sp.toString())
    params.delete('conversation')
    router.replace(`/admin/inbox?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    if (!selectedId) { setThread(null); return }
    let cancelled = false
    setThread(null)
    setLoading(true)
    // company_id: prefer the row's company_id if visible on this page (tightens the
    // ownership check), else omit — loadAdminConversationThread treats expectedCompanyId
    // as optional and simply skips the cross-check when absent.
    const row = conversations.find((r) => r.id === selectedId)
    loadAdminConversationThread(selectedId, row?.company_id).then((res) => {
      if (cancelled) return
      if (res.ok) setThread(res.thread)
      else { toast.error(res.error); clearSelection() }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [selectedId])

  // ...render two-pane JSX (see Layout Contract in UI-SPEC)
}
```

**Important nuance:** `loadAdminConversationThread`'s `expectedCompanyId` parameter is **optional** (verified via read of `lib/actions/admin-whatsapp.ts` — `expectedCompanyId?: string`). The current Sheet-based code always has `row` in scope (it's set via `openThread(row)` at click time) so it always passes both args. In the new URL-driven model, if the selected id arrives via direct link/refresh and isn't present in the currently-loaded/filtered page of `conversations`, there is no `row` to read `company_id` from — the planner must decide: (a) omit `expectedCompanyId` in that case (safe — the function's ownership check simply doesn't run, which is fine since `requireAdmin()` alone already gates the whole action per its own doc comment: "Authorization is the admin gate ALONE... admin views are intentionally cross-tenant"), or (b) have `page.tsx` resolve the row's `company_id` server-side before passing `initialConversationId` down (more precise, marginally more code). Given CONTEXT.md's explicit statement that `requireAdmin()`-only gating is intentional and cross-tenant-by-design, **option (a) — omit `expectedCompanyId` when the row isn't in the current page — is the simpler, still-correct choice**; the security check being optional-when-unavailable is already the function's own designed behavior, not a gap this phase introduces.

**Existing e2e/unit test contract to preserve exactly:** `tests/e2e/admin-whatsapp.spec.ts` line ~181 asserts the source contains the literal substring `loadAdminConversationThread(row.id, row.company_id)`. If the refactored code calls it any other way (e.g. `loadAdminConversationThread(selectedId, row?.company_id)`), this specific string-match assertion will need updating too — **flag this to the planner as a required test-file edit even though CONTEXT.md/Phase 154's research didn't explicitly call it out**, since Phase 154's research scope only covered path-literal renames, not this call-signature's literal-string shape which Phase 155 changes structurally. See Pitfall 1 below.

### Server Component wiring (`page.tsx`, post-154 shape)

Per Phase 154's research, the post-154 `app/admin/inbox/page.tsx` fetches `convResult` via `listAdminWhatsAppConversations(filters)` and renders `<AdminWhatsAppClient conversations={rows} />` with no accounts branch/tab-switcher. This phase (155) adds exactly one new piece of server-side wiring: read `sp.conversation` (already available since `page.tsx` awaits `searchParams`) and pass it through:

```typescript
const initialConversationId = typeof sp.conversation === 'string' ? sp.conversation : null
// ...
<AdminWhatsAppClient conversations={rows} initialConversationId={initialConversationId} />
```

No new Zod schema is strictly required for this single opaque id passthrough (it's not used in a `.eq()` filter server-side — `loadAdminConversationThread` is called client-side and itself trusts/validates via the DB lookup returning `null` for a bad id), but the planner may choose to validate it's a plausible UUID shape before passing down, purely as defensive input hygiene (not a security boundary — `requireAdmin()` + the DB `.eq('id', conversationId).maybeSingle()` already fail closed on garbage input).

### Layout container (from UI-SPEC — authoritative, already approved)

```tsx
<div className="flex h-full min-h-0 gap-0 overflow-hidden">
  <div className="flex w-full md:w-[320px] md:shrink-0 min-h-0 flex-col border-r border-border ...">
    {/* list pane: filters header, scrollable rows, pagination footer */}
  </div>
  <div className="flex flex-1 min-h-0 flex-col overflow-hidden ...">
    {/* thread pane: header, scrollable message list, footer note */}
  </div>
</div>
```
The UI-SPEC's own **Autonomous decision** on the height-source problem: do NOT modify `app/admin/layout.tsx` (confirmed unchanged: `<main className="flex-1 overflow-y-auto px-8 py-8">`). Instead the Inbox page's own root wrapper takes `flex-1 min-h-0` so the two-pane row fills whatever height `<main>` gives it, with its own `overflow-hidden` so only the two inner panes scroll (not `<main>`, not the page itself). **Verified structurally sound**: `<main>` is itself `overflow-y-auto`, so if the Inbox page's direct child content is shorter than viewport, `<main>` won't scroll (nothing overflows it) — but if the two-pane container's own inner content (list rows, thread messages) overflows their own `overflow-y-auto` sub-elements, those scroll independently as intended. This matches the CONTEXT.md lock ("list scrolls, thread scrolls, page itself doesn't scroll as a whole").

**One structural risk to flag for the planner:** `<main>` currently has `px-8 py-8` padding (32px each side) baked in at the layout level, applied uniformly to every admin page's content. A full-bleed two-pane layout that wants to use most of the viewport height will have this padding eating into available space on all four sides — this is expected and already accounted for in the UI-SPEC's chosen approach (the page's own `h-full`/`flex-1 min-h-0` wrapper works within that padded box, it does not fight it). No `app/admin/layout.tsx` edit is needed or in scope.

### Mobile pattern — dual-render (not single-render + CSS hide)

Verified from Xphere's `chat-layout.tsx` (lines 1095, 1246): Xphere renders **two entirely separate DOM subtrees** — one gated `hidden md:flex` (desktop, both panes always mounted side by side) and one gated `md:hidden flex` (mobile, exactly one of list/chat mounted at a time via `mobileView` state) — rather than one subtree with responsive Tailwind classes on individual panes. UI-SPEC's own **Autonomous decision** (Layout Contract section) independently arrives at the same shape for Xtimator: "implement via conditional rendering... rather than pure CSS `hidden md:flex`... because the thread pane's data-fetch is already gated on `conversation` being set." Concretely, for Xtimator (which is simpler — SSR list, no polling hook), this can be expressed with a single JSX tree using responsive width/visibility classes on the LIST pane (`w-full md:w-[320px] md:shrink-0` + conditionally not rendering it below `md:` when a conversation is selected) rather than Xphere's fully-duplicated two-tree approach — the UI-SPEC explicitly signs off on this simpler variant since Xtimator has no polling/mount-cost concern that would justify full duplication. Either approach satisfies the locked requirement; the duplicated-tree approach is more literally Xphere-parity but adds more JSX surface for zero behavioral gain here.

### `useSearchParams()` and Suspense — confirmed non-issue

`app/admin/whatsapp/page.tsx` has `export const dynamic = 'force-dynamic'` (verified, line 13) and is wrapped in `<Suspense>` by `app/admin/layout.tsx` (verified, line 64: `<Suspense>{children}</Suspense>`). This means the existing `AdminWhatsAppFilters` client component's `useSearchParams()` call already works today without triggering a Next.js static-shell bailout warning, because the whole route is forced dynamic and already inside a Suspense boundary at the layout level. The new `AdminWhatsAppClient`'s added `useSearchParams()` call inherits the exact same safety — no new Suspense boundary needs to be added by this phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL-synced selection state | A custom global state manager (Zustand/Context) for the selected conversation id | `useSearchParams()` + `router.replace()` — the exact pattern `AdminWhatsAppFilters` already uses for 7 other params | One more param (`conversation`) composing into the same `URLSearchParams` object Filters already builds; no new state-management dependency, no risk of filters and selection drifting out of sync |
| Thread data fetching | A new server action or React Query/SWR wrapper | `loadAdminConversationThread` unchanged, called the same way (`useEffect` + `useState`) as today's `openThread` | Function is already correct, tested, security-reviewed (admin-only gate, cross-tenant-by-design, no mutations) — CONTEXT.md explicitly locks this as unchanged |
| Empty state placeholder | Bespoke centered `<div>` with hand-styled icon+text | `components/dashboard/empty-state.tsx`'s `EmptyState` component (`icon`, `title`, `description` props) | Already exists, already styled per this codebase's Pattern 6 convention (gradient-brand circle icon), UI-SPEC explicitly mandates reusing it |
| Mobile back navigation | A custom router history stack / back-button component | Clear the `conversation` search param via the same `router.replace()` mechanism used for selection | Consistent with the "everything is a URL param" model already established; no new navigation primitive needed |

**Key insight:** Every piece of business logic (data fetching, filters, pagination) this phase touches already exists and is already tested/secured. The only genuinely new code is: (1) the two-pane JSX layout replacing table+Sheet, (2) the `conversation` URL param read/write logic (a direct structural copy of the existing filter-param pattern), (3) the mobile single-column conditional render, (4) `page.tsx`'s one-line addition of `initialConversationId` passthrough.

## Common Pitfalls

### Pitfall 1: Breaking the e2e source-contract assertion on `loadAdminConversationThread(row.id, row.company_id)`
**What goes wrong:** `tests/e2e/admin-whatsapp.spec.ts`'s "static contract" describe block asserts (via `readFileSync` + `toContain`) that `admin-whatsapp-client.tsx`'s source contains the exact literal substring `loadAdminConversationThread(row.id, row.company_id)`. If the refactored call site becomes e.g. `loadAdminConversationThread(selectedId, row?.company_id)` (necessary because the click-time `row` variable no longer exists in an effect keyed on a URL param), this assertion breaks even though the underlying behavior is equivalent or better.
**Why it happens:** The test asserts on literal source text, not behavior — a common brittleness in "static contract" style tests, and Phase 154's research (which scoped test-file edits) did not flag this specific test because Phase 154 doesn't touch this file's logic, only its location.
**How to avoid:** Either (a) preserve a code path where a local `row` variable is still in scope when calling `loadAdminConversationThread(row.id, row.company_id)` at the moment of first user-driven selection (i.e., keep the click handler calling the load function directly with `row.id, row.company_id`, and ALSO have the effect-on-URL-change path for the deep-link/refresh case use a differently-shaped call that the test doesn't cover), or (b) update this specific test assertion as part of this phase's task list (simplest, most honest option — CONTEXT.md's "e2e selectors updated to the two-pane thread" success criterion already anticipates e2e test changes in this phase). Recommend (b): treat this assertion as part of "e2e selectors updated to the two-pane thread," update the string match to whatever the new call site actually looks like.
**Warning signs:** `npx playwright test tests/e2e/admin-whatsapp.spec.ts` failing specifically on the test titled `admin-whatsapp-client.tsx passes company_id to loadAdminConversationThread` after the refactor.

### Pitfall 2: Selected conversation not present in the current page/filter's `conversations` array
**What goes wrong:** If a user follows a direct link `/admin/inbox?conversation=<id>` where `<id>` belongs to a conversation not on the currently-rendered page (e.g., filters/page params don't include it), the list pane won't visually highlight anything (no row matches `selectedId`), which could look like a bug ("I clicked a link but nothing is selected in the list") even though the thread pane correctly loads and displays the right thread.
**Why it happens:** The list is server-paginated/filtered; the thread pane's data source (`loadAdminConversationThread`) is independent of the list's pagination/filter state — by design, since the thread loader takes a raw id, not a filtered list position.
**How to avoid:** This is expected/acceptable per CONTEXT.md's scope (no mention of "auto-navigate to the correct page/filter to reveal the selected row" — that would be meaningful added complexity, likely out of scope). Document this as expected behavior: the right pane is authoritative for "what's selected," the left pane's highlight is best-effort (only highlights if the row happens to be visible on the current page). No action needed beyond not treating this as a bug — but the planner should NOT attempt to "fix" this by auto-adjusting filters/pagination unless CONTEXT.md is revisited.
**Warning signs:** A well-meaning implementation that tries to auto-page/auto-filter to reveal the selected row — this is scope creep beyond the locked requirements and adds meaningful complexity (needs to reverse-map a conversation id to a page number under the current filter set, which the codebase has no existing utility for).

### Pitfall 3: Forgetting `scroll: false` on `router.replace` causes visible scroll-jump
**What goes wrong:** Every existing `router.replace()` call in `AdminWhatsAppFilters` (verified: lines 48, 117, 134, 144) does NOT pass `{ scroll: false }` — because those calls happen at the top of a page where there's nothing to scroll. But conversation selection happens potentially deep inside a scrolled list pane; a default `router.replace()` in Next.js App Router scrolls to top of the page on navigation unless `{ scroll: false }` is passed, which would visibly yank the list pane's scroll position back to the top every time a row is clicked.
**Why it happens:** The existing filter pattern this phase is told to "mirror exactly" doesn't need this option because its use case differs (filter changes reset to page 1 anyway, so a scroll-to-top is often desirable there); conversation selection should NOT reset scroll position of the list pane.
**How to avoid:** Add `{ scroll: false }` to the `router.replace()` calls used for conversation selection/clearing (this is a deliberate deviation from the literal filter-pattern mirror, justified by the different UX need — CONTEXT.md's "mirror the exact pattern" instruction is about the URL-param mechanics, not necessarily every option flag).
**Warning signs:** Clicking a conversation row scrolls the list pane back to its top, which is jarring and makes it hard to click multiple rows in sequence while scrolled down.

### Pitfall 4: `useEffect` race condition when rapidly switching conversations
**What goes wrong:** If a user clicks conversation A, then quickly clicks conversation B before A's `loadAdminConversationThread` promise resolves, a naive `useEffect` without a cancellation guard could have A's late-arriving response overwrite B's already-loaded thread, showing the wrong messages.
**Why it happens:** Async fetches triggered by rapidly-changing dependencies (here, `selectedId` changing on each click) are a classic React race-condition source; the current Sheet-based `openThread` doesn't have this bug in practice mainly because opening a new row while one is loading is a less common interaction pattern with a modal, but it's easier to trigger in a persistent two-pane UI where clicking through a list quickly is the expected happy path.
**How to avoid:** Use the `cancelled` flag pattern shown in the code sketch above (a `let cancelled = false` local var set `true` in the effect's cleanup function, checked before calling `setThread`/`setLoading` in the `.then()`). This is a standard, well-known React pattern — not something to hand-roll differently.
**Warning signs:** Rapidly clicking through several conversations shows a message thread that doesn't match the currently-selected/highlighted row.

### Pitfall 5: Assuming Phase 154's file-split changes `Row`'s shape or the `conversations` prop contract
**What goes wrong:** Since this phase's research is conducted against pre-154 file paths/content, an implementer might over-assume Phase 154 changes something about the `Row` type or how `conversations` is passed into the client component.
**Why it happens:** Both phases touch the same file family, creating an easy assumption that Phase 154 "prepares" something for 155 beyond just moving files and stripping the Accounts tab.
**How to avoid:** Per Phase 154's own research (verified, cross-read this session): `admin-whatsapp-client.tsx` moves **byte-verbatim** — Phase 154 makes ZERO edits to its content, only relocates the file. The `Row` type, the `conversations` prop, and the `AdminWhatsAppClient` export name are all exactly as documented in this research. Phase 155 should treat the post-154 file as identical to what's described here, just at `app/admin/inbox/admin-whatsapp-client.tsx` instead of `app/admin/whatsapp/admin-whatsapp-client.tsx`, and imported from a `page.tsx` that has already dropped the Accounts-tab branch (so `page.tsx`'s conversations-only body, per 154's research Pitfall 1, is the caller context 155 will see).
**Warning signs:** None expected if the executor re-reads the actual post-154 files at execution time (as CONTEXT.md itself instructs) rather than relying solely on this research's necessarily-pre-154 reading.

## Code Examples

### Existing shallow-URL-update pattern to mirror exactly (verified, `admin-whatsapp-filters.tsx` lines 39-49)
```typescript
function pushParam(key: string, value: string) {
  const params = new URLSearchParams(sp.toString())
  if (value && value !== 'all') {
    params.set(key, value)
  } else {
    params.delete(key)
  }
  // Reset to page 1 on filter change
  params.delete('page')
  router.replace(`/admin/whatsapp?${params.toString()}`)  // becomes /admin/inbox post-154
}
```
The `conversation` param should NOT reset `page` (selecting a conversation shouldn't affect the list's pagination) — this is a deliberate divergence from the filter pattern's `params.delete('page')` line, justified because conversation selection and list pagination are orthogonal concerns (CONTEXT.md doesn't say to reset pagination on selection, and doing so would be surprising — selecting a thread on page 3 of results shouldn't kick the list back to page 1).

### Existing keyboard-accessible row pattern to port (verified, `admin-whatsapp-client.tsx` lines 77-88)
```typescript
<tr
  key={row.id}
  role="button"
  tabIndex={0}
  onClick={() => openThread(row)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openThread(row)
    }
  }}
  className="cursor-pointer hover:bg-muted/20"
>
```
Port this exact `role`/`tabIndex`/`onKeyDown` triplet onto the new list-pane row `<div>`, swapping `openThread(row)` for the new `selectConversation(row)` (URL-param-setting function).

### `loadAdminConversationThread` signature (unchanged, verified `lib/actions/admin-whatsapp.ts` lines 23-26)
```typescript
export async function loadAdminConversationThread(
  conversationId: string,
  expectedCompanyId?: string,
): Promise<{ ok: true; thread: ConversationThread } | { ok: false; error: string }>
```
`expectedCompanyId` is optional — safe to omit when the selected row isn't present in the current page's loaded `conversations` array (see Architecture Patterns section above).

### `EmptyState` component signature to reuse for "no conversation selected" (verified, `components/dashboard/empty-state.tsx`)
```typescript
interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  onClearFilter?: () => void
}
```
Usage per UI-SPEC's Copywriting Contract:
```tsx
<EmptyState
  icon={MessageSquare}
  title="Select a conversation"
  description="Choose a conversation from the list to view its messages."
/>
```
No `actionLabel`/`actionHref`/`onAction`/`onClearFilter` needed — this is a pure informational empty state with no CTA.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `<table>` rows + right-side `Sheet` overlay (modal), selection held in local `useState<Row\|null>` | Two-pane persistent layout, selection held in URL `?conversation=<id>` param | This phase (155) | Selection becomes shareable/bookmarkable/refresh-safe; no more modal — the thread is always visible in context alongside the list; `Sheet` component itself remains in the codebase (used elsewhere) but this feature stops using it |
| `openThread(row)` — click handler with `row` always in scope, calling `loadAdminConversationThread(row.id, row.company_id)` directly | `useEffect` on `selectedId` (derived from URL), looking up `row` from the current page's `conversations` array (may be `undefined` if navigated via direct link off-page) | This phase (155) | `expectedCompanyId` becomes optional-in-practice for off-page selections — already supported by the function's own optional parameter design, not a new gap |

**Deprecated/outdated:** N/A — no library/framework deprecations; this is an internal component-architecture change (modal → persistent pane, local state → URL state).

## Open Questions

1. **Should the thread pane show a distinct "conversation not found in current filter" hint when `selectedId` isn't in the loaded `conversations` array?**
   - What we know: `loadAdminConversationThread` will still succeed and return the correct thread+conversation data regardless of whether the row is in the currently-filtered/paginated list — the header can be built entirely from `thread.conversation` fields (which include `contact_name`, `contact_phone`, `company_id`) rather than depending on finding a matching `row`.
   - What's unclear: CONTEXT.md doesn't explicitly address this edge case (arriving at a conversation not visible in the current filter/page).
   - Recommendation: Build the thread pane's header from `thread?.conversation` (the authoritative source, always available once loaded) rather than from the `row` lookup in `conversations` — this sidesteps the question entirely and is more correct regardless, since `thread.conversation` is guaranteed fresh/authoritative while a stale `row` object from a previous page load is not.

2. **Does `unread_count` need to be optimistically cleared/decremented when a conversation is opened, mirroring Xphere's read-tracking behavior?**
   - What we know: CONTEXT.md explicitly says this is a "read-only... inspection tool" and the current Sheet-based implementation does NOT call any mark-as-read action (confirmed: `loadAdminConversationThread` has zero `.update()`/`.insert()` calls per its own doc comment and the e2e test `loadAdminConversationThread contains no update/insert/delete calls`).
   - What's unclear: Xphere calls a `/read` endpoint on selection (visible in `chat-layout.tsx`'s `onSelect` handlers) — but that's out of scope here per the read-only lock.
   – Recommendation: Do NOT add any read-tracking/mark-as-read behavior. `unread_count` stays exactly as fetched, unchanged by selection — this is explicitly consistent with the locked read-only decision and the existing (unchanged) `loadAdminConversationThread` contract.

## Environment Availability

No external service/tool dependencies beyond the existing repo toolchain (Node/npm, Next.js 16.2.6, Vitest 4.1.4, Playwright). No new packages needed — `lucide-react` (`^1.8.0`, already installed) provides `MessageSquare` and `ChevronLeft` icons referenced in the UI-SPEC's Copywriting Contract.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (unit) + Playwright (e2e, `test:e2e` script) |
| Config file | `vitest.config.ts` (unit), `playwright.config.ts` (e2e) |
| Quick run command | `npx vitest run tests/unit/admin/whatsapp-filters.test.ts tests/unit/whatsapp/admin-authority-contract.test.ts` |
| Full suite command | `npm test` (vitest run, full unit suite) + `npx playwright test tests/e2e/admin-whatsapp.spec.ts` |

**Confirmed baseline (ran live during research):** 2 unit-test files, 33 tests total, 100% passing before any change.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INBOX-02 | Two-pane layout renders; no `<Sheet>`/`<table>` in source | unit (source-contract) or e2e (DOM assertion) | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` | ✅ needs new/updated assertions — no existing `Sheet` selector to remove (none exist), but the "static contract" block's `admin-whatsapp-client.tsx passes company_id to loadAdminConversationThread` test (line ~173) needs its literal-string match updated to whatever the new call site looks like (see Pitfall 1) |
| INBOX-02 | Selecting a conversation updates `?conversation=<id>` (shallow), loads thread, no modal | e2e (requires seeded admin creds — currently `test.skip` without `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD`) | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` | ❌ Wave 0 gap — no existing test clicks a conversation row and asserts the URL param; a new test should be added (can extend the first describe block, gated the same way as the other live-nav tests) |
| INBOX-02 | Direct link/refresh SSR-selects the thread | e2e (live-nav, requires seeded admin) | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` | ❌ Wave 0 gap — new test needed: `page.goto('/admin/inbox?conversation=<seeded-id>')` then assert thread content is visible without a prior click |
| INBOX-02 | Empty-state prompts a pick when no `?conversation=` | e2e or unit | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` | ❌ Wave 0 gap — new test/assertion needed for the "Select a conversation" empty state text |
| INBOX-02 | Mobile collapses to single column with back affordance | e2e (viewport-sized) | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` (with `page.setViewportSize` or a dedicated mobile project) | ❌ Wave 0 gap — no existing mobile-viewport test in this spec file; Playwright config may already define a mobile project (not verified this session — check `playwright.config.ts` projects list during planning) |
| INBOX-02 | Read-only posture preserved (no reply/send) | unit (source-contract, already exists for `admin-whatsapp-accounts.tsx`, none yet for the client) | Add a `not.toMatch(/sendMessage\|reply\|handleSend/i)` assertion for `admin-whatsapp-client.tsx`, mirroring the existing pattern used for `admin-whatsapp-accounts.tsx` | ❌ Wave 0 gap — pattern exists elsewhere in the same spec file (line ~246-254) but not yet applied to the client component being refactored here |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/admin/whatsapp-filters.test.ts tests/unit/whatsapp/admin-authority-contract.test.ts` (fast, ~2s per confirmed baseline run)
- **Per wave merge:** `npm test` (full unit suite) + `npx playwright test tests/e2e/admin-whatsapp.spec.ts` (note: several tests in this file `test.skip` without `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` env vars — the "static contract" describe block runs unconditionally and is the meaningful regression gate in environments without seeded admin creds)
- **Phase gate:** Full suite green before `/gsd:verify-work`; if seeded admin creds are unavailable in the execution environment, the "static contract" block's assertions (source-string checks) are the achievable gate — flag any live-nav-only requirement (deep-link SSR selection, mobile viewport) as manually verified if creds are unavailable.

### Wave 0 Gaps
- [ ] New e2e test(s) in `tests/e2e/admin-whatsapp.spec.ts` (or a new file) asserting: clicking a conversation row updates the URL `?conversation=` param and shows the thread inline (no `Sheet`/dialog role) — requires seeded admin creds, follows the existing `test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, ...)` gating pattern already in this file
- [ ] New e2e test asserting direct navigation to `/admin/inbox?conversation=<id>` renders the thread without requiring a prior click (SSR/prop-passthrough behavior)
- [ ] New e2e test or unit source-contract test asserting the "Select a conversation" empty-state text renders when no `conversation` param is present
- [ ] New e2e test (or verify existing Playwright config has a mobile viewport project) asserting single-column collapse + back affordance below `md:` (768px)
- [ ] New unit or e2e source-contract assertion: `admin-whatsapp-client.tsx` contains no reply/send-related identifiers (mirrors the existing pattern already applied to `admin-whatsapp-accounts.tsx`)
- [ ] Update the existing "static contract" assertion for `loadAdminConversationThread(row.id, row.company_id)` to match whatever literal call-site shape the refactored component actually uses (see Pitfall 1) — this is a required edit to an EXISTING test, not a net-new test, but it will fail if left as-is post-refactor

## Sources

### Primary (HIGH confidence — direct repository reads, this session)
- `app/admin/whatsapp/admin-whatsapp-client.tsx` (167 lines, full read) — current table+Sheet implementation, `openThread`, `Row` type
- `app/admin/whatsapp/admin-whatsapp-filters.tsx` (163 lines, full read) — the exact `useSearchParams`/`router.replace` shallow-update pattern to mirror
- `app/admin/whatsapp/page.tsx` (208 lines, full read) — confirms `Row` shape, `AdminWhatsAppClient` invocation site, `searchParams` handling
- `components/whatsapp/message-bubble.tsx` (149 lines, full read) — `MessageBubble`, `AudioMessage`, unchanged
- `lib/whatsapp/inbox-types.ts` (17 lines, full read) — `ConversationThread` type
- `lib/actions/admin-whatsapp.ts` (77 lines, full read) — `loadAdminConversationThread`, confirmed `expectedCompanyId` optional, no mutations
- `lib/queries/admin-whatsapp.ts` (194 lines, full read) — `parseAdminWhatsAppFilters`, `listAdminWhatsAppConversations`, confirms `unread_count`/`contact_name`/etc. field shapes
- `components/dashboard/empty-state.tsx` (58 lines, full read) — `EmptyState` component props
- `app/admin/layout.tsx` (70 lines, full read) — confirms `<main className="flex-1 overflow-y-auto px-8 py-8">` and `<Suspense>` wrapping
- `tests/e2e/admin-whatsapp.spec.ts` (337 lines, full read) — confirmed zero `Sheet`-related selectors exist; confirmed exact literal-string assertions in the "static contract" block
- `components/ui/card.tsx` (116 lines, full read) — `glass` variant tokens confirmed
- `components/i18n/t.tsx` (28 lines, full read) — `<T>` component API
- `app/(app)/projects/[id]/page.tsx` (partial read, lines 255-284) + `loading.tsx` — confirmed `md:` breakpoint convention (`hidden md:flex` pattern), though for a different use case (sticky action bar, not list↔detail)
- `app/admin/companies/companies-controls.tsx` (partial read) — second confirmed instance of the identical `useSearchParams`/`router.replace` filter pattern
- `C:\Users\Vanildo\Dev\xphere\src\components\chat\chat-layout.tsx` (1347 lines, full read) — verified `mobileView: 'list'|'chat'|'info'` state, dual-render `hidden md:flex` / `md:hidden flex` pattern, `onSelect` handlers
- `C:\Users\Vanildo\Dev\xphere\src\components\chat\conversation-list.tsx` (1009 lines, full read) — verified `ConversationCardBase` row anatomy (`role="button"`, `tabIndex={0}`, Enter/Space keydown, selected/hover/priority accent-border pattern)
- Live grep: confirmed `md:hidden`/`hidden md:` convention appears in exactly 6 files repo-wide (`companies-controls.tsx`, `admin-whatsapp-filters.tsx`, `projects/[id]/page.tsx`, `clients/[id]/loading.tsx`, `projects/[id]/loading.tsx`, `events-controls.tsx`)
- Live test run: `npx vitest run tests/unit/admin/whatsapp-filters.test.ts tests/unit/whatsapp/admin-authority-contract.test.ts` — 33/33 passing baseline confirmed
- `package.json` — confirmed `next@16.2.6`, `react@19.2.4`, `lucide-react@^1.8.0`
- `.planning/phases/154-inbox-route-consolidation-settings/154-RESEARCH.md` (full read) — confirms post-154 file layout, byte-verbatim relocation of `admin-whatsapp-client.tsx`, conversations-only simplified `page.tsx`
- `.planning/phases/155-inbox-master-detail-viewer/155-CONTEXT.md`, `155-UI-SPEC.md` (full read)
- `.planning/REQUIREMENTS.md` (INBOX-02 section)

### Secondary (MEDIUM confidence)
- Next.js `useSearchParams()` + Suspense interaction and `router.replace({ scroll: false })` behavior — based on well-established, stable App Router API knowledge (not independently re-verified against current Next.js 16 docs this session), but low-risk since the exact pattern is already proven working in this same codebase today (`AdminWhatsAppFilters`, `CompaniesControls`, `EventsControls` all use it without issue).

### Tertiary (LOW confidence)
None — every claim in this document is grounded in a direct repository read (including the Xphere reference codebase) or a live command run during this research session.

## Metadata

**Confidence breakdown:**
- Standard stack: N/A (no new libraries/dependencies introduced)
- Architecture: HIGH — every file involved (both Xtimator's current implementation and the Xphere reference) was read in full, not sampled or grepped-only
- Pitfalls: HIGH — derived from direct comparison of the existing test assertions against the structural change this phase requires, not speculative

**Research date:** 2026-07-05
**Valid until:** 14 days (tied to the exact current state of pre-154 files; Phase 154 must execute first — re-verify the post-154 file layout matches this research's assumptions before Phase 155 executes, per Phase 154's research also noting a 14-day validity window)
