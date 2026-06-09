---
phase: quick-260609-mdy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/whatsapp/message-bubble.tsx
  - components/whatsapp/whatsapp-inbox.tsx
  - lib/actions/admin-whatsapp.ts
  - app/admin/whatsapp/admin-whatsapp-client.tsx
  - app/admin/whatsapp/page.tsx
autonomous: true
requirements: [QUICK-MDY-01]
must_haves:
  truths:
    - "Admin can click any conversation row on /admin/whatsapp"
    - "Clicking opens a read-only side panel showing the full message thread (up to 30 days)"
    - "The panel has NO reply box, NO send-estimate, NO mutating actions"
    - "Audio and image messages render with working signed media URLs"
    - "The existing user-facing /whatsapp inbox continues to work identically"
  artifacts:
    - path: "lib/actions/admin-whatsapp.ts"
      provides: "loadAdminConversationThread cross-company server action (admin-guarded, read-only)"
      contains: "loadAdminConversationThread"
    - path: "components/whatsapp/message-bubble.tsx"
      provides: "Shared MessageBubble + AudioMessage + formatTime/formatDuration"
      contains: "export function MessageBubble"
    - path: "app/admin/whatsapp/admin-whatsapp-client.tsx"
      provides: "Clickable table + read-only thread Sheet"
      contains: "loadAdminConversationThread"
  key_links:
    - from: "app/admin/whatsapp/admin-whatsapp-client.tsx"
      to: "lib/actions/admin-whatsapp.ts"
      via: "loadAdminConversationThread(conversationId) on row click"
      pattern: "loadAdminConversationThread"
    - from: "lib/actions/admin-whatsapp.ts"
      to: "whatsapp_messages"
      via: "service client, created_at >= 30-day cutoff"
      pattern: "whatsapp_messages"
    - from: "components/whatsapp/whatsapp-inbox.tsx"
      to: "components/whatsapp/message-bubble.tsx"
      via: "import MessageBubble"
      pattern: "message-bubble"
---

<objective>
Make each conversation row on the admin WhatsApp page (`app/admin/whatsapp/page.tsx`) clickable. Clicking opens a strictly read-only side panel (Sheet) showing the COMPLETE message history of that conversation, limited to the last 30 days. No reply box, no send-estimate, no actions — just the message thread.

Purpose: Admins currently see only a static cross-tenant conversation list with no way to inspect what was actually said. This adds drill-down into the full thread for support/debugging.

Output:
- New admin-only, cross-company, read-only server action `loadAdminConversationThread`.
- Extracted shared `MessageBubble`/`AudioMessage` rendering module reused by both the user inbox and the admin view.
- New admin client component rendering a clickable table + read-only thread Sheet.
- Refactored `page.tsx` server component passing serializable props.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

<interfaces>
<!-- Contracts the executor needs. Extracted from codebase — use directly, no exploration. -->

From lib/whatsapp/inbox-types.ts:
```typescript
export interface ConversationThread {
  conversation: WaConversationRow
  messages: WaMessageRow[]
}
```
WaConversationRow / WaMessageRow come from @/lib/whatsapp/conversations.
WaMessageRow fields used by rendering: id, direction ('inbound'|'outbound'), msg_type ('text'|'image'|'audio'|'document'|'system'), body, media_url (storage path or null), status ('failed'|...), created_at.
WaConversationRow fields used: id, company_id, contact_phone, contact_name, last_message_at, last_message_preview, last_inbound_at, unread_count, client_id.

Existing company-scoped fetchThread media-enrichment (REPLICATE this exactly in the admin action, minus the company_id filter):
```typescript
const storage = getServerStorage() // from '@/lib/storage'
// for each message:
if ((m.msg_type === 'audio' || m.msg_type === 'image') && m.media_url && !m.media_url.startsWith('http')) {
  const bucket = m.msg_type === 'audio' ? 'audio' : 'photos'
  try {
    const signedUrl = await storage.getSignedUrl(bucket, m.media_url, 3600)
    return { ...m, media_url: signedUrl }
  } catch {
    return { ...m, media_url: null }
  }
}
return m
```

