# Phase 125: Chat UI (useChat + sidebar + multimodal + estimate card) - Research

**Researched:** 2026-06-24
**Domain:** Vercel AI SDK v6 React UI (`@ai-sdk/react` `useChat`) on Next.js 16 App Router + Supabase + existing shadcn/Tailwind design system
**Confidence:** HIGH (AI SDK API verified against ai-sdk.dev v6 docs + npm registry; codebase patterns read directly)

## Summary

Phase 125 builds the **UI shell only** over the already-complete Phase-124 `/api/chat` streaming backend. The backend streams a `toUIMessageStreamResponse` (v6 UIMessage stream), exposes 8 tools (`createEstimate` returns `{jobId, status:'queued'}`; the 7 read tools return strings/objects), and persists the tail in `onFinish`. The Phase-123 read helpers (`listConversations` / `getConversationWithMessages`) supply history. Nothing in this phase touches domain logic, the backend route, or the LangGraph engine.

The single load-bearing technical fact: **`useChat` moved to `@ai-sdk/react` and its v6 contract changed substantially.** v6 `useChat` **no longer manages input state** — you own a `useState` for the textarea and call `sendMessage({ text })`. Messages are `UIMessage[]` with a typed **`parts`** array (`{type:'text'}` + `{type:'tool-<name>', state, input, output}`). The endpoint/extra-body wiring goes through a **`DefaultChatTransport`** (imported from `ai`, not `@ai-sdk/react`). History seeds via the `messages` init option. The estimate card polls the EXISTING `/api/jobs/[jobId]` proxy (via the existing `pollJob`/`useJobStatus`) on the `{jobId}` a `createEstimate` tool-output part carries, then links to the existing editor route `/projects/[id]?tab=estimate&estimate=<id>`.

**Primary recommendation:** Install `@ai-sdk/react@6.0.209` (lockstep with `ai@6.0.209`). Build a single client page `app/(app)/chat/[[...id]]/page.tsx` (optional-catch-all) with a server wrapper that loads `listConversations` + (when an id is present) `getConversationWithMessages`, mirroring the WhatsApp inbox two-pane layout. Render `message.parts` with a `switch` on `part.type`/`part.state`. Multimodal: upload audio/photo client-side → call a thin server action wrapping `normalizeInput` → inject the returned transcript/analysis text into `sendMessage({ text })`. Estimate card: detect the `tool-createEstimate` `output-available` part, poll `useJobStatus(jobId)`, render an inline Card linking to the editor.

---

## User Constraints (from SEED-034 + REQUIREMENTS.md v4.9 — no CONTEXT.md present)

> No `125-CONTEXT.md` exists for this phase. The constraints below are the locked decisions carried from SEED-034 and the milestone requirements; the planner MUST honor them with the same authority as a CONTEXT.md.

### Locked Decisions
- **UI ONLY.** v1 ships: useChat streaming surface + per-tool-call progress (CHATUI-01), conversation sidebar new/switch + history load (CHATUI-02), multimodal input text+audio+photo (CHATUI-03), inline estimate card with "open in editor" (CHATUI-04). The backend (124) is DONE — do not modify `app/api/chat/route.ts`, the tools, or the engine.
- **Adopt the Vercel AI Chatbot UX patterns** (useChat, message-parts, tool-call rendering, conversation persistence) but **port them onto our shadcn/Tailwind design system** — do NOT import the Vercel template theme/components raw, do NOT add Auth.js/Drizzle/Neon/Blob.
- **The chat reimplements NO domain logic.** Multimodal MUST route through the extracted neutral `lib/agent-tools/normalize-input` (`normalizeInput`). Estimate generation is the `createEstimate` tool the backend already exposes — the UI never calls the engine directly.
- **Owner-only, authenticated, tenant-scoped.** The page lives under the authenticated app shell `app/(app)/`. Never customer-facing.
- **i18n** every owner-facing string via the existing `useTranslation()` `t(...)` (English source; pt/es resolved at runtime).
- **No secrets** in code/comments/docs (gitleaks pre-commit). No new secret is needed for this phase.

### Claude's Discretion
- Route shape: single page with sidebar vs `chat/page.tsx` + `chat/[id]/page.tsx`. (Recommendation below: optional-catch-all `chat/[[...id]]` with a server wrapper, mirroring WhatsApp inbox.)
- Exact tool-progress copy and which tools get a labeled chip vs a generic "working…" indicator.
- Whether the multimodal normalize runs in a server action vs an API route (recommendation: server action — simpler, owner-scoped).
- Card visual treatment, scroll/auto-scroll behavior, mobile two-pane collapse.

