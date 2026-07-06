---
phase: 159
slug: inbox-visual-redesign
milestone: v4.17
requirements: [INBOX-05, INBOX-06, INBOX-07, INBOX-08]
autonomous: true
created: 2026-07-06
---

# Phase 159 — Context (locked decisions)

## Goal

The owner reviewed the live v4.16 Inbox and said the design "ficou péssimo" (turned out terrible) — it needs a complete visual redesign. Owner-confirmed direction: **"Premium Xtimator"** — apply the app's OWN existing Phase-71 glassmorphism design system (already used elsewhere in the admin panel: Dashboard stat cards, Companies glass-card table) to the two-pane conversation viewer, adding the visual richness (avatars, colored accents, glass surfaces) it currently lacks — NOT a literal Xphere clone (Xphere was consulted for structural/interaction inspiration only, per its own visual details below).

**Independent of Phases 156/157/158** — only touches `app/admin/inbox/*` and possibly new shared avatar-utility code.

## Why it "ficou péssimo" — confirmed structural/visual audit

**File:** `app/admin/inbox/admin-whatsapp-client.tsx` (lines 85-194):
- **List rows** (lines 99-140): NO avatar — text-only. Selected state: `bg-muted/60` + left border. Hover: `bg-muted/20` (very subtle). Unread signal: plain `<Badge variant="outline">{count}</Badge>` text badge, no color/dot.
- **Thread pane** (lines 147-193): plain text header, no avatar, `MessageBubble` components with only the outbound gradient as any color at all.
- **Filters bar**: plain `variant="outline"`/`variant="ghost"` buttons, `h-8 text-sm` inputs — no premium treatment.

**Verdict from research:** "The Inbox is structurally sound but visually generic — no avatars, flat colors, minimal hierarchy." The glassmorphism system is FULLY BUILT and READY in `app/globals.css` (Phase 71) — it's simply never been applied to this surface.

## The design system already available (confirmed via research — reuse, do not invent new tokens)

**CSS variables** (`app/globals.css` lines ~435-497):
```css
--glass-bg / --glass-bg-strong / --glass-bg-light
--glass-border / --glass-blur (16px) / --glass-blur-strong (24px)
--gradient-brand / --gradient-success / --gradient-warning / --gradient-danger / --gradient-premium
--glow-brand / --shadow-glass
```
Dark-mode overrides already exist (`.dark`, `[data-theme="admin-dark"]`) — no new dark-mode work needed, the tokens already theme-switch.

**Card variants** (`components/ui/card.tsx` lines 6-22, CVA):
- `variant="glass"` — 16px blur + subtle transparency + `--glass-border`
- `variant="glass-strong"` — 24px blur, denser
- `variant="stat"` — glass + a 3px brand-gradient top stripe (used on Dashboard)