Admin guards (already used by current page.tsx):
```typescript
import { requireAdmin } from '@/lib/auth/admin-context'      // cross-company admin gate, throws notFound() if not admin
import { requireServiceClient } from '@/lib/supabase/service' // non-nullable service client (RLS bypass)
```

Sheet primitive (components/ui/sheet.tsx) exports: Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose, etc. SheetContent supports `side="right"`. Use Sheet for the read-only side panel.

i18n: `import { T } from '@/components/i18n/t'` — wrap static English strings as `<T>...</T>`, interpolated as `<T text={`${n} items`} />`.
</interfaces>

@components/whatsapp/whatsapp-inbox.tsx
@lib/actions/whatsapp-inbox.ts
@app/admin/whatsapp/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract shared MessageBubble module</name>
  <files>components/whatsapp/message-bubble.tsx, components/whatsapp/whatsapp-inbox.tsx</files>
  <action>
Create `components/whatsapp/message-bubble.tsx` ('use client') by MOVING (not re-authoring) these four items verbatim out of `components/whatsapp/whatsapp-inbox.tsx`:
- `formatTime(iso: string | null): string`
- `formatDuration(s: number): string`
- `AudioMessage` component
- `MessageBubble` component

Export `MessageBubble`, `AudioMessage`, `formatTime`, and `formatDuration`. Keep the imports those moved blocks need: `useRef`/`useState` from 'react', the lucide icons `Play`, `Pause`, `Mic`, `CheckCheck`, `cn` from '@/lib/utils', and `type { WaMessageRow } from '@/lib/whatsapp/conversations'`.

CRITICAL — behavior preservation: copy `formatTime` EXACTLY as it currently exists (a recent commit, 260609-hwd, made it hydration-safe — `if (!iso) return ''`, then `new Date(iso)`, an `isNaN(d.getTime())` guard returning '', then `toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })`). Do not "improve" or reformat it.

Then in `whatsapp-inbox.tsx`:
- DELETE the moved `formatTime`, `formatDuration`, `AudioMessage`, `MessageBubble` definitions.
- ADD `import { MessageBubble, formatTime } from '@/components/whatsapp/message-bubble'`. (`formatTime` is still called inside the inbox conversation list at `formatTime(c.last_message_at)` — keep that working via the import. `formatDuration` is only used by AudioMessage, so it is NOT imported into the inbox.)
- Remove now-unused icon imports from whatsapp-inbox.tsx ONLY: `Play`, `Pause`, `Mic` (used only by AudioMessage) and `CheckCheck` (used only by MessageBubble) move out with the components — drop them from the inbox import. KEEP all icons still referenced by the inbox: `MessageCircle`, `Send`, `Loader2`, `ArrowLeft`, `FileText`, `AlertTriangle`.
- KEEP `useRef` in the inbox — it is still used (messagesEndRef, didDeepLink).

The extraction must be byte-for-byte behavior-preserving: the user-facing /whatsapp inbox must render identically.
  </action>
  <verify>
    <automated>npx tsc --noEmit; npx eslint components/whatsapp/message-bubble.tsx components/whatsapp/whatsapp-inbox.tsx</automated>
  </verify>
  <done>message-bubble.tsx exports MessageBubble/AudioMessage/formatTime/formatDuration; whatsapp-inbox.tsx imports MessageBubble + formatTime from it and no longer defines them; tsc clean (no new errors); no unused-import lint errors in either file.</done>
</task>

<task type="auto">
  <name>Task 2: Admin cross-company read-only thread server action</name>
  <files>lib/actions/admin-whatsapp.ts</files>
  <action>
Create `lib/actions/admin-whatsapp.ts` with `'use server'` at the top. Export:

```typescript
export async function loadAdminConversationThread(
  conversationId: string,
): Promise<{ ok: true; thread: ConversationThread } | { ok: false; error: string }>
```

Implementation:
1. `await requireAdmin()` — cross-company admin gate (from '@/lib/auth/admin-context'). This is the ONLY authorization; do NOT call getActiveCompanyId (admin views are intentionally cross-tenant).
2. `const svc = requireServiceClient()` (from '@/lib/supabase/service').
3. Fetch the conversation row by id ALONE (no company_id filter):
   `svc.from('whatsapp_conversations').select('*').eq('id', conversationId).maybeSingle()`.
   If null → return `{ ok: false, error: 'Conversation not found' }`.