### Deferred Ideas (OUT OF SCOPE)
- The entitlement/tier gate (CHATMETER-02) — that is Phase 126.
- Estimate edit-in-chat and send-in-chat (CHATX-01/02) — owner opens the result in the existing editor only.
- Live streaming of the generation's intermediate reasoning (LangChainAdapter, CHATX-03).
- MCP parity (SEED-030).

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHATUI-01 | `useChat`-backed streaming surface rendering assistant tokens + each tool-call's progress | `@ai-sdk/react` `useChat` + `DefaultChatTransport` (Standard Stack); `message.parts` switch rendering text + `tool-<name>` states (Pattern 2); progress chip per tool-state (Pattern 5) |
| CHATUI-02 | Conversation sidebar: list prior, new/switch, load selected history | Phase-123 `listConversations`/`getConversationWithMessages` already exist; route shape (Pattern 3) mirroring `components/whatsapp/whatsapp-inbox.tsx`; seed `useChat({ messages })` from history (Pattern 4) |
| CHATUI-03 | Multimodal input (text+audio+photo) routed through extracted `normalize` | `normalizeInput` neutral fn (Pattern 6); reuse the capture audio/photo client primitives from `components/capture/capture-recorder.tsx`; server action → text → `sendMessage({text})` |
| CHATUI-04 | Inline estimate card on generation completion with "open in editor" action | `tool-createEstimate` `output-available` part carries `{jobId}`; poll existing `/api/jobs/[jobId]` via `useJobStatus`/`pollJob`; link to `/projects/[id]?tab=estimate&estimate=<id>` (Pattern 7) |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@ai-sdk/react` | **6.0.209** | The `useChat` hook + UIMessage stream consumption | The v6 home of `useChat` (moved out of `ai`). Must lockstep with the installed `ai@6.0.209` (verified: `@ai-sdk/react@6.0.209` declares `dependencies.ai: "6.0.209"`). |
| `ai` | 6.0.209 (already installed) | `DefaultChatTransport`, `UIMessage` type, `toUIMessageStreamResponse` (backend, done) | Already a dependency; the transport + UIMessage types live here, NOT in `@ai-sdk/react`. |

**Do NOT install `@ai-sdk/react@3.0.211`.** The npm `latest` dist-tag points at a parallel `3.x` line whose `dependencies.ai` is also `6.0.209`, but to avoid version-skew confusion and guarantee the `UIMessage`/transport types match the installed `ai@6.0.209` exactly, pin `@ai-sdk/react@6.0.209` explicitly. (Verified via `npm view @ai-sdk/react@6.0.209` and `@3.0.211` — both depend on `ai@6.0.209`; pinning the matching `6.0.209` is the unambiguous choice.)

### Supporting (already installed — REUSE, do not add)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui (`components/ui/*`) | local | Button, Card, ScrollArea, Textarea, Skeleton, Badge, Separator, Tooltip, Sheet | All chat chrome. `Card` for the estimate card; `ScrollArea` for the message list; `Textarea` for the composer. |
| `react-markdown` + `remark-gfm` | ^10 / ^4 | Render assistant text parts as markdown | Assistant tokens are markdown; the project already uses these (e.g. knowledge answers). |
| `lucide-react` | ^1.8 | Icons (Send, Plus, MessageCircle, Loader2, Sparkles, FileText, Camera, Mic) | Matches the rest of the app shell. |
| `sonner` (`toast`) | ^2 | Error toasts (normalize failure, send failure) | Project-standard toaster (already mounted in the app shell). |
| `framer-motion` | ^12 | Optional message/chip entrance animation | Discretionary; keep minimal. |
| `hooks/use-job-status.ts` (`useJobStatus`, `pollJob`) | local | Poll `/api/jobs/[jobId]` for the estimate card | EXISTING — the capture flow already uses it; CHATUI-04 reuses it verbatim. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@ai-sdk/react` `useChat` | Hand-rolled `fetch` + ReadableStream parser | Would re-implement the v6 UIMessage stream protocol the backend already speaks via `toUIMessageStreamResponse` — pure waste; this is exactly what the SDK gives free. |
| Optional-catch-all `chat/[[...id]]` route | Separate `chat/page.tsx` + `chat/[id]/page.tsx` | Two routes mean duplicating the sidebar shell + a full RSC navigation per switch. A single route + client state for the active conversation (WhatsApp-inbox pattern) is lighter and matches the existing inbox. Either is acceptable; the single-route variant is recommended. |
| AI SDK file attachments (`sendMessage({files})`) | Upload → normalize → inject text | The backend route + tools consume **text** (the neutral `normalize` produces transcript/analysis text; the model then calls tools on text). The backend does NOT process raw file parts. So for v1, normalize-to-text is the correct, simple path. (See Pitfall 4.) |

**Installation:**
```bash
npm install @ai-sdk/react@6.0.209
```
**Version verification (run during planning):**
```bash
npm view @ai-sdk/react@6.0.209 version dependencies   # → ai: 6.0.209, @ai-sdk/provider-utils: 4.0.30
```
Verified 2026-06-24: `@ai-sdk/react@6.0.209` exists, `dependencies.ai === "6.0.209"`, peer `react: "^18 || ~19.0.1 || ~19.1.2 || ^19.2.1"` (project runs React 19.2.4 ✓).

---

## Architecture Patterns

### Recommended Project Structure
```
app/(app)/chat/
└── [[...id]]/
    └── page.tsx              # RSC: auth (inherited from (app) layout) → listConversations(userId)
                             #      + (id present) getConversationWithMessages(id, userId) → <ChatWorkspace/>
components/chat/
├── chat-workspace.tsx        # 'use client' — top-level: holds sidebar + active conversation; useChat lives here or in chat-thread
├── chat-sidebar.tsx          # conversation list + "New chat" (CHATUI-02)
├── chat-thread.tsx           # the useChat surface: message list + composer (CHATUI-01)
├── chat-message.tsx          # renders one UIMessage by switching over message.parts
├── chat-tool-part.tsx        # per-tool-call progress chip / result (CHATUI-01)
├── estimate-card.tsx         # inline card polling the job + "Open in editor" (CHATUI-04)
└── chat-composer.tsx         # textarea + audio/photo buttons (CHATUI-03)
lib/actions/chat.ts           # 'use server' — normalizeChatInput(...) wrapping normalizeInput (CHATUI-03)
```
Add a `{ label: 'Chat', href: '/chat', icon: MessageSquare }` entry to `components/app-shell/nav-items.ts` (and it auto-appears in `sidebar.tsx` + `bottom-nav.tsx`).

### Pattern 1: `@ai-sdk/react` `useChat` — the v6 contract (input is NOT managed)
**What:** v6 `useChat` returns `{ id, messages, status, error, sendMessage, regenerate, stop, clearError, setMessages, addToolResult, ... }`. It **does NOT** return `input`/`handleInputChange`/`handleSubmit`. You own the composer state.
**When:** The single client hook driving the thread.
```tsx
// Source: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat (v6) — VERIFIED 2026-06-24
'use client'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'          // transport lives in `ai`, not @ai-sdk/react
import { useState } from 'react'
import type { UIMessage } from 'ai'

function ChatThread({ conversationId, initialMessages }: {
  conversationId?: string
  initialMessages: UIMessage[]
}) {
  const [input, setInput] = useState('')             // v6: you manage input yourself
  const { messages, sendMessage, status, stop, error } = useChat({
    id: conversationId,                              // stable id keeps the hook state per conversation
    messages: initialMessages,                       // seed persisted history (Pattern 4)
    transport: new DefaultChatTransport({
      api: '/api/chat',
      // CRITICAL: the Phase-124 route reads `messages` (full array) + `conversationId`
      // from req.json(). Send the full messages array (the default) + the extra field.
      body: { conversationId },
    }),
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    sendMessage({ text: input })                     // v6 send shape
    setInput('')
  }
  // status ∈ 'submitted' | 'streaming' | 'ready' | 'error'; disable composer while not 'ready'
}
```

### Pattern 2: Rendering `message.parts` (CHATUI-01)
**What:** Each `UIMessage` has `role` and a typed `parts[]`. Render by switching on `part.type`.
**Part shapes (VERIFIED):**
- Text: `{ type: 'text', text: string }`
- Tool (per-tool typed): `{ type: 'tool-<toolName>', state, input?, output?, errorText?, toolCallId }`
  - `state` ∈ `'input-streaming' | 'input-available' | 'output-available' | 'output-error'`
  - fields by state: `input-streaming`/`input-available` → `input` (+`toolCallId`,`toolName`); `output-available` → `output` (+`input`); `output-error` → `errorText`
- Dynamic tool (fallback): `{ type: 'dynamic-tool', toolName, state, input, output }`
```tsx
// Source: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage (v6) — VERIFIED 2026-06-24
{message.parts.map((part, i) => {
  if (part.type === 'text') return <Markdown key={i}>{part.text}</Markdown>
  if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
    return <ChatToolPart key={i} part={part} />   // chip while input-*, result/card when output-*
  }
  return null
})}
```
The 8 tool types are: `tool-createEstimate`, `tool-askKnowledge`, `tool-findClientByName`, `tool-getLatestEstimateForClient`, `tool-getProjectStatus`, `tool-findServiceByName`, `tool-listRecentEstimates`, `tool-listServices`.

### Pattern 3: Route + sidebar shape (CHATUI-02)
**What:** A single optional-catch-all route renders the whole workspace; the active conversation is client state (no full RSC navigation per switch). Mirror `components/whatsapp/whatsapp-inbox.tsx` (two-pane: list `aside` + thread `section`, mobile collapses to one pane).
```tsx
// app/(app)/chat/[[...id]]/page.tsx — RSC. Auth is enforced by the (app) layout already.
export const dynamic = 'force-dynamic'   // conversations change as messages arrive (mirror whatsapp/page.tsx)
export default async function ChatPage({ params }: { params: Promise<{ id?: string[] }> }) {
  const { id } = await params
  const conversationId = id?.[0]
  const { sub: userId } = /* getAuthClaims() */ ...
  const conversations = await listConversations(userId)
  const thread = conversationId
    ? await getConversationWithMessages(conversationId, userId)
    : null
  return <ChatWorkspace conversations={conversations} activeId={conversationId} thread={thread} />
}
```
- **New chat:** the sidebar "New chat" button clears the active conversation (no id) → `useChat` starts empty. The backend `onFinish` calls `createConversation(userId)` when no `conversationId` is sent (route lines 105–109), so the first turn creates the row server-side. The UI then needs the new id — see Open Question 1 for how to surface it.
- **Switch:** select a conversation → either `router.push('/chat/<id>')` (RSC reload with history) OR client-side fetch of the thread + reseed `useChat`. Use a distinct `key`/`id` per conversation so `useChat` resets its message state.

### Pattern 4: Seeding history into `useChat` (CHATUI-02)
**What:** Persisted `chat_messages.parts` (jsonb) → `UIMessage[]` → `useChat({ messages })`.
```tsx
// The Phase-123 ChatMessageRow has { role, parts } where parts is the stored UIMessage.parts jsonb.
const initialMessages: UIMessage[] = thread.messages.map((m) => ({
  id: m.id,
  role: m.role as 'user' | 'assistant',           // 'tool'/'system' rows: see Open Question 2
  parts: m.parts as UIMessage['parts'],
}))
```
`getConversationWithMessages` returns messages oldest-first (correct order for seeding). The backend persisted each tail message with `{ role, parts }` (route lines 114–119), so the stored shape round-trips into `useChat` directly.

### Pattern 5: Per-tool-call progress chip (CHATUI-01)
**What:** While a tool part is `input-streaming`/`input-available` (and before `output-available`), render a labeled "working…" chip; on `output-available` render the result (or, for `createEstimate`, the estimate card).
```tsx
const TOOL_LABEL: Record<string, string> = {
  'tool-createEstimate': 'Generating estimate…',
  'tool-askKnowledge': 'Looking up the answer…',
  'tool-getLatestEstimateForClient': "Finding the client's last quote…",
  // … i18n each via t(...)
}
function ChatToolPart({ part }: { part: ToolUIPart }) {
  if (part.state === 'input-streaming' || part.state === 'input-available')
    return <ProgressChip label={t(TOOL_LABEL[part.type] ?? 'Working…')} />
  if (part.state === 'output-error') return <ErrorChip text={part.errorText} />
  // output-available:
  if (part.type === 'tool-createEstimate') return <EstimateCard jobId={(part.output as {jobId:string}).jobId} />
  return <ToolResult output={part.output} />       // the 7 read tools → render their string/object
}
```

### Pattern 6: Multimodal via the neutral `normalize` (CHATUI-03)
**What:** Audio/photo → text, then the text becomes a normal `sendMessage({text})`. Reuse the capture client primitives (MediaRecorder for audio, file input + `compressImage` for photos) from `components/capture/capture-recorder.tsx`, but instead of the estimate pipeline, call a thin server action that wraps `normalizeInput`.
```ts
// lib/actions/chat.ts  — 'use server'
import { normalizeInput } from '@/lib/agent-tools'   // neutral barrel
export async function normalizeChatInput(input:
  | { kind: 'audio'; /* base64 or uploaded ref */ }
  | { kind: 'photo'; base64: string; mimeType: string; caption?: string }
): Promise<{ ok: boolean; text: string; reason?: string }> {
  // auth + active company gate (reuse getAuthClaims + getActiveCompanyId)
  const r = await normalizeInput(/* mapped NormalizeInput */)
  return { ok: r.ok, text: r.text, reason: r.reason }
}
```
`NormalizeInput` shape (from `lib/agent-tools/normalize-input.ts`): `{kind:'audio', blob:Blob, ext:string}` | `{kind:'photo', base64, mimeType, caption?}` | `{kind:'text', body}`. **Keep v1 simple:** the UI records/uploads → gets `{text}` back → calls `sendMessage({ text })` (optionally prefixed with a caption). Do NOT attempt to stream raw audio/photo parts to the model — the backend route consumes UIMessages whose content the model reads as text and acts on via tools.

> Note: server actions receive a `Blob`/`File` fine, but for audio the cleanest is to send the recorded blob (or its base64) to the action and construct the `NormalizeInput`. `normalizeInput` itself calls `ingestMultimodal` (Whisper transcription / vision analysis) which already debits credits per v4.7 — so CHATUI-03 inherits CHATMETER-01 by reuse, no new debit code (consistent with the backend's no-double-debit invariant).

### Pattern 7: Inline estimate card + polling (CHATUI-04)
**What:** The `tool-createEstimate` `output-available` part carries `{ jobId, status:'queued' }`. Render a Card that polls `/api/jobs/[jobId]` via the EXISTING `useJobStatus(jobId)` hook, then (on completed) reads the current estimate and links to the editor.
```tsx
function EstimateCard({ jobId }: { jobId: string }) {
  const job = useJobStatus(jobId)   // existing hook: idle|processing|completed|failed|config_unavailable|not_found
  // while processing → spinner card; failed/config_unavailable/not_found → error card
  // completed → resolve the estimate id, then:
  //   <Button asChild><Link href={`/projects/${projectId}?tab=estimate&estimate=${estimateId}`}>Open in editor</Link></Button>
}
```
**Resolving projectId/estimateId:** the `createEstimate` tool input carries `projectId` (it's an LLM field). The capture flow resolves the produced estimate by querying `estimates` where `project_id = projectId AND is_current = true` after the job completes (capture-recorder lines 686–692) — mirror that read in a small server action or client Supabase read (the editor route needs both `projectId` and `estimateId`). The editor route is the verified existing target: `/projects/[id]?tab=estimate&estimate=<estimateId>` (`app/(app)/projects/[id]/page.tsx` reads `searchParams.tab` + `searchParams.estimate`).

### Anti-Patterns to Avoid
- **Using `input`/`handleSubmit`/`handleInputChange` from `useChat`.** Removed in v6. You manage input state and call `sendMessage({text})`. Any tutorial showing `handleInputChange` is pre-v6 — do not copy it.
- **Importing `DefaultChatTransport` from `@ai-sdk/react`.** It is exported from `ai`. (`useChat` from `@ai-sdk/react`; `DefaultChatTransport`/`UIMessage` from `ai`.)
- **Using `prepareSendMessagesRequest` to send only the last message.** The docs show that as an optimization, but the Phase-124 route reads the **full `messages` array** from the body and runs `convertToModelMessages(messages)`. Sending only the last message would break the route. Use the plain `body: { conversationId }` option and let the transport send the full array. (If you later want last-message-only, the backend would also need changing — out of scope.)
- **Forking the Vercel template's `<Chat>`/theme components.** Build thin components over `components/ui/*`. Do not pull in the template's CSS/tokens.
- **Modifying `app/api/chat/route.ts` or the tools.** Backend is frozen for this phase.
- **Calling the LangGraph engine / `createEstimate` neutral fn directly from the UI.** Generation happens only through the model's tool call.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming token + tool-call parsing | A custom SSE/ReadableStream reader | `useChat` (`@ai-sdk/react`) | The backend speaks the v6 UIMessage stream protocol; `useChat` decodes it including tool-call parts/states. |
| Job status polling | A new poll loop for the estimate card | `useJobStatus` / `pollJob` (`hooks/use-job-status.ts`) | Already implements the discriminated `/api/jobs/[jobId]` contract (never-throw, 1.5s interval). |
| Conversation history reads | New queries | `listConversations` / `getConversationWithMessages` (`lib/queries/chat.ts`) | Phase-123 tenant+owner-scoped helpers exist and are tested. |
| Audio capture / photo compress | New MediaRecorder + compressor | The primitives in `components/capture/capture-recorder.tsx` (`getSupportedAudioMimeType`, `compressImage`, MediaRecorder flow) | Battle-tested for iOS Safari / Android Chrome (the project's mobile constraint). Extract/reuse, don't rewrite. |
| Multimodal → text | New transcription/vision call | `normalizeInput` (`lib/agent-tools`) | The locked neutral path; also debits credits correctly via `ingestMultimodal`. |
| Markdown rendering | Custom parser | `react-markdown` + `remark-gfm` | Already a dependency and used elsewhere. |
| Conversation list ordering | Client sort | Already `updated_at DESC` from `listConversations` + `appendMessage` bumps `updated_at` | Server-side ordering is correct; just render it. |

**Key insight:** This phase is almost entirely *wiring existing, tested pieces* (Phase-124 stream, Phase-123 history, the capture primitives, `useJobStatus`, `normalizeInput`) into a shadcn shell. The only genuinely new third-party surface is `@ai-sdk/react`'s `useChat` — get its v6 contract right and the rest is composition.

---

## Common Pitfalls

### Pitfall 1: Copying pre-v6 `useChat` examples (input management)
**What goes wrong:** Code uses `const { input, handleInputChange, handleSubmit } = useChat()` → those are `undefined` in v6 → composer doesn't work.
**Why:** v6 removed internal input state.
**How to avoid:** Own a `useState` for the textarea; submit via `sendMessage({ text })`. Drive disabled state off `status !== 'ready'`.
**Warning signs:** `handleSubmit is not a function`; input never updates.

### Pitfall 2: `DefaultChatTransport` import + body wiring
**What goes wrong:** Import from the wrong package, or pass `api`/`body` directly to `useChat` (older API) so `conversationId` never reaches the route.
**Why:** v6 routes endpoint/body config through the transport object; `DefaultChatTransport` is in `ai`.
**How to avoid:** `transport: new DefaultChatTransport({ api: '/api/chat', body: { conversationId } })`. Confirm in the Network tab that the POST body contains `conversationId` + the full `messages` array.
**Warning signs:** Backend `conversationId` is always undefined → every turn creates a NEW conversation (route line 106).

### Pitfall 3: Sending only the last message breaks the route
**What goes wrong:** Following the "minimize data" docs pattern (`prepareSendMessagesRequest` returning `messages[messages.length-1]`) sends one message; the route does `convertToModelMessages(messages)` on what it expects to be the full array → broken context / errors.
**Why:** The Phase-124 route was built to receive the full array (`originalMessages: messages` round-trips it).
**How to avoid:** Use the default transport behavior (sends full array) + the simple `body` option. Do not add `prepareSendMessagesRequest` unless the backend is changed (out of scope).

### Pitfall 4: Trying to attach raw audio/photo as message files
**What goes wrong:** `sendMessage({ files })` sends file parts the backend tools don't consume → the model can't act, or the route errors.
**Why:** The neutral tools operate on text; the locked decision is normalize-to-text.
**How to avoid:** Upload/record → `normalizeChatInput` server action → inject the returned `text` into `sendMessage({ text })`.
**Warning signs:** Photos/audio appear in the message but no transcript/analysis drives the model.

### Pitfall 5: New conversation id not surfaced to the URL/sidebar
**What goes wrong:** First turn of a new chat creates the conversation server-side in `onFinish`, but the client never learns the new id → refresh shows the thread but the sidebar/URL were stale; a second turn (still no id sent) creates ANOTHER conversation.
**Why:** The route only returns the stream, not the new `conversationId`; `onFinish` is server-side.
**How to avoid:** See Open Question 1 — recommended fix: pre-create the conversation client-side (a `createConversation` server action) before the first `sendMessage`, pass that id in `body`, and `router.replace('/chat/<id>')`. This keeps every turn on one conversation and gives the sidebar the row immediately.
**Warning signs:** Duplicate conversations after multi-turn new chats.

### Pitfall 6: i18n + RSC/client boundary
**What goes wrong:** Using `t()` in the RSC page (it's a `'use client'` hook) → error.
**Why:** `useTranslation` is client-only.
**How to avoid:** Keep `t()` in the client components (`chat-*`); the RSC page only loads data.

### Pitfall 7: Mobile audio capture gesture (iOS Safari)
**What goes wrong:** Creating `AudioContext` / `getUserMedia` outside a user gesture fails silently on iOS.
**Why:** iOS requires the audio context to start inside a click handler (documented in the capture flow, Pitfall 1 there).
**How to avoid:** Reuse the capture-recorder's gesture-bound start logic; don't initialize audio on mount.

---

## Code Examples

### Composer (CHATUI-03) — text + audio + photo
```tsx
// Source: composition of @ai-sdk/react v6 + capture-recorder primitives
'use client'
function ChatComposer({ onSend, busy }: { onSend: (text: string) => void; busy: boolean }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  // audio: reuse MediaRecorder flow → blob → normalizeChatInput({kind:'audio',...}) → onSend(text)
  // photo: file input → compressImage → base64 → normalizeChatInput({kind:'photo',...}) → onSend(text or caption+text)
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onSend(text); setText('') } }}
          className="flex items-end gap-2 border-t p-3">
      <button type="button" aria-label={t('Add photo')}>{/* Camera */}</button>
      <button type="button" aria-label={t('Record audio')}>{/* Mic */}</button>
      <Textarea value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); /* submit */ } }}
        placeholder={t('Ask anything, or describe a job…')} disabled={busy}
        className="max-h-32 min-h-[40px] flex-1 resize-none" />
      <Button type="submit" size="icon" disabled={busy || !text.trim()}>{/* Send */}</Button>
    </form>
  )
}
```

### Estimate card (CHATUI-04)
```tsx
// Uses the EXISTING useJobStatus hook + the verified editor route.
function EstimateCard({ jobId, projectId }: { jobId: string; projectId: string }) {
  const job = useJobStatus(jobId)
  const [estimateId, setEstimateId] = useState<string | null>(null)
  useEffect(() => {
    if (job.state !== 'completed') return
    // mirror capture-recorder: read estimates where project_id = projectId AND is_current
    void resolveCurrentEstimateId(projectId).then(setEstimateId)
  }, [job.state, projectId])
  return (
    <Card className="my-2">
      {job.state === 'processing' && <CardContent>{/* spinner + "Generating estimate…" */}</CardContent>}
      {(job.state === 'failed' || job.state === 'config_unavailable' || job.state === 'not_found') &&
        <CardContent>{/* friendly error */}</CardContent>}
      {job.state === 'completed' && estimateId && (
        <CardFooter>
          <Button asChild>
            <Link href={`/projects/${projectId}?tab=estimate&estimate=${estimateId}`}>{t('Open in editor')}</Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useChat` exported from `ai`; manages `input`/`handleSubmit`/`handleInputChange` | `useChat` in `@ai-sdk/react`; **no input management**, `sendMessage({text})` | AI SDK v4→v5→v6 | Most online examples are stale; follow the v6 reference only. |
| `messages[].content` string + `experimental_*` tool fields | `messages[].parts[]` typed array incl. `tool-<name>` parts with `state` | v5+ | Render by iterating `parts`, switching on `type`/`state`. |
| `api`/`body` passed directly to `useChat` | `transport: new DefaultChatTransport({ api, body })` | v5+ | Endpoint + extra body via the transport object. |
| `tool({ parameters })` | `tool({ inputSchema })` (backend, already done) | v6 | Confirms the codebase is on true v6 (124 used `inputSchema`). |

**Deprecated/outdated:**
- `experimental_attachments` / `handleSubmit({experimental_attachments})` — superseded by `sendMessage({ files })` (which we still avoid for v1 in favor of normalize-to-text).

---

## Open Questions

1. **Surfacing the new conversation id on first turn.**
   - What we know: the route creates the conversation in `onFinish` when no id is sent, but does not return it to the client. The Phase-123 `createConversation(userId)` server helper exists.
   - What's unclear: cleanest way to get the id to the client without changing the route.
   - Recommendation: **pre-create** — a `createChatConversation()` server action (wrapping `createConversation`) called when the user starts a new chat (or on first submit), pass the id in `transport.body.conversationId`, and `router.replace('/chat/<id>')`. This avoids the duplicate-conversation pitfall and the stale sidebar. (Backend stays untouched: it just uses the supplied id.) Confirm during planning whether to create on "New chat" click vs lazily on first send.

2. **Persisted `tool`/`system` rows when seeding `useChat`.**
   - What we know: `appendMessage` can persist `role: 'tool'|'system'`; `useChat`'s `UIMessage.role` is `'system'|'user'|'assistant'`. The backend persists the assistant/tool **tail** as returned by `toUIMessageStreamResponse`'s `onFinish` (where tool calls are parts of the assistant message, not separate `tool` rows).
   - What's unclear: whether any standalone `tool`-role rows ever land in `chat_messages` (the route loop appends each tail message with its `role`).
   - Recommendation: when seeding, map only `user`/`assistant` rows into `initialMessages`; treat the assistant message's `parts` (which already include tool parts) as the source of truth. Verify the persisted shape with one real round-trip during planning (read a `chat_messages` row after a tool turn).

3. **Auto-scroll + streaming UX.**
   - What we know: WhatsApp inbox uses a `messagesEndRef.scrollIntoView`. Streaming updates `messages` frequently.
   - Recommendation: scroll-to-bottom on new message + on `status==='streaming'` tick, with a "scroll to bottom" affordance if the user scrolled up. Low risk; discretionary.

---

## Environment Availability

Not applicable beyond the one npm install. No external services/CLIs are introduced — the chat backend, Inngest job proxy, Supabase, and OpenRouter wiring all already exist and are consumed indirectly.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@ai-sdk/react` | `useChat` (CHATUI-01) | ✗ (must install) | 6.0.209 | none — required |
| `ai` | `DefaultChatTransport`, `UIMessage` | ✓ | 6.0.209 | — |
| `/api/chat` route | the stream | ✓ (Phase 124) | — | — |
| `/api/jobs/[jobId]` proxy | estimate card poll | ✓ | — | — |
| `lib/queries/chat.ts` history helpers | sidebar/history | ✓ (Phase 123) | — | — |
| `lib/agent-tools/normalize-input` | multimodal | ✓ (Phase 122) | — | — |
| Browser MediaRecorder / getUserMedia | audio capture | ✓ (used by capture flow) | — | text/photo input |

**Missing dependencies with no fallback:** `@ai-sdk/react@6.0.209` — install it (the only blocking item).

---

## Validation Architecture

> `nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (+ `@testing-library/react` 16, jsdom) |
| Config file | `vitest.config.*` (project root) — repo runs `npx vitest run` |
| Quick run command | `npx vitest run tests/unit/chat` |
| Full suite command | `npx vitest run` |

**Note on test style:** the repo uses RTL `container` queries (NO `jest-dom` matchers in most suites — see the 120-02 note), and prefers **static-source assertions** (`readFileSync` + grep) for invariants (the 124 route tests are the model). Many chat UI behaviors (streaming, transport wiring, part rendering) are best locked with a mix of: (a) a `useChat` mock asserting `sendMessage({text})` is called, (b) static-source grep gates (correct import paths, `inputSchema`-style invariants don't apply here but "imports `@ai-sdk/react`", "transport body has conversationId", "no `handleSubmit`"), and (c) pure-function tests for the parts→render mapping and the history→`UIMessage[]` mapper.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHATUI-01 | `message.parts` text + tool-state → correct render (chip vs result) | unit (pure mapper / RTL) | `npx vitest run tests/unit/chat/chat-message.test.tsx` | ❌ Wave 0 |
| CHATUI-01 | composer calls `sendMessage({text})`; disabled while not `ready` | unit (RTL + useChat mock) | `npx vitest run tests/unit/chat/chat-composer.test.tsx` | ❌ Wave 0 |
| CHATUI-01 | transport built with `api:'/api/chat'` + `body.conversationId`; full messages sent | static-source | `npx vitest run tests/unit/chat/chat-thread.test.tsx` | ❌ Wave 0 |
| CHATUI-02 | sidebar lists conversations (newest first); new/switch behavior | unit (RTL) | `npx vitest run tests/unit/chat/chat-sidebar.test.tsx` | ❌ Wave 0 |
| CHATUI-02 | `ChatMessageRow[] → UIMessage[]` mapper (order, parts passthrough, user/assistant only) | unit (pure) | `npx vitest run tests/unit/chat/history-mapper.test.ts` | ❌ Wave 0 |
| CHATUI-03 | `normalizeChatInput` action wraps `normalizeInput`; audio/photo → text; auth/company gate | unit | `npx vitest run tests/unit/chat/normalize-action.test.ts` | ❌ Wave 0 |
| CHATUI-03 | composer audio/photo path injects returned text into send | unit (RTL + action mock) | (in `chat-composer.test.tsx`) | ❌ Wave 0 |
| CHATUI-04 | estimate card polls `useJobStatus`; renders editor link `/projects/[id]?tab=estimate&estimate=` on completed | unit (RTL + hook mock) | `npx vitest run tests/unit/chat/estimate-card.test.tsx` | ❌ Wave 0 |
| Scope fence | `app/api/chat/route.ts` + `lib/chat/tools.ts` unchanged (no UI edits to backend) | static-source | (assert in a chat-ui-scope test) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/chat`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** full suite green before `/gsd:verify-work` (baseline at 124-02: **325 files / 2279 passed**; the known parallel-only `mcp-route-contract.test.ts` flake is GREEN in isolation).

### Wave 0 Gaps
- [ ] `tests/unit/chat/history-mapper.test.ts` — pure `ChatMessageRow[] → UIMessage[]` (CHATUI-02)
- [ ] `tests/unit/chat/normalize-action.test.ts` — `normalizeChatInput` server action (CHATUI-03)
- [ ] `tests/unit/chat/chat-message.test.tsx` — parts → render mapping (CHATUI-01)
- [ ] `tests/unit/chat/chat-composer.test.tsx` — send + multimodal injection (CHATUI-01/03)
- [ ] `tests/unit/chat/chat-thread.test.tsx` — transport/body static-source + send wiring (CHATUI-01)
- [ ] `tests/unit/chat/chat-sidebar.test.tsx` — list/new/switch (CHATUI-02)
- [ ] `tests/unit/chat/estimate-card.test.tsx` — poll + editor link (CHATUI-04)
- [ ] Dependency install: `npm install @ai-sdk/react@6.0.209` (mock `@ai-sdk/react`'s `useChat` in component tests, mirroring the 124 provider-mock style)

---

## Project Constraints (from CLAUDE.md)

- **Tech stack:** Next.js App Router, TypeScript strict, Tailwind, shadcn/ui, react-hook-form + zod (forms), React Context/Zustand for state. The chat composer is simple enough to use plain `useState` (no RHF needed).
- **Mobile:** audio recording + camera capture MUST work on iOS Safari and Android Chrome — reuse the capture flow's gesture-bound, mime-detected primitives.
- **Security:** service-role key never in the browser; all AI calls server-side. The chat already satisfies this (the stream + normalize + tools run server-side; the UI only POSTs to `/api/chat` and calls server actions).
- **Secrets:** no secrets in code/comments/docs; gitleaks pre-commit hook (`bash scripts/install-git-hooks.sh`). No new secret in this phase.
- **GSD workflow:** all edits via a GSD command; commit messages end with the Co-Authored-By trailer.
- **i18n (from MEMORY):** planning docs in English; owner-facing UI copy via `t(...)`.
- **Deploy (from MEMORY):** CI→GHCR→Coolify; never build on the VPS. (No deploy action in this phase, but no migration either — purely app code + one dep.)

---

## Sources

### Primary (HIGH confidence)
- ai-sdk.dev — `useChat` reference (v6): https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat — return shape, no-input-management, `sendMessage({text})`, transport, `messages` seed.
- ai-sdk.dev — chatbot tool usage (v6): https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage — `tool-<name>` part types, the 4 `state` values + fields per state, `dynamic-tool`, `DefaultChatTransport` import.
- ai-sdk.dev — message persistence (v6): https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence — `messages` seed, `prepareSendMessagesRequest`, `toUIMessageStreamResponse({originalMessages,onFinish})`.
- npm registry (verified 2026-06-24): `@ai-sdk/react@6.0.209` → `dependencies.ai: "6.0.209"`, peer React `^18 || ~19.x`; `ai@6.0.209` deps.
- Codebase (read directly): `app/api/chat/route.ts`, `lib/queries/chat.ts`, `lib/chat/tools.ts`, `lib/agent-tools/create-estimate.ts`, `lib/agent-tools/normalize-input.ts`, `app/api/jobs/[jobId]/route.ts`, `hooks/use-job-status.ts`, `components/capture/capture-recorder.tsx`, `components/whatsapp/whatsapp-inbox.tsx`, `app/(app)/layout.tsx`, `components/app-shell/{sidebar,nav-items}`, `components/ui/scroll-area.tsx`, `app/(app)/projects/[id]/page.tsx` (editor route).

### Secondary (MEDIUM confidence)
- 124-02-SUMMARY.md + STATE.md accumulated context — backend contract (`toUIMessageStreamResponse`, `convertToModelMessages` awaited, full-array body, `onFinish` tail persistence, no-double-debit).

### Tertiary (LOW confidence)
- None relied upon. Where the docs summary and the actual installed `ai@6.0.209` route diverge (last-message-only optimization), the installed route was treated as authoritative.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm; `ai@6.0.209` already installed; `@ai-sdk/react@6.0.209` confirmed lockstep.
- Architecture (route/sidebar/history/card): HIGH — all consumed pieces read directly from the codebase; editor route and job-poll contract verified.
- AI SDK v6 `useChat`/parts/transport API: HIGH — verified against three current ai-sdk.dev v6 doc pages; cross-checked against the backend the route already emits.
- New-conversation-id surfacing (Open Q1): MEDIUM — recommended pre-create pattern is sound but not yet exercised end-to-end; confirm in planning.
- Persisted tool/system row shape (Open Q2): MEDIUM — needs one real round-trip read to confirm.

**Research date:** 2026-06-24
**Valid until:** ~2026-07-24 (AI SDK moves fast; re-verify `@ai-sdk/react` version + `useChat` part/transport API if planning slips past ~30 days).
