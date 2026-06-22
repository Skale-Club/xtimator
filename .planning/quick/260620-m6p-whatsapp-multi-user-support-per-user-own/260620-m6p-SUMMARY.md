# Quick Task 260620-m6p — Summary

**Task:** WhatsApp multi-user support: per-user owner_phone routing with independent conversation history
**Date:** 2026-06-20
**Status:** Complete

## What Was Done

### Task 1 — DB Migration (`a077dbe`)
- `company_whatsapp`: added `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`
- Dropped old `UNIQUE(company_id)` constraint; added composite `UNIQUE(company_id, user_id) WHERE user_id IS NOT NULL` and fallback `UNIQUE(company_id) WHERE user_id IS NULL` for legacy rows
- Backfilled existing rows with `user_id` from `company_members` (first member by `created_at`)
- `whatsapp_conversations`: added `owner_phone TEXT` column (nullable)
- Replaced `UNIQUE(company_id, contact_phone)` with `UNIQUE(company_id, owner_phone, contact_phone) WHERE owner_phone IS NOT NULL` + legacy index for null rows
- Added performance index on `(company_id, owner_phone, last_message_at DESC NULLS LAST)`

### Task 2 — Server Action (`9570526`)
- `syncOwnerPhone` now accepts optional `userId` param; upserts on `(company_id, user_id)` when provided, falls back to legacy `(company_id)` path when null
- Added `saveWhatsAppNumber(phone)` server action in `lib/actions/settings.ts` — upserts `company_whatsapp` for the calling user

### Task 3 — Profile Settings UI (`44f1b78`)
- Added WhatsApp Number field to `components/settings/profile-section.tsx` with independent Save button (separate from profile form)
- `app/(app)/settings/(tabs)/general/page.tsx` fetches current user's `owner_phone` from `company_whatsapp` and passes it to `ProfileSection`

### Task 4 — Webhook + Conversation Scoping (included in `44f1b78`)
- `app/api/webhooks/whatsapp/route.ts`: Route 1 now selects `user_id`; captures `resolvedOwnerPhone` when Route 1 matches; passes `ownerPhone` to `logInboundMessage`
- `lib/whatsapp/conversations.ts`: `WaConversationRow` has `owner_phone`; `getOrCreateConversation` scopes lookup/insert by `ownerPhone`; `logInboundMessage` and `logOutboundMessage` accept and pass `ownerPhone`
- `lib/actions/whatsapp-inbox.ts`: `resolve()` returns `ownerPhone` for the calling user; `fetchConversation` and all inbox actions scope to the user's conversations

## Commits
- `a077dbe` feat(quick-260620-m6p): add multi-user migration for company_whatsapp + whatsapp_conversations
- `9570526` feat(quick-260620-m6p): syncOwnerPhone accepts optional userId; add saveWhatsAppNumber action
- `44f1b78` feat(quick-260620-m6p): add WhatsApp Number field to profile settings UI