4. Compute cutoff: `const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()`.
5. Fetch messages:
   `svc.from('whatsapp_messages').select('*').eq('conversation_id', conversationId).gte('created_at', cutoff).order('created_at', { ascending: true }).limit(1000)`.
6. Enrich audio/image media_url into signed URLs EXACTLY like fetchThread in lib/actions/whatsapp-inbox.ts (see <interfaces> block): getServerStorage() from '@/lib/storage', Promise.all over messages, bucket 'audio'|'photos', getSignedUrl(bucket, path, 3600), try/catch → media_url: null, skip when media_url already starts with 'http' or is null.
7. Return `{ ok: true, thread: { conversation, messages: enriched } }`.

Types: `import type { ConversationThread } from '@/lib/whatsapp/inbox-types'` and `import type { WaConversationRow, WaMessageRow } from '@/lib/whatsapp/conversations'`. Cast query results: `(data as WaConversationRow | null)`, `((messages ?? []) as WaMessageRow[])`.

Do NOT: mark read, call markConversationRead, revalidatePath, or any write. This is a pure read. The service role stays server-side (the 'use server' boundary + requireAdmin guard guarantees the key never reaches the browser — CLAUDE.md SEC requirement).
  </action>
  <verify>
    <automated>npx tsc --noEmit; npx eslint lib/actions/admin-whatsapp.ts</automated>
  </verify>
  <done>loadAdminConversationThread compiles, is 'use server', calls requireAdmin + requireServiceClient, queries by conversationId with gte created_at 30-day cutoff, enriches media URLs, returns ConversationThread; no revalidate/markRead/write calls present.</done>
</task>

<task type="auto">
  <name>Task 3: Clickable admin table + read-only thread Sheet, refactor page</name>
  <files>app/admin/whatsapp/admin-whatsapp-client.tsx, app/admin/whatsapp/page.tsx</files>
  <action>
**(A) New client component** `app/admin/whatsapp/admin-whatsapp-client.tsx` ('use client'):

Props (serializable only — NO Map across the server/client boundary):
```typescript
type Row = {
  id: string; company_id: string; contact_phone: string; contact_name: string | null
  last_message_at: string | null; last_message_preview: string | null
  last_inbound_at: string | null; unread_count: number; company_name: string | null
}
export function AdminWhatsAppClient({ conversations }: { conversations: Row[] })
```
(Merge company name into each row server-side as `company_name` — simpler than passing a separate object/Map.)

Render the SAME table markup currently in page.tsx (preserve columns Phone/Name/Company/Unread/Last message/Last activity, the same Tailwind classes, `Card variant="glass"`, `Badge` for unread, `<T>` wrappers, `new Date(ts).toLocaleString()` for last activity where `ts = row.last_message_at ?? row.last_inbound_at`). The header/intro `<div>` block stays in page.tsx (server) — this client component renders ONLY the Card+table and the Sheet. Make each `<tr>` clickable: add `onClick={() => openThread(row)}`, `className="... cursor-pointer hover:bg-muted/20"`, `role="button"`, `tabIndex={0}`, and `onKeyDown` opening on Enter/Space (`if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openThread(row) }`). Keep it a `<tr>` with onClick — do NOT wrap cells in buttons (breaks table layout).

State + behavior:
- `const [openRow, setOpenRow] = useState<Row | null>(null)`
- `const [thread, setThread] = useState<ConversationThread | null>(null)`
- `const [loading, setLoading] = useState(false)`
- `async function openThread(row: Row)`: setOpenRow(row); setThread(null); setLoading(true); `const res = await loadAdminConversationThread(row.id)` (import from '@/lib/actions/admin-whatsapp'); on `res.ok` setThread(res.thread); else `toast.error(res.error)` (sonner) and setOpenRow(null); finally setLoading(false).

