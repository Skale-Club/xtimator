# Deferred Items — Phase 155

Items discovered during execution that are out of scope for the current plan's changes (per the executor's SCOPE BOUNDARY rule) and were not auto-fixed.

## 155-02: Pre-existing failing static-contract test unrelated to this plan's file

- **Test:** `Admin WhatsApp: static contract (source-level) > loadAdminConversationThread contains no update/insert/delete calls` (`tests/e2e/admin-whatsapp.spec.ts:160`)
- **Target file:** `lib/actions/admin-whatsapp.ts` (NOT modified by 155-01 or 155-02)
- **Cause:** The assertion `expect(src).not.toMatch(/revalidatePath/)` trips on a doc-comment inside `loadAdminConversationThread`'s JSDoc that explicitly documents the function performs *no* mutations/revalidation ("no `revalidatePath`, no mutations") — the regex matches the word inside the comment itself, not an actual call.
- **Confirmed pre-existing:** Both the test file (at HEAD before this plan's edits) and `lib/actions/admin-whatsapp.ts` were last modified by unrelated commits (`d3f85413`, `65958cf4`), predating Phase 155 entirely. Not introduced by 155-01 or 155-02.
- **Why deferred, not fixed:** Out of this plan's declared `files_modified` scope (`tests/e2e/admin-whatsapp.spec.ts` only touches the client-component and live-nav tests per the 155-02 plan; `lib/actions/admin-whatsapp.ts` is untouched territory). Fixing it would mean editing a doc comment in a file this plan has no mandate to change.
- **Suggested fix (future plan/quick-task):** Reword the JSDoc comment in `lib/actions/admin-whatsapp.ts` to avoid the literal substring "revalidatePath" (e.g., "performs no writes or cache invalidation calls"), or relax the test regex to a word-boundary/negative-lookbehind that excludes comment-only mentions.
