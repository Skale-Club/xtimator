---
phase: quick
plan: 260601-k5e
subsystem: whatsapp-inbox
tags: [whatsapp, audio, storage, inngest, ui]
depends_on: []
tech_stack:
  added: []
  patterns:
    - getServerStorage() for server-side storage operations in Inngest workers
    - Promise.all signed-URL enrichment in server actions before return
    - Native <audio controls> for playback without external dependencies
key_files:
  created: []
  modified:
    - lib/inngest/functions/whatsapp-process.ts
    - lib/actions/whatsapp-inbox.ts
    - components/whatsapp/whatsapp-inbox.tsx
decisions:
  - Store storage path (not signed URL) in whatsapp_messages.media_url — signed URLs generated per-request in fetchThread so DB values never stale
  - !m.media_url.startsWith('http') guard prevents accidentally re-signing a value that already contains a full URL
  - On getSignedUrl failure return media_url: null — bubble degrades gracefully to emoji text rather than crashing
  - Native <audio controls preload="none"> used — no external library needed; works on iOS Safari and Android Chrome per CLAUDE.md mobile requirement
metrics:
  duration: 10min
  completed: "2026-06-01T17:37:29Z"
  tasks_completed: 3
  files_modified: 3
---

# Quick 260601-k5e: Make WhatsApp Voice Message Bubbles Play — Summary

**One-liner:** WhatsApp inbound voice messages are now stored in Supabase `audio` bucket, signed per-request in `fetchThread`, and rendered as a native `<audio controls>` player in the inbox bubble (falls back to emoji text when URL is absent).

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Inngest — upload audio buffer to storage and persist path in media_url | 29bf774 | lib/inngest/functions/whatsapp-process.ts |
| 2 | fetchThread — enrich audio rows with fresh 1-hour signed URLs | 3b98e7c | lib/actions/whatsapp-inbox.ts |
| 3 | MessageBubble — render native audio player for voice messages with a URL | 2743dee | components/whatsapp/whatsapp-inbox.tsx |

## What Was Built

**Task 1 — Inngest audio branch (whatsapp-process.ts):**
- Added `import { getServerStorage } from '@/lib/storage'`
- After `recordings.insert`, the audio branch now calls `getServerStorage().upload('audio', '{companyId}/whatsapp/{msg.id}.ogg', audioBuffer, { contentType: 'audio/ogg', upsert: false })`
- Immediately follows with `supabase.from('whatsapp_messages').update({ media_url: storagePath }).eq('wa_message_id', msg.id)`
- The `audioBuffer` variable (Buffer from `downloadWhatsAppMedia`) is passed directly — no re-wrapping needed

**Task 2 — fetchThread signed URL enrichment (whatsapp-inbox.ts):**
- Added `import { getServerStorage } from '@/lib/storage'`
- After the messages query, `rawMessages` are mapped through `Promise.all`: audio rows with a non-http `media_url` get a fresh 1-hour signed URL via `getSignedUrl('audio', path, 3600)`
- Signing failures return `media_url: null` — bubble degrades gracefully
- All non-audio rows pass through unchanged

**Task 3 — MessageBubble audio player (whatsapp-inbox.tsx):**
- Replaced the `const text = ...` + single `<span>` pattern with a `content` variable using a conditional
- When `msg_type === 'audio' && media_url`: renders `<audio src={m.media_url} controls preload="none" className="w-full max-w-[260px]" />`
- When `msg_type === 'audio'` but `media_url` is null/falsy: renders `<span>🎤 Voice message</span>` — same as before
- All other message types unaffected

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all three artifacts are fully wired end-to-end.

## Threat Flags

No new security-relevant surface introduced beyond what the plan's threat model already covers (T-k5e-01 through T-k5e-03). The `audio` bucket is private; signed URLs expire in 3600s and are never persisted to the DB.

## Self-Check: PASSED

- `lib/inngest/functions/whatsapp-process.ts` — modified, committed at 29bf774
- `lib/actions/whatsapp-inbox.ts` — modified, committed at 3b98e7c
- `components/whatsapp/whatsapp-inbox.tsx` — modified, committed at 2743dee
- `npx tsc --noEmit` — zero errors in all three task files (pre-existing MCP SDK module errors unrelated to this task)