**Existing proof-of-pattern in THIS admin panel** (reference these directly, don't reinvent):
- `app/admin/page.tsx` (Dashboard) lines 41-51 — `Card variant="stat"` usage.
- `app/admin/companies/page.tsx` lines 138, 193 — `Card variant="glass"` wrapping a table, `bg-muted/30` header, `hover:bg-muted/20` rows.

**Avatar primitive** (`components/ui/avatar.tsx`, Radix-based): `Avatar`/`AvatarImage`/`AvatarFallback`/`AvatarBadge`/`AvatarGroup`, sizes `sm` (h-6) / `default` (h-8) / `lg` (h-10). `AvatarFallback` currently defaults to plain `bg-muted text-muted-foreground` — no deterministic per-identity coloring exists anywhere yet. The only initials precedent (`app/admin/admins/admin-list.tsx` line 86, `row.email.slice(0,2).toUpperCase()`) is plain gray for everyone — NOT deterministic-color, this phase must build that.

## Locked visual spec for the redesigned Inbox (synthesizing Xphere's proven interaction details INTO Xtimator's own glass tokens — do not import Xphere's literal colors/CSS variables)

### New utility needed (build this — none exists)

A `getInitials(name: string): string` + a deterministic `getAvatarColor(seed: string): string` (hash the contact name or conversation id to pick from a small fixed palette of Tailwind/CSS-var-based background classes, e.g. 6-8 options drawn from the app's existing gradient/accent palette so avatars feel "branded" rather than random hex values) — same contact always renders the same color. Place in a shared location (e.g. `lib/utils/avatar.ts` or `components/whatsapp/`) since both the list row and thread header need it.

### List pane rows

- **Avatar**: `h-9 w-9` `Avatar` with `AvatarFallback` showing 1-2 initials, background from the new deterministic-color utility (not plain gray).
- **Row container**: apply glass treatment — `bg-[var(--glass-bg-light)]` (or the existing `.glass`/`Card variant="glass"` pattern, Claude's Discretion on the lightest-weight way to apply it per-row without a full nested `<Card>` per row hurting scroll performance) instead of the current flat `bg-muted/20`/`bg-muted/60`.
- **Left accent bar**: add a 3px colored left bar (`before:` pseudo-element or a real element), colored by state — unread = a visible accent color (e.g. `--gradient-brand` or the primary hue), selected = primary, read = transparent/hidden. This directly replaces the current plain `border-l-2 border-[hsl(var(--primary))]`/`border-transparent` binary with a richer, Xphere-inspired 3-state accent (mirrors Xphere's priority-bar pattern structurally, using Xtimator's own color tokens).
- **Unread indicator**: replace the current `<Badge variant="outline">{count}</Badge>` with BOTH a small colored dot (2×2px, primary-colored, next to the timestamp — matching Xphere's proven "dot beats a text badge" pattern) AND keep an actual unread count somewhere sensible (Claude's Discretion: dot for "has unread" + a small numeric badge only if count is meaningfully informative, or dot-only if simpler reads better — the REQUIREMENT is "visually rich, not just a text badge," not a prescription to remove the count entirely).
- **Padding/spacing**: increase from the current `py-2` to `py-3` (research recommends this exact bump, matching Xphere's `py-2.5` more closely while staying on Xtimator's likely 4px spacing scale — verify `py-3` = 12px is on-scale, adjust if the project's spacing convention requires a different multiple of 4).
- **Typography**: name `text-sm font-semibold` (bump from current `font-medium`), message preview `text-xs text-muted-foreground` (already close, keep).
- **Hover state**: richer than current `bg-muted/20` — use the glass-light background + a subtle shadow lift if that doesn't feel like scope creep for a list row (Claude's Discretion; don't over-animate).

### Thread pane

- **Header**: add an avatar (same deterministic-color utility) next to the contact name/phone/company text — currently text-only.
- **Background**: apply a glass-surface treatment consistent with the list pane (not necessarily identical, but visually part of the same redesigned system — avoid a jarring flat-vs-glass split between the two panes).
- **`MessageBubble`** (`components/whatsapp/message-bubble.tsx`) — the outbound gradient-brand bubble is fine and already colorful; Claude's Discretion whether inbound bubbles (`bg-muted`) gain a subtle glass treatment too, but this is optional polish, not a hard requirement — the primary redesign target is the LIST rows and thread HEADER, not necessarily re-theming every message bubble.

### Inbox Settings sub-page (INBOX-08)

`app/admin/inbox/settings/page.tsx` currently uses plain HTML tables with no glassmorphism. Apply the SAME `Card variant="glass"` wrapping pattern already proven on `app/admin/companies/page.tsx` (glass card wrapping the Accounts/Templates tables) for visual consistency with the redesigned main Inbox — this is a lighter lift than the conversation-row redesign (just wrap the existing tables in a glass card, matching the Companies page precedent almost verbatim).

## What must NOT change (read-only invariant, locked since v4.16)

- Zero reply/send code — this is a PURELY VISUAL phase. Do not add any message-composition UI, however tempting. Grep for `sendMessage|reply|handleSend` after the redesign — must still be zero matches, same as v4.16's contract.
- Selection mechanism (`?conversation=<id>` URL param, `router.replace`), SSR deep-link resolution, mobile single-column collapse logic, `loadAdminConversationThread`/`listAdminWhatsAppConversations` data fetching — ALL UNCHANGED. This phase only changes CSS classes/JSX structure for visual presentation, not the data flow or interaction logic already built and verified in v4.16.
- `app/admin/inbox/admin-whatsapp-filters.tsx`'s functional behavior (search/status/date filters, pagination) — unchanged; may receive matching visual polish (glass-styled inputs) but the filter LOGIC stays untouched.
- Settings page's Accounts/Templates functional behavior (`AdminWhatsAppAccounts`, `WhatsAppTemplatesPanel`) — unchanged, only wrapped in a glass card visually.

## Test blast radius

- The e2e static-contract tests from v4.16 (`tests/e2e/admin-whatsapp.spec.ts`) that assert "no reply/send tokens" and the two-pane structure (no `Sheet`, no `<table`) must STILL PASS — re-run them as a regression gate, do not let visual-only changes break these structural assertions.
- If any test asserts specific Tailwind class names that this phase changes (e.g. asserting `py-2` or `bg-muted/60` literally), update those assertions to match the new classes — but do NOT relax a test's actual behavioral assertion (selection working, empty state showing, etc.) to make it pass; only update styling-literal assertions.

## Claude's Discretion

- Exact deterministic-color palette (how many colors, which hues) for the avatar utility — pick something that reads as "branded" against both light and dark admin themes (test both, since `[data-theme="admin-dark"]` exists).
- Whether per-row glass treatment uses full `Card variant="glass"` nesting or a lighter equivalent set of utility classes for scroll-list performance — use judgment, this list can have many rows.
- Minor spacing/radius tweaks beyond what's specified above, as long as they stay within the existing `--radius-*`/spacing scale already used elsewhere in the admin (don't invent new radius/spacing values).