Read-only Sheet (import Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription from '@/components/ui/sheet'):
```tsx
<Sheet open={openRow !== null} onOpenChange={(o) => { if (!o) { setOpenRow(null); setThread(null) } }}>
  <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
    <SheetHeader className="border-b px-4 py-3">
      <SheetTitle>{openRow?.contact_name?.trim() || openRow?.contact_phone}</SheetTitle>
      <SheetDescription>
        {openRow?.contact_phone}
        {openRow?.company_name ? ` · ${openRow.company_name}` : ''}
      </SheetDescription>
    </SheetHeader>
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (thread?.messages.length ?? 0) === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground"><T>No messages in the last 30 days.</T></p>
      ) : (
        thread?.messages.map((m) => <MessageBubble key={m.id} m={m} />)
      )}
    </div>
    <div className="border-t px-4 py-2 text-xs text-muted-foreground">
      <T>Read-only. Shows up to the last 30 days of messages.</T>
    </div>
  </SheetContent>
</Sheet>
```
Imports: `MessageBubble` from '@/components/whatsapp/message-bubble', `Loader2` from 'lucide-react', `toast` from 'sonner', `type { ConversationThread }` from '@/lib/whatsapp/inbox-types', `T` from '@/components/i18n/t', `Card`/`Badge` from '@/components/ui/card' & '@/components/ui/badge', `useState` from 'react'. NO reply box, NO send-estimate button, NO Textarea — the panel is strictly read-only.

**(B) Refactor** `app/admin/whatsapp/page.tsx` (stays a server component, keep `export const dynamic = 'force-dynamic'`):
- Keep `await requireAdmin()`, the `requireServiceClient()` conversation query (select includes company_id; limit 500; order last_message_at desc nullsFirst:false), and the companies query.
- Build the `companyNames` Map as today, then map conversations into the serializable `Row[]`, adding `company_name: companyNames.get(row.company_id) ?? null`.
- Keep the existing header/intro `<div className="space-y-2">...</div>` (title + description + count) in page.tsx, including its `<T>` usage.
- Replace the `<Card>`/`<table>` block with `<AdminWhatsAppClient conversations={rows} />`.
- Remove now-unused imports from page.tsx (`Card`, `Badge` moved to the client component); KEEP `T` (intro block still uses it), `requireAdmin`, `requireServiceClient`. Import `AdminWhatsAppClient` from './admin-whatsapp-client'.
- Keep the outer `<div className="space-y-8">` wrapper.
  </action>
  <verify>
    <automated>npx tsc --noEmit; npx eslint app/admin/whatsapp/page.tsx app/admin/whatsapp/admin-whatsapp-client.tsx</automated>
  </verify>
  <done>page.tsx is a server component passing a serializable Row[] (with company_name merged in); admin-whatsapp-client.tsx renders the clickable table and a read-only Sheet with header (name/phone/company), loading spinner, MessageBubble thread, "No messages in the last 30 days." empty state, and a read-only/30-day note; NO reply or estimate controls; tsc + eslint clean.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no new errors across all five touched files.
- `npx eslint` clean on the five touched files (no unused imports after the extraction).
- Manual smoke (executor, optional): visit /admin/whatsapp, click a conversation row → right-side Sheet opens with the thread; audio/image bubbles render; no reply box or send-estimate button is present; visit /whatsapp and confirm the user inbox still renders bubbles and the conversation list timestamps identically.
</verification>

<success_criteria>
- Each admin conversation row is clickable (mouse + keyboard) and opens a right-side Sheet.
- The Sheet shows the full thread limited to the last 30 days via `loadAdminConversationThread`, with working signed media URLs, an empty state, and a read-only/30-day note.
- The Sheet contains NO reply box, NO send-estimate, NO mutating action.
- `MessageBubble`/`AudioMessage`/`formatTime`/`formatDuration` live in the shared module and are imported by both the user inbox and the admin client; the user-facing /whatsapp inbox is unchanged in behavior.
- Service role key remains server-side only (action behind 'use server' + requireAdmin).
</success_criteria>

<output>
After completion, create `.planning/quick/260609-mdy-tornar-conversas-clicaveis-na-pagina-wha/260609-mdy-SUMMARY.md`.
</output>
