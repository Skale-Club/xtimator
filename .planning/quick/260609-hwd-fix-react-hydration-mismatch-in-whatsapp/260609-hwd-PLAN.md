---
phase: quick-260609-hwd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/whatsapp/whatsapp-inbox.tsx
autonomous: true
requirements: [HWD-01]
must_haves:
  truths:
    - "Server-rendered timestamp text matches the first client render (no hydration mismatch warning)"
    - "Message timestamps (line 173) and conversation-list last_message_at (line 353) render identical text on server and client"
    - "Date/time output is locale-stable (always en-US) and not dependent on render-time 'now'"
  artifacts:
    - path: "components/whatsapp/whatsapp-inbox.tsx"
      provides: "Hydration-safe formatTime() with pinned locale and no time-dependent branch during render"
      contains: "en-US"
  key_links:
    - from: "components/whatsapp/whatsapp-inbox.tsx formatTime()"
      to: "MessageBubble (line ~173) and conversation list (line ~353)"
      via: "deterministic formatter called during render"
      pattern: "formatTime\\("
---

<objective>
Fix the React hydration mismatch in `components/whatsapp/whatsapp-inbox.tsx`. The `formatTime()` helper (lines 41-49) produces different text on the server vs the client for two reasons:

1. **Locale drift:** `d.toLocaleTimeString([], ...)` and `d.toLocaleDateString([], ...)` pass `[]` (default locale), which resolves to the server's locale (renders e.g. "8 de jun.") but the browser's locale on the client (renders e.g. "Jun 8"). Mismatched text on the same DOM node triggers a hydration error.
2. **Time-dependent branch:** `const today = new Date()` makes the `sameDay` decision depend on the exact instant of render. Server render time and client hydration time can straddle a day boundary (or simply differ), flipping the branch and producing different output.

`formatTime` is consumed at line 173 (message bubble timestamps) and line 353 (conversation-list `last_message_at`).

Purpose: Eliminate the hydration warning and make WhatsApp inbox timestamps render deterministically.
Output: A patched, hydration-safe `formatTime()` in the existing component.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@components/whatsapp/whatsapp-inbox.tsx

<interfaces>
<!-- Existing helper to replace. From components/whatsapp/whatsapp-inbox.tsx lines 41-49: -->
```typescript
function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
```
Call sites (do NOT change signature — keep `(iso: string | null): string`):
- Line ~173 inside `MessageBubble`: `{formatTime(m.created_at)}`
- Line ~353 inside the conversation list: `{formatTime(c.last_message_at)}`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make formatTime() deterministic and locale-stable</name>
  <files>components/whatsapp/whatsapp-inbox.tsx</files>
  <action>
Replace the `formatTime()` helper (lines 41-49) with a hydration-safe implementation that is identical on server and client.

**Approach (chosen): pin locale + remove the time-dependent branch.**

Rationale for this approach over the mounted-flag/useEffect alternative:
- `formatTime` is a plain module-level function (not a component), called inline in render at two sites. Converting it to a mounted-flag pattern would require lifting per-row state into `MessageBubble` and the conversation-list `<li>`, a much larger change for a list that can have many rows.
- Pinning the locale to `'en-US'` removes the locale drift entirely. The app's UI copy is English (e.g. "Send estimate", "No conversations yet"), so en-US date/time formatting is consistent with the product, not a regression.
- Removing the `new Date()` "today" comparison removes the only render-time, non-deterministic input. Without it the output depends solely on the `iso` argument, which is identical server-side and client-side.

Concrete implementation:
1. Pass `'en-US'` (not `[]`) to both `toLocaleTimeString` and `toLocaleDateString` so the locale is fixed regardless of server/browser environment.
2. Remove `const today = new Date()` and the `sameDay` branch. Instead, derive a stable choice that does NOT depend on the current time. Always render the same shape for a given timestamp. Recommended: always show "MMM D, h:mm AM/PM" in en-US, i.e. combine date + time into one deterministic string so both call sites stay readable and never change based on when the page is rendered:

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

Notes:
- Keep the existing signature `(iso: string | null): string` and the early `if (!iso) return ''` guard so the two call sites at lines ~173 and ~353 need no changes.
- Add the `isNaN(d.getTime())` guard to avoid emitting "Invalid Date" for malformed timestamps.
- Do NOT introduce `useState`/`useEffect`/mounted flags — they are unnecessary with a fixed locale and no time-dependent branch, and would complicate the per-row render path.
- Tradeoff documented: same-day messages now show the date prefix too (e.g. "Jun 8, 02:14 PM") instead of just the time. This is the intended cost of determinism; it removes all hydration risk from these timestamps. If a time-only display for today is later desired, it must be derived from a server-provided "now" passed as a prop (out of scope for this fix).
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>
- `formatTime()` passes `'en-US'` to its locale formatter and contains no `new Date()` "today"/`sameDay` comparison.
- No `toLocaleTimeString([]`/`toLocaleDateString([]` (empty-locale) calls remain in the file.
- `npx tsc --noEmit` passes with no new errors.
- Call sites at lines ~173 and ~353 are unchanged (signature preserved).
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Hydration-safe `formatTime()` in the WhatsApp inbox — pinned to en-US locale and stripped of the time-dependent same-day branch.</what-built>
  <how-to-verify>
1. Run the dev server (`npm run dev` or `bun dev`) and open the WhatsApp inbox page (`/whatsapp`).
2. Open the browser devtools Console.
3. Confirm there is NO React hydration warning (e.g. "Text content did not match. Server: ... Client: ..." or "Hydration failed because the server rendered HTML didn't match the client").
4. Confirm conversation-list timestamps (right of each contact name) and message-bubble timestamps render as readable en-US dates/times (e.g. "Jun 8, 02:14 PM") and look correct.
5. Optionally hard-refresh a few times to confirm timestamps are stable and no warning flashes.
  </how-to-verify>
  <resume-signal>Type "approved" or describe any remaining hydration warning / formatting issue.</resume-signal>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes.
- No hydration mismatch warning in the browser console on the `/whatsapp` page.
- Timestamps at both call sites render deterministically in en-US.
</verification>

<success_criteria>
- React no longer reports a hydration mismatch for WhatsApp inbox timestamps.
- `formatTime()` output depends only on its `iso` argument (no render-time `now`, no environment locale).
- Both call sites (message bubbles, conversation list) continue to work without signature changes.
</success_criteria>

<output>
After completion, create `.planning/quick/260609-hwd-fix-react-hydration-mismatch-in-whatsapp/260609-hwd-SUMMARY.md`
</output>
