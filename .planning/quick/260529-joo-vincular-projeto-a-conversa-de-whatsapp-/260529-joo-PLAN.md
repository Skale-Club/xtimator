---
phase: quick-260529-joo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/queries/whatsapp-inbox.ts
  - components/workspace/project-whatsapp-card.tsx
  - components/workspace/project-workspace.tsx
  - app/(app)/projects/[id]/page.tsx
  - components/whatsapp/whatsapp-inbox.tsx
autonomous: true
requirements: [QUICK-JOO-01, QUICK-JOO-02]

must_haves:
  truths:
    - "On a project's Client tab, when the linked client has a matching WhatsApp conversation, the user sees a card linking to /whatsapp?c=<conversationId> showing the contact name, last message preview, and last-activity time"
    - "When the project has no linked client, the client has no phone, or no conversation matches the client's phone, the card shows a 'no conversation yet' empty state with a button that switches to the project's Send tab to start the WhatsApp flow"
    - "Visiting /whatsapp?c=<conversationId> auto-opens that conversation in the inbox on mount"
    - "The deep-link auto-open fires only once per mount and degrades gracefully for an unknown/invalid id"
  artifacts:
    - path: "lib/queries/whatsapp-inbox.ts"
      provides: "getProjectConversationLink(projectId) server query resolving project → client phone → conversation via service client"
      contains: "getProjectConversationLink"
    - path: "components/workspace/project-whatsapp-card.tsx"
      provides: "Client component rendering the conversation-link card or empty state"
      contains: "project-whatsapp-card"
    - path: "components/whatsapp/whatsapp-inbox.tsx"
      provides: "Deep-link auto-open via useSearchParams ?c= on mount"
      contains: "useSearchParams"
  key_links:
    - from: "app/(app)/projects/[id]/page.tsx"
      to: "lib/queries/whatsapp-inbox.ts"
      via: "getProjectConversationLink(project.id) awaited in ProjectTabs"
      pattern: "getProjectConversationLink"
    - from: "components/workspace/project-whatsapp-card.tsx"
      to: "/whatsapp?c="
      via: "Link/anchor href to deep link"
      pattern: "whatsapp\\?c="
    - from: "components/whatsapp/whatsapp-inbox.tsx"
      to: "openConversation"
      via: "useEffect reading ?c= calls existing openConversation once"
      pattern: "openConversation"
---

<objective>
Vincular projeto ↔ conversa de WhatsApp do cliente no painel.

Surface, on the project detail page (Client tab), a link to the WhatsApp conversation with the project's linked client; and make the WhatsApp inbox support deep-linking to a specific conversation via `/whatsapp?c=<conversationId>`.

Purpose: Let a business owner jump straight from a project to the client's WhatsApp thread (and back), closing the loop between project work and client messaging.
Output:
- A server query that resolves a project to its client's WhatsApp conversation (by phone, no migration).
- A WhatsApp card on the project Client tab (link card OR "no conversation yet" empty state).
- Deep-link auto-open in the inbox via `?c=`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

<interfaces>
<!-- Contracts the executor needs. Extracted from codebase — use directly, no exploration needed. -->

From lib/whatsapp/conversations.ts:
```typescript
export interface WaConversationRow {
  id: string
  company_id: string
  contact_phone: string       // E.164
  contact_name: string | null
  client_id: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_inbound_at: string | null
  unread_count: number
  created_at: string
  updated_at: string
}
// Normalize a phone to E.164 with a single leading '+'.
export function toE164(phone: string): string
```

From lib/queries/whatsapp-inbox.ts (existing pattern to mirror — service-client, company-scoped):
```typescript
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { createServiceClient } from '@/lib/supabase/service'
// listConversations(): bails to [] if no companyId / no svc; .eq('company_id', companyId)
```

From lib/actions/whatsapp-inbox.ts (lines 143-152 — EXACT reverse of what we need; here a conversation
without client_id is matched to clients.phone == conversation.contact_phone, scoped by company_id):
```typescript
const { data: client } = await svc
  .from('clients')
  .select('id')
  .eq('company_id', companyId)
  .eq('phone', conversation.contact_phone)
  .maybeSingle()
```

From lib/queries/project.ts — ProjectDetail.client is `{ id; name; email: string|null; phone: string|null } | null`.
project.company_id is available on ProjectDetail.

