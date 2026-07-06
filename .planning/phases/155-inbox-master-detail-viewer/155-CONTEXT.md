# Phase 155: Inbox Master-Detail Viewer - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning
**Mode:** Autonomous run (discuss skipped per explicit user authorization to execute unattended). Depends on Phase 154 having already relocated the Inbox page to `app/admin/inbox/` — this phase edits files AT THAT NEW LOCATION, not the old `app/admin/whatsapp/` paths.

<domain>
## Phase Boundary

Replace the current table + right-side `Sheet` overlay (in what is now `app/admin/inbox/admin-whatsapp-client.tsx`, per Phase 154's relocation) with a persistent two-pane master-detail layout on the same page — conversation list on the left, thread on the right — styled after the Xphere inbox reference. Read-only stays read-only; no reply/send capability is added. This is a pure UI/interaction refactor of the SAME page; no new routes, no data-layer changes.

</domain>

<decisions>
## Implementation Decisions

### Layout shape (reference: Xphere's `chat-layout.tsx` / `conversation-list.tsx` / `chat-area.tsx`, at `C:\Users\Vanildo\Dev\xphere\src\components\chat\`)

Two panes, not three (no contact-info panel — that's Xphere-parity scope, deferred to INBOXX-02):
```
┌─────────────────────────┬───────────────────────────────────────┐
│ Conversation List (left)│  Thread (right)                       │
│ - search/filters header │  - header: contact name/phone/company │
│ - scrollable rows       │  - scrollable message list             │
│ - pagination footer     │  - "Read-only, last 30 days" footer   │
└─────────────────────────┴───────────────────────────────────────┘
```
- Left pane: a fixed-ish width (Xphere uses 300px default, resizable 260-420px — resizing is Claude's discretion to include or skip; a FIXED width, e.g. `w-[320px]` or `w-[360px]`, is an acceptable simpler v1 if resize logic adds meaningful risk/time — the locked requirement is the two-pane shape, not resizability).
- Right pane: `flex-1`, fills remaining width.
- Container: `flex` row, height locked to the available admin content area (mirror the existing admin shell's scrolling convention — check `app/admin/layout.tsx` for how `<main>` is sized) with `min-h-0` on both panes so each scrolls independently (list scrolls, thread scrolls, page itself doesn't scroll as a whole).

### Conversation list (left pane) — Xphere-style row styling

Per Xphere's `ConversationCardBase` (`conversation-list.tsx`), adapt to Xtimator's existing shadcn/Tailwind tokens (do NOT import Xphere's custom CSS variables — reuse Xtimator's own `--muted`, `--primary`, `--border` etc., matching the visual WEIGHT/structure of Xphere's rows, not its literal color values):
- Row: `flex items-center gap-3 px-3 py-2.5 rounded-md` (or similar existing radius token), hover `hover:bg-muted/20` (matches the existing table-row hover class already used in this codebase), selected state `bg-muted/60` + a left accent border (e.g. `border-l-2 border-[hsl(var(--primary))]`).
- Content: contact name (`text-sm font-medium`, fallback "(unknown)" — reuse the exact fallback copy already in `admin-whatsapp-client.tsx`), last-message preview (`text-xs text-muted-foreground truncate`), company name as a secondary muted label (reuse existing `(unknown company)` fallback), timestamp (`text-xs text-muted-foreground whitespace-nowrap`, reuse the existing `toLocaleString()` formatting), unread indicator (reuse the existing `<Badge variant="outline">{row.unread_count}</Badge>` or a smaller dot — Claude's discretion, but must remain visually distinguishable when `unread_count > 0`).
- Keep the EXISTING keyboard accessibility pattern from the current table rows (`role="button"`, `tabIndex={0}`, Enter/Space triggers selection) — just apply it to the new row component instead of a `<tr>`.
- Header of this pane: reuse `AdminWhatsAppFilters`/`InboxFilters` (from Phase 154's relocation) — search + status + unread + date range — unchanged logic, just placed at the top of the list pane instead of above a full-width table.
- Footer of this pane: reuse the existing pagination Prev/Next + "Page X of Y" links, unchanged logic, placed at the bottom of the list pane.

### Thread (right pane) — reuse existing thread-loading logic verbatim

- Data: SAME `loadAdminConversationThread(conversationId, companyId)` server action already used by the current `Sheet` — no new query. Reuse `MessageBubble` (`components/whatsapp/message-bubble.tsx`) unchanged for rendering each message.
- Selection state: replace the current `useState<Row|null>` "openRow" pattern with state driven by `?conversation=<id>` in the URL (via `useSearchParams` + `router.replace` shallow update — mirror the exact pattern `InboxFilters`/`AdminWhatsAppFilters` already uses for its own params, so filter changes and conversation selection compose correctly in the same query string).
- **Deep-linking**: `page.tsx` (Server Component) reads `searchParams.conversation` and can pre-resolve/pass the initially-selected id so a direct link or full-page refresh shows the right thread without a client-side round trip flash (Claude's discretion on exact SSR-vs-client-fetch split — the simplest correct approach: page.tsx passes the raw `conversation` id from searchParams to the client component, which immediately calls `loadAdminConversationThread` on mount/id-change, same as today's `openThread` — just triggered by a prop/URL change instead of a click handler setting local state).
- **Empty state**: when no `?conversation=` is set, the right pane shows a centered placeholder (e.g. an icon + "Select a conversation to view its messages") instead of being blank.
- Footer note ("Read-only. Shows up to the last 30 days of messages.") stays, unchanged copy.
- Header of this pane: contact name/phone + company (same fields the `SheetHeader` shows today), just rendered as a normal pane header instead of `SheetHeader`.

### Mobile behavior

Below a `md`/`lg` breakpoint (check existing Tailwind breakpoint conventions used elsewhere in the admin panel — likely `md:` per the rest of this codebase's admin surfaces), collapse to a SINGLE column:
- No conversation selected → show the list (full width).
- Conversation selected → show the thread (full width) with a visible "← Back" affordance that clears `?conversation=` and returns to the list.
- This mirrors Xphere's `mobileView: 'list' | 'chat'` toggle conceptually, but can be implemented simply via CSS (`hidden md:flex` / conditional rendering based on whether a conversation is selected AND viewport), whichever is simpler given this codebase's existing responsive patterns — check how other admin tables/panels in this repo already handle mobile (e.g. the Companies list) before inventing a new responsive pattern.

### What must NOT change in this phase

- The `Sheet` component (`components/ui/sheet.tsx`) itself is not modified — just no longer used BY this feature (it's used elsewhere in the app).
- `lib/queries/admin-whatsapp.ts`, `lib/actions/admin-whatsapp.ts` — unchanged (same functions, same signatures).
- The Settings page (Phase 154's `/admin/inbox/settings`) — untouched by this phase.
- No reply/send UI is added anywhere (locked read-only decision).

### Claude's Discretion

- Resizable left pane (Xphere has it) — optional, skip if it adds meaningful complexity; a fixed-width pane satisfies the locked requirement.
- Whether unread indicator is a numeric badge (current behavior) or a plain dot (more Xphere-like) — either is acceptable, must remain visually clear.
- Exact empty-state copy/icon for "no conversation selected."

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/admin/inbox/admin-whatsapp-client.tsx` (post-Phase-154 location) — the CURRENT table+Sheet implementation being refactored; read it fresh at execution time since Phase 154 will have relocated (not rewritten) it — the logic inside (the `openThread` function, the `Row` type, the `loadAdminConversationThread` call) is exactly what this phase adapts to the new layout.
- `app/admin/inbox/admin-whatsapp-filters.tsx` (post-Phase-154 location) — reuse verbatim, just re-positioned in the new list-pane header.
- `components/whatsapp/message-bubble.tsx` — `MessageBubble`, reuse unchanged.
- `lib/actions/admin-whatsapp.ts` — `loadAdminConversationThread`, reuse unchanged.
- `lib/whatsapp/inbox-types.ts` — `ConversationThread` type, reuse unchanged.

### Established Patterns (from this codebase)
- URL-param-driven client state via `useSearchParams` + `router.replace(...)` shallow updates (the exact pattern already in `admin-whatsapp-filters.tsx` for search/status/date/unread — conversation selection should follow the identical technique, just for the `conversation` param).
- `role="button"` + `tabIndex={0}` + Enter/Space handling for clickable non-native-button rows (already in the current table rows).

### Reference Design (Xphere — study visually, port structurally, NOT its literal design-token values)
- `C:\Users\Vanildo\Dev\xphere\src\components\chat\chat-layout.tsx` — the 2/3-pane orchestrator (Xtimator only needs 2 of its 3 panes: list + thread, no contact-info panel).
- `C:\Users\Vanildo\Dev\xphere\src\components\chat\conversation-list.tsx` — row structure/spacing/states to emulate (name, preview, timestamp, unread, selected/hover states, priority-less version since Xtimator has no priority concept).
- `C:\Users\Vanildo\Dev\xphere\src\components\chat\chat-area.tsx` + `chat-area/message-list.tsx` — thread pane structure (header + scrollable messages + footer), NOT its composer (Xtimator has none — read-only).
- Xphere uses Tailwind 4 + shadcn/ui + custom CSS-variable design tokens; Xtimator already uses Tailwind + shadcn — reuse XTIMATOR'S OWN existing tokens (`--muted`, `--primary`, `--border`, glass card variants already seen in `Card variant="glass"`), do not import Xphere's token names.

</code_context>

<specifics>
## Specific Ideas

The owner explicitly named the Xphere inbox (`C:\Users\Vanildo\Dev\xphere`) as the layout/UX reference — the structural shape (list-left/thread-right, row anatomy, selected/hover states, empty state) should visibly resemble it, without porting Xphere's own color system, composer, resizing, or contact-info panel (all out of scope per the locked decisions above).

</specifics>

<deferred>
## Deferred Ideas

- Contact-info third panel, realtime subscriptions, multi-channel — INBOXX-01/02/03 (v2).
- Resizable list pane — optional/discretionary this phase, not required.

</deferred>
