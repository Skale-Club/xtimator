---
phase: quick-260609-hwd
plan: 01
subsystem: whatsapp-inbox
tags: [hydration, react, formatting, ssr]
requires:
  - components/whatsapp/whatsapp-inbox.tsx
provides:
  - "Hydration-safe formatTime() (pinned en-US locale, no render-time now)"
affects:
  - components/whatsapp/whatsapp-inbox.tsx
tech-stack:
  added: []
  patterns:
    - "Deterministic SSR formatting: pin Intl locale + avoid render-time Date.now()/new Date() branches"
key-files:
  created: []
  modified:
    - components/whatsapp/whatsapp-inbox.tsx
decisions:
  - "Pinned formatTime() locale to en-US and dropped the same-day branch instead of a mounted-flag/useEffect pattern — formatTime is a module-level helper called inline at two list sites, so per-row mounted state would be a much larger change"
  - "Accepted tradeoff: same-day messages now show a date prefix (e.g. 'Jun 8, 02:14 PM') instead of time-only; this is the cost of removing the only non-deterministic render input"
metrics:
  duration: "~3 min"
  completed: "2026-06-09"
  tasks: 1
  files: 1
requirements: [HWD-01]
---

# Quick Task 260609-hwd: Fix React Hydration Mismatch in WhatsApp Inbox Summary

Rewrote `formatTime()` in the WhatsApp inbox to be hydration-safe: pinned the Intl locale to `en-US` and removed the `new Date()`/`sameDay` branch so timestamp text depends only on its `iso` argument and renders identically on server and client.

## What Changed

`components/whatsapp/whatsapp-inbox.tsx` lines 41-49 — the `formatTime()` helper.

Before, it had two non-deterministic inputs that produced different DOM text on server vs client (triggering React hydration warnings):

1. **Locale drift** — `toLocaleTimeString([], ...)` / `toLocaleDateString([], ...)` resolved to the server's locale on the server and the browser's locale on the client.
2. **Time-dependent branch** — `const today = new Date()` made the `sameDay` choice depend on the exact instant of render; server and client renders could straddle the comparison.

After:

```typescript
function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
```

- Signature `(iso: string | null): string` preserved — the two call sites (message bubble line ~173, conversation list line ~353) are unchanged.
- Added `isNaN(d.getTime())` guard so malformed timestamps render `''` instead of "Invalid Date".
- No `useState`/`useEffect`/mounted flags introduced (unnecessary once locale is fixed and the time branch is gone).

## Verification

- `npx tsc --noEmit -p tsconfig.json` — no errors in `components/whatsapp/whatsapp-inbox.tsx` (confirmed by filtering output for the file).
- Locale-pinning and the absence of any `new Date()` "today"/`sameDay` comparison confirmed in the patched source.

## Deviations from Plan

None - plan executed exactly as written.

## Deferred Issues

Out-of-scope, pre-existing TypeScript errors surfaced during `tsc` and were NOT touched (they are unrelated to this task's file):

- `tests/unit/notifications/account-emails.test.ts` (lines 84, 172, 219): test-local `Branding` mock objects are missing `metaDescription`, `ogImageUrl`, `canonicalBaseUrl`, `faviconUrl`. Logged to `deferred-items.md`.

## Human Verification Pending (checkpoint:human-verify)

The plan's final task is a manual browser check that cannot be automated here. Per orchestrator instruction, it was NOT blocked on. To verify:

1. Run dev server and open `/whatsapp`.
2. Open devtools Console — confirm NO React hydration warning ("Text content did not match…" / "Hydration failed…").
3. Confirm conversation-list and message-bubble timestamps render as readable en-US dates/times (e.g. "Jun 8, 02:14 PM").
4. Hard-refresh a few times to confirm timestamps are stable and no warning flashes.

## Commits

- `0f3b414` fix(quick-260609-hwd): hydration-safe formatTime() in WhatsApp inbox

## Self-Check: PASSED

- FOUND: components/whatsapp/whatsapp-inbox.tsx (modified)
- FOUND: commit 0f3b414