From components/whatsapp/whatsapp-inbox.tsx:
```typescript
// 'use client'. Props: { initialConversations: WaConversationRow[] }
// State: const [selectedId, setSelectedId] = useState<string | null>(null)
// Existing async fn (line 118): async function openConversation(id: string) { ... loadConversation(id) ... }
// Currently mounts with selectedId=null and NEVER reads URL params. No useSearchParams import yet.
// /whatsapp page (app/(app)/whatsapp/page.tsx) is force-dynamic and renders <WhatsAppInbox initialConversations={...} />.
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getProjectConversationLink server query (project → client phone → conversation)</name>
  <files>lib/queries/whatsapp-inbox.ts</files>
  <action>
Add a new exported async query `getProjectConversationLink(projectId: string)` to `lib/queries/whatsapp-inbox.ts`, following the EXACT pattern of the existing `listConversations()` in the same file (resolve `getActiveCompanyId()`, bail to a null-link result if missing; `createServiceClient()`, bail if null; every query `.eq('company_id', companyId)`).

NO database migration. Resolve by phone only (locked decision 1):
1. Service-client read the project: `svc.from('projects').select('client_id').eq('id', projectId).eq('company_id', companyId).maybeSingle()`. (Service client because we already have companyId from the validated active company; keep it consistent with the rest of this module which is service-client only.)
2. If no row or `client_id` is null → return the "no conversation" result.
3. Read the client's phone: `svc.from('clients').select('phone').eq('id', clientId).eq('company_id', companyId).maybeSingle()`. If no phone (null/empty) → return "no conversation".
4. Normalize with `toE164(client.phone)` (import from `@/lib/whatsapp/conversations`), then `svc.from('whatsapp_conversations').select('id, contact_name, contact_phone, last_message_preview, last_message_at').eq('company_id', companyId).eq('contact_phone', e164Phone).maybeSingle()`.
5. If found → return the conversation summary; else → "no conversation".

Define and export a return type, e.g.:
```typescript
export interface ProjectConversationLink {
  conversationId: string | null
  contactName: string | null      // contact_name ?? contact_phone fallback resolved at render
  lastMessagePreview: string | null
  lastMessageAt: string | null
}
```
Return `{ conversationId: null, contactName: null, lastMessagePreview: null, lastMessageAt: null }` for every "no conversation" branch (missing company, no client, no phone, no match). When found, populate from the conversation row (contactName = `contact_name`; let the component fall back to phone display if desired — but since the card only needs a display name, return `contact_name ?? contact_phone`).

Match surrounding code style (no `'use server'` — this is a query module; `createServiceClient()` not `requireServiceClient()`, consistent with the rest of the file). Keep TS strict: cast Supabase rows the same way existing code does.
  </action>
  <verify>
    <automated>cd c:/Users/User/Desktop/projetos_skale/xtimator/xtimator && npx tsc --noEmit</automated>
  </verify>
  <done>getProjectConversationLink exported from lib/queries/whatsapp-inbox.ts; resolves project→client.phone→whatsapp_conversations by toE164 contact_phone scoped to company_id via service client; returns ProjectConversationLink with conversationId null on every missing branch; tsc passes.</done>
</task>

<task type="auto">
  <name>Task 2: Project WhatsApp card on Client tab (link or empty state) + wire data</name>
  <files>components/workspace/project-whatsapp-card.tsx, components/workspace/project-workspace.tsx, app/(app)/projects/[id]/page.tsx</files>
  <action>
Create `components/workspace/project-whatsapp-card.tsx` (`'use client'`) — a presentational card. Props:
```typescript
{ conversationLink: ProjectConversationLink; onStartFlow: () => void }
```
(import the `ProjectConversationLink` type from `@/lib/queries/whatsapp-inbox`).

Rendering (reuse existing primitives: `Card`/`CardContent` from `@/components/ui/card`, `Button`, lucide `MessageCircle`; match the visual style of `client-tab.tsx`):
- If `conversationLink.conversationId` is set: render a card with the WhatsApp icon, the contact display name (`contactName`), `lastMessagePreview` (truncated, muted) and a relative/short time from `lastMessageAt`, and a primary link/button to `/whatsapp?c=<conversationId>` (use Next `Link` or `<a href>`; label e.g. "Abrir conversa no WhatsApp"). The link must contain the literal `whatsapp?c=` substring.
- Else (no conversation): render the empty state — text "Nenhuma conversa ainda — envie o estimate pelo WhatsApp para iniciar" and a Button labelled e.g. "Enviar pelo WhatsApp" that calls `onStartFlow()`. Do NOT create a conversation (locked decision 2).

Wire the data through the existing SSR chain (do NOT touch estimate-generation/send flows):
- In `app/(app)/projects/[id]/page.tsx`: import `getProjectConversationLink` from `@/lib/queries/whatsapp-inbox`. Inside `ProjectTabs` (already an async server component), add `getProjectConversationLink(project.id)` to the existing logic — simplest: `const conversationLink = await getProjectConversationLink(project.id)` near the other awaits (it self-resolves company via getActiveCompanyId, so no supabase arg needed). Pass `conversationLink={conversationLink}` into `<ProjectWorkspace .../>`.
- In `components/workspace/project-workspace.tsx`: add `conversationLink: ProjectConversationLink` to `ProjectWorkspaceProps` (import the type), destructure it, and render `<ProjectWhatsAppCard>` inside the `activeTab === 'client'` branch — place it directly above or below `<ClientTab project={project} />` within the same content container. Provide the `onStartFlow` callback that switches the active tab to `'send'` by calling the existing `handleSelect('send')` so the user lands on the project's WhatsApp Send flow on the same page.

Keep everything TS strict. Reuse `WhatsAppInbox`'s `formatTime`-style formatting inline or a tiny local helper — do not import client-only inbox internals.
  </action>
  <verify>
    <automated>cd c:/Users/User/Desktop/projetos_skale/xtimator/xtimator && npx tsc --noEmit</automated>
  </verify>
  <done>ProjectWhatsAppCard renders a /whatsapp?c=<id> link card when a conversation exists and the locked empty-state message + "send via WhatsApp" button (switching to the Send tab) otherwise; conversationLink flows page.tsx → ProjectWorkspace → card on the Client tab; estimate flows untouched; tsc passes.</done>
</task>

<task type="auto">
  <name>Task 3: Deep-link auto-open in WhatsApp inbox via ?c=</name>
  <files>components/whatsapp/whatsapp-inbox.tsx</files>
  <action>
Make the inbox auto-open the conversation named in `/whatsapp?c=<conversationId>` on mount (locked decision 3).

In `components/whatsapp/whatsapp-inbox.tsx`:
- Add `useSearchParams` to the existing `next/navigation` usage (add `import { useSearchParams } from 'next/navigation'`). Note: the `/whatsapp` page is `force-dynamic`, so a Suspense boundary is not required for static generation; do not add one unless tsc/build complains.
- Add a guard ref so auto-open fires only ONCE per mount: `const didDeepLink = useRef(false)`.
- Add a `useEffect` that runs after mount: read `const cid = searchParams.get('c')`. If `cid` and `!didDeepLink.current` and `selectedId !== cid`, set `didDeepLink.current = true` and call the existing `openConversation(cid)`. Do NOT gate on the conversation being present in `initialConversations` — `openConversation` already calls `loadConversation`, which returns `{ ok:false, error }` for an unknown/unowned id and the existing `toast.error(res.error)` path handles it gracefully (simpler + robust, per the locked decision's "let the existing not-found toast handle invalid ids" option).
- Include `searchParams` (and `openConversation`/`selectedId` as needed) in the dependency array; the `didDeepLink` ref ensures it only fires once even if deps change. Keep `openConversation` referentially stable enough that this does not loop — since the ref guard short-circuits after the first run, an exhaustive-deps array is safe.

Do not change `openConversation`, `loadConversation`, send/reply, or send-estimate logic. This is additive.
  </action>
  <verify>
    <automated>cd c:/Users/User/Desktop/projetos_skale/xtimator/xtimator && npx tsc --noEmit</automated>
  </verify>
  <done>Inbox imports useSearchParams; a once-guarded useEffect reads ?c= and calls openConversation(cid) on mount; invalid ids fall through to the existing not-found toast; no changes to existing send/reply/load logic; tsc passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → /projects/[id] (SSR) | Authenticated user requests a project page; project ownership is RLS-enforced on `projects` via createClient, and getActiveCompanyId() scopes the new service-client query. |
| browser → /whatsapp?c=<id> | User-supplied conversationId from the URL flows into openConversation → loadConversation server action. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-joo-01 | Information Disclosure | getProjectConversationLink (service client bypasses RLS) | mitigate | Every query in the new function is `.eq('company_id', companyId)` where companyId comes from getActiveCompanyId() (validated active company); the project is also re-scoped by company_id so a cross-tenant projectId resolves to no row → null link. |
| T-joo-02 | Information Disclosure | Deep-link ?c=<conversationId> → loadConversation | accept | loadConversation already fetches the conversation `.eq('company_id', companyId)` and returns "Conversation not found" for any id not owned by the active company; no new surface. A user guessing another tenant's conversationId gets a not-found toast, no data. |
| T-joo-03 | Tampering | ?c= URL param | mitigate | Param is passed only to the existing server action which validates ownership; no client-side trust placed in the id beyond triggering a scoped lookup. |
</threat_model>

<verification>
- `npx tsc --noEmit` clean across all three tasks.
- Manual (optional): open a project whose linked client has a matching `whatsapp_conversations.contact_phone` → Client tab shows the link card → clicking opens `/whatsapp?c=<id>` with that thread selected.
- Manual (optional): open a project with no client / no matching conversation → Client tab shows the "Nenhuma conversa ainda…" empty state with a button that switches to the Send tab.
- Manual (optional): visit `/whatsapp?c=<invalid-uuid>` → inbox shows the existing "Conversation not found" toast, no crash.
</verification>

<success_criteria>
- getProjectConversationLink resolves project → client.phone → conversation by E.164 contact_phone, company-scoped, service-client, NO migration.
- Project Client tab shows the conversation-link card OR the locked empty-state message + Send-tab button.
- /whatsapp?c=<id> auto-opens the conversation once on mount and degrades gracefully on invalid ids.
- No changes to estimate generation or estimate send flows. TS strict maintained. whatsapp_* tables accessed via service client only.
</success_criteria>

<output>
After completion, create `.planning/quick/260529-joo-vincular-projeto-a-conversa-de-whatsapp-/260529-joo-SUMMARY.md`
</output>
