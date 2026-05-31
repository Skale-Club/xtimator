---
phase: 81
slug: add-whatsapp-send-option-in-sendtab-and-integrations-setting
status: draft
shadcn_initialized: true
preset: new-york / neutral / cssVariables / lucide
created: 2026-05-26
---

# Phase 81 — UI Design Contract

> Visual and interaction contract: adding a WhatsApp delivery channel to (a) the Send tab inside the project workspace and (b) the `/settings/integrations` page (which currently mounts only a placeholder). All values pre-populated from the existing Xtimator design system (Phase 9 dark-first, Phase 10 brand tokens, Phase 71 glassmorphism); no green-field decisions.

---

## Scope & Surfaces

This phase touches exactly two surfaces. Everything outside this table is out of scope.

| Surface | Path | Change |
|---------|------|--------|
| Project workspace SendForm | `components/workspace/send/send-form.tsx` (rendered by `send-tab.tsx`) | Add a third tab "WhatsApp" beside "Email" and (optional) "SMS", gated by `whatsappSendEnabled` |
| Settings → Integrations page | `app/(app)/settings/integrations/page.tsx` | Replace the "OpenRouter coming soon" placeholder with the existing `WhatsAppConnectCard` (already shipped in Phase 45 + extended in Phases 50/53/54) plus a forward-compatible card list shell |

**Entry points retained:** the Settings sub-nav already has an "Integrations" item (`SettingsNav`, icon `Plug`). No nav changes required.

---

## Design System

| Property | Value | Source |
|----------|-------|--------|
| Tool | shadcn/ui | `components.json` |
| Preset | new-york style, neutral base, CSS variables enabled | `components.json` |
| Component library | radix (via shadcn) | `components.json` |
| Icon library | lucide-react | `components.json` `iconLibrary` |
| Font | Inter (`var(--font-inter)`) loaded in `app/layout.tsx` | `app/globals.css` `--font-sans` |
| Color tokens | HSL CSS variables (`--primary`, `--secondary`, `--muted`, `--destructive`, semantic `--success / --warning / --info / --danger`) | `app/globals.css` lines 5-157 |
| Glass + gradient tokens | `--glass-bg`, `--glass-bg-strong`, `--gradient-brand`, `--gradient-success`, `--shadow-glass`, `--glow-brand` | `app/globals.css` lines 296-408 (Phase 71) |
| Primitives | `Card variant="glass"`, `Button variant="primary"`, `Tabs`, `Select`, `Badge`, `AlertDialog`, `Form`/`FormField`, `Input`, `Textarea`, `PhoneInput` — all already present | `components/ui/*` |

**No new primitive required.** Every component is consumed from the existing redesigned shadcn primitives. **No third-party registry required.** Registry safety gate not applicable.

---

## Spacing Scale

Inherited from Tailwind v4 default scale (multiples of 4). This phase uses only the subset below.

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| xs (1) | 4px | Icon-to-label gap inside Tab triggers (`gap-1` is too tight — use `gap-2`) |
| sm (2) | 8px | Inline label/icon gap in Tab triggers, badge gap |
| md (4) | 16px | Default form field vertical rhythm (`space-y-4`) — matches existing SendForm tabs |
| lg (6) | 24px | Card content vertical padding (`py-6`) on `WhatsAppConnectCard` — matches existing card |
| xl (8) | 32px | Page section break on `/settings/integrations` (`space-y-8`) — matches existing settings sub-pages |

Exceptions: none. Touch targets ≥ 44px are already enforced by shadcn `Button size="lg"` and `Input` defaults; no override needed.

---

## Typography

Inherited from the existing app (Inter, four sizes maximum). No new sizes introduced.

| Role | Size | Weight | Line Height | Where it appears in this phase |
|------|------|--------|-------------|-------------------------------|
| Body | 14px (`text-sm`) | 400 | 1.5 (`leading-normal` default) | Tab trigger labels, form labels, helper text, status copy |
| Label / strong body | 14px (`text-sm`) | 500-600 (`font-medium` / `font-semibold`) | 1.5 | `FormLabel`, connection-status emphasis (`<strong>{phoneNumber}</strong>`) |
| Heading | 18-20px (`text-lg`) | 600 (`font-semibold`) | 1.25 (`leading-tight`) | `CardTitle` on the Send card and the Integrations connect card |
| Display | `clamp(28px, 3.5vw, 40px)` | 600 (`font-semibold`) | 1.1 (`tracking-tight`) | `/settings/integrations` page H1 — already in the placeholder page, retain verbatim |

No font-weight other than 400, 500, 600 used. No new sizes introduced.

---

## Color

60/30/10 inherited from the dark-first app shell. The accent (brand primary `#406EF1` / `224 86% 60%`) is already reserved by Phase 10 / Phase 71.

| Role | Value | Usage in this phase |
|------|-------|--------------------|
| Dominant (60%) | `hsl(var(--background))` — dark `240 10% 3.9%` / light `0 0% 100%` | Page background of `/settings/integrations` and workspace shell behind the Send card |
| Secondary (30%) | `hsl(var(--card))` via `Card variant="glass"` = `var(--glass-bg)` | The Send card and the WhatsApp connect card surfaces |
| Accent (10%) | `hsl(var(--primary))` = brand `#406EF1` | **(1)** Active state of the WhatsApp tab trigger (existing `Tabs` gradient indicator from Phase 71). **(2)** "Send WhatsApp" primary CTA button — uses `Button variant="primary"` which already paints `gradient-brand` + shimmer. **(3)** "Connect WhatsApp" CTA on the Integrations page (same `variant="primary"`). |
| Destructive | `hsl(var(--destructive))` | Only the "Disconnect" button inside `WhatsAppConnectCard` and the `AlertDialog` confirm action — unchanged from Phase 45 |

Accent reserved for, in this phase, **exactly three elements**: active tab indicator on the WhatsApp tab, the WhatsApp Send CTA button, and the Connect WhatsApp CTA button. No other element in this phase consumes brand-primary.

Semantic colors used in this phase:

| Token | Where |
|-------|-------|
| `--success` (`text-green-600 dark:text-green-400`) + green-100/900 badge bg | "Connected" indicator inside `WhatsAppConnectCard` (already exists; do not modify) |
| `--muted-foreground` | All helper text under inputs ("E.164 format including country code.", "Share link sends a URL…", "Found in Meta Business Suite…") |
| `--warning` | Inline notice on the Send tab when the entitlement is satisfied but no number is yet active (see Empty-state copy) |

---

## Component Inventory (this phase only)

| Component | Existing or New | Variant / Props |
|-----------|-----------------|-----------------|
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | existing (used today in `send-form.tsx` lines 155-167) | Add a third `TabsTrigger value="whatsapp"` with `<MessageCircle className="h-4 w-4" />` icon + label "WhatsApp" |
| `MessageCircle` (lucide) | existing in dep | Distinguishes WhatsApp tab from SMS (which uses `MessageSquare`). Mandatory: do NOT reuse `MessageSquare` for both — they must be visually distinct |
| `PhoneInput` | existing (`components/ui/phone-input`) | Reused for the recipient phone field; default value = `clientPhone` |
| `Textarea` | existing | Reused for the optional WhatsApp custom message (rows=3, same as SMS tab) |
| `Button variant="primary" size="lg" className="w-full"` | existing | "Send WhatsApp" CTA — full-width, identical visual treatment to existing "Send Email" / "Send SMS" CTAs |
| `Loader2` icon | existing | Spinner during in-flight send (same pattern as email/SMS submit) |
| `WhatsAppConnectCard` | existing (`components/settings/whatsapp-connect-card.tsx`) | Mount unchanged on `/settings/integrations`. Do NOT refactor; do NOT modify props |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` | existing | Use `Card variant="glass"` for any sibling "integration coming soon" rows added later in this phase to maintain visual parity with the WhatsApp card |
| `Badge variant="secondary"` | existing | "Coming soon" label on stubbed future integration rows (if any are rendered) — same look as the OpenRouter row currently being replaced |
| `AlertDialog` | existing | Only inside `WhatsAppConnectCard` for the Disconnect confirmation — unchanged |
| Empty-state pattern | existing (`SendTab` "No estimate available" pattern) | Reused below when the WhatsApp tab is selected but the company has no active WA number — see Empty State section |

**No new components.** Everything is composition of existing primitives.

---

## SendTab — WhatsApp Tab Contract

### Visibility gate (prop name and meaning)

A new prop `whatsappSendEnabled: boolean` is added to `SendTabProps` and threaded from `app/(app)/projects/[id]/page.tsx` (`ProjectTabs`) → `ProjectWorkspace` → `SendTab` → `SendForm`. This mirrors the exact plumbing used for `smsDeliveryEnabled`.

Definition (executor reference only — UI contract just consumes the boolean):

```
whatsappSendEnabled = entitlements.whatsappEnabled
                   && company_whatsapp?.status === 'active'
```

UI contract:

- **`whatsappSendEnabled === true`** → render the WhatsApp `TabsTrigger` and its `TabsContent`.
- **`whatsappSendEnabled === false`** → **hide the tab entirely.** Do NOT render a disabled tab trigger. This matches the existing SMS tab behaviour (`smsDeliveryEnabled` line 161 + 237). Consistency with the existing pattern is mandatory.

### Tab ordering (left → right)

`Email` · `SMS` (if enabled) · `WhatsApp` (if enabled).

WhatsApp goes last because (1) SMS is older / more universally enabled today and (2) email is the unconditional default that must remain in position one. Do not reorder.

### Tab trigger appearance

| Property | Value |
|----------|-------|
| Icon | `MessageCircle` (lucide) — NOT `MessageSquare` (reserved for SMS) |
| Icon size | `h-4 w-4` |
| Trigger className | `gap-2` (icon-to-label spacing) — matches Email and SMS triggers |
| Label | `"WhatsApp"` (English source; rendered via `t("WhatsApp")` once i18n wrapping is applied — but the WhatsApp brand name is not translated, so `t()` will return the source verbatim) |

### Tab content — form fields (top to bottom)

| Field | Component | Default value | Validation |
|-------|-----------|---------------|------------|
| Recipient phone | `<PhoneInput>` | `clientPhone ?? ''` | E.164 regex (`/^\+[1-9]\d{7,14}$/`), identical to SMS schema |
| Custom message (optional) | `<Textarea rows={3}>` | empty | optional, no length cap |
| Submit | `<Button variant="primary" size="lg" className="w-full">` | — | disabled when `sending` or `disabled` (draft estimate) |

**Submit icon:** `MessageCircle` (when idle) or `Loader2` (when sending) — matches the Email/SMS submit pattern exactly.

**Helper copy below the message field** (rendered as `<FormDescription>` or muted-foreground paragraph): `t("Your client will receive an interactive WhatsApp message. Delivery format (share link, formatted text, or PDF attachment) is set on Settings → Integrations.")` — this is informational, not editable inline.

### Where the delivery format lives

The Send tab does NOT expose a delivery-format selector. The format (`share_link` / `formatted_text` / `pdf_attachment`) is read from the company's `company_whatsapp.delivery_format` row that was set on `/settings/integrations` (the `WhatsAppConnectCard` Select). The Send tab UI surfaces no format toggle — single-source-of-truth behaviour is consistent with Phases 44/53.

### Draft-estimate gating

When the parent `SendTab` passes `disabled={isDraft}` (existing line 68 of `send-tab.tsx`), the WhatsApp Send CTA is disabled identically to Email and SMS. The locked-draft banner above the grid (existing `Card variant="glass"` with `Lock` icon, lines 44-53 of `send-tab.tsx`) covers all three tabs — no per-tab banner needed.

---

## Settings → Integrations — Card Contract

### Page layout (top to bottom)

```
<div className="space-y-8 p-6">
  <header>
    <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">Integrations</h1>
    <p className="text-sm text-muted-foreground">
      Connect outbound channels for sending estimates and receiving client messages.
    </p>
  </header>

  <div className="space-y-6">
    <WhatsAppConnectCard initial={initial} />
    {/* future integration cards land here, same Card variant="glass" treatment */}
  </div>
</div>
```

### Page header copy

| Element | Copy |
|---------|------|
| H1 | `t("Integrations")` |
| H1 subhead | `t("Connect outbound channels for sending estimates and receiving client messages.")` — replaces the old AI-provider-focused copy because the page now hosts a delivery channel (WhatsApp) rather than AI providers |

### `WhatsAppConnectCard` placement

Mounted unchanged from Phase 45 + 50 + 53 + 54. The card already covers all four lifecycle states:

| State | Source path inside `WhatsAppConnectCard` |
|-------|------------------------------------------|
| Not connected → connect form (phone, phone-number-id, WABA id) | lines 351-414 |
| Pending OTP verification | lines 225-269 |
| Connected (active / verified / suspended) + delivery-format selector + Suspend/Reactivate + Disconnect | lines 271-349 |

**No modification to `WhatsAppConnectCard` is part of this phase.** The card is the contract. If a planner proposes to refactor it, that proposal is out of this phase's UI scope.

### Card sizing

The Integrations page is full-width inside the `(tabs)/layout.tsx` content slot. `WhatsAppConnectCard` already uses `className="w-full rounded-[var(--radius-md)]"` — do not constrain `max-w-*` on this page.

### Future-proofing (forward-compat only — no UI built)

When additional integrations (e.g., OpenRouter, Slack) land in later phases, they slot below `WhatsAppConnectCard` as siblings within the same `space-y-6` stack. This phase does not render them; it just ensures the page shell is a vertical card stack and not a one-card page.

---

## Empty / Error / Confirmation States

All copy is short, action-oriented, and dual-language-friendly (wrapped in `t(...)`).

### Send tab — WhatsApp tab content states

| State | Trigger | Copy | Action |
|-------|---------|------|--------|
| Default (active number, draft estimate consolidated) | `whatsappSendEnabled === true && !isDraft` | Form fields visible, CTA enabled | Submit button label: `t("Send WhatsApp")` |
| Sending | submit in flight | CTA shows `Loader2` + `t("Sending...")` | Form disabled |
| Send success | API returns 200 | `toast.success(t("Estimate sent via WhatsApp."))` | No inline state change; user stays on the tab |
| Send error | API returns non-2xx | `toast.error(error || t("Failed to send via WhatsApp. Please try again."))` | Form re-enabled, CTA returns to idle |
| Draft estimate | `disabled === true` (parent passes this) | CTA disabled; existing top-of-tab "draft" banner already explains why | — |

### Send tab — WhatsApp tab absent

If `whatsappSendEnabled === false`, **the entire tab is hidden**. The Send card simply shows Email (and SMS if enabled). No "upgrade" upsell appears inside the SendForm — upsells live in the upgrade modal triggered globally on 402 responses (Phase 59 `<UpgradeModal>`), so they are intentionally absent here.

### Integrations page — connect-card states

The `WhatsAppConnectCard` already owns its empty / pending / connected / suspended / error states (toasts via `sonner`, copy from Phases 45/50/54). No additional state copy is introduced here.

### Settings page — page-level empty state

The Integrations page is never truly empty (the WhatsApp card always renders, even when not connected — that's its empty state). No additional empty-state component required.

---

## Copywriting Contract

| Element | Surface | Copy |
|---------|---------|------|
| Tab trigger label | SendForm | `"WhatsApp"` (verbatim; not translated — proper noun) |
| WhatsApp tab phone field label | SendForm | `t("Phone number")` |
| WhatsApp tab message field label | SendForm | `t("Custom message (optional)")` |
| WhatsApp tab helper text | SendForm | `t("Your client will receive an interactive WhatsApp message. Delivery format (share link, formatted text, or PDF attachment) is set on Settings → Integrations.")` |
| Primary CTA (idle) | SendForm | `t("Send WhatsApp")` — verb "Send" + noun "WhatsApp"; consistent with `Send Email`, `Send SMS` |
| Primary CTA (in flight) | SendForm | `t("Sending...")` — identical to Email/SMS |
| Toast — send success | SendForm | `t("Estimate sent via WhatsApp.")` — period included, period style consistent with `t("Estimate sent successfully!")` and `t("Estimate sent via SMS!")` (NOTE: existing copy uses exclamation; reuse exclamation for parity → `t("Estimate sent via WhatsApp!")`) |
| Toast — send error (generic) | SendForm | `t("Failed to send via WhatsApp. Please try again.")` |
| Toast — send error (not connected) | SendForm | `t("Cannot send: connect a WhatsApp number first in Settings → Integrations.")` — only fires if the server says the number is not active despite the prop being true (defensive) |
| Integrations H1 | Settings page | `t("Integrations")` — unchanged |
| Integrations H1 subhead | Settings page | `t("Connect outbound channels for sending estimates and receiving client messages.")` |
| Empty state for the WhatsApp Send tab when entitlement is true but no number is active | (none) | The tab is hidden in this state; the user reconnects via Settings → Integrations. **No inline empty state copy required.** |
| Destructive confirmation (Disconnect) | `WhatsAppConnectCard` | Existing — `t("Disconnect WhatsApp?")` heading, `t("Inbound WhatsApp messages will no longer create estimates. This action can be reversed by reconnecting.")` body — unchanged |

**Destructive actions in this phase:** exactly one — Disconnect WhatsApp — handled by the existing `AlertDialog` inside `WhatsAppConnectCard`. No new destructive action is introduced.

---

## Interaction Contract — Keyboard, Focus, Touch

| Behaviour | Requirement |
|-----------|-------------|
| Tab focus order on SendForm | Email · SMS · WhatsApp (when present) — DOM order matches visual order; default browser tabbing applies |
| `Tab` key cycles fields inside a `TabsContent` | Native; no override |
| Phone input on iOS Safari / Android Chrome | `inputMode="tel"` is already set by `PhoneInput`; no change |
| WhatsApp tab CTA `disabled` state | Visually 60% opacity (shadcn default), `cursor-not-allowed`, no shimmer animation |
| AlertDialog destructive confirm | Existing — focus traps on `Cancel`, ESC closes |
| Mobile breakpoint (sm:) | Tabs already scroll horizontally if they overflow; with three tabs at 44px touch height there is no overflow at 360px viewport; no change |
| `prefers-reduced-motion` | Already honoured by `Button variant="primary"` shimmer (gated in `globals.css` line 415); no new motion introduced |
| `prefers-reduced-transparency` | Already honoured by glass tokens (`globals.css` line 354); no new glass surfaces introduced |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | `Tabs`, `Card`, `Button`, `Badge`, `Input`, `Textarea`, `Form`/`FormField`, `Select`, `AlertDialog` — all already in `components/ui/*` | not required (already installed and audited in prior phases) |
| Third-party registries | none | not applicable — no third-party blocks introduced this phase |

No `npx shadcn view` or vetting gate triggered: nothing new enters the contract.

---

## Pre-population Provenance

For traceability — every value above was pulled from these sources, not invented.

| Decision | Source |
|----------|--------|
| shadcn New York / neutral / cssVariables / lucide | `components.json` |
| Inter font, HSL semantic tokens, dark-first | `app/globals.css` lines 5-180 |
| Glass + gradient + glow tokens | `app/globals.css` lines 296-408 (Phase 71) |
| Brand primary `#406EF1` = `224 86% 60%` | STATE.md line 204 (Phase 10) |
| Tabs-with-icon-gap-2 pattern for delivery channel | `components/workspace/send/send-form.tsx` lines 155-167 |
| Tab visibility gated by entitlement boolean (`smsDeliveryEnabled` model) | `components/workspace/send/send-form.tsx` lines 161, 237 |
| Prop threading `*.DeliveryEnabled` → ProjectTabs → Workspace → SendTab → SendForm | `app/(app)/projects/[id]/page.tsx` lines 106, 147 |
| `whatsappEnabled` entitlement on tier | `lib/entitlements.ts` lines 15, 27, 37, 47, 57 |
| `company_whatsapp.status === 'active'` gate for actual send eligibility | STATE.md "Phase 54: WhatsApp Status Flow" + `WhatsAppConnectCard` lines 307-328 |
| `WhatsAppConnectCard` complete + already shipped (do not refactor) | `components/settings/whatsapp-connect-card.tsx` (Phases 45/50/53/54) |
| Settings → Integrations sub-nav entry already present | `components/settings/settings-nav.tsx` line 19 |
| Current Integrations page is a placeholder (replace, don't sit beside) | `app/(app)/settings/integrations/page.tsx` lines 17-19 |
| Delivery format selector lives on the connect card, not the Send tab | `components/settings/whatsapp-connect-card.tsx` lines 283-304 + STATE.md Phase 44/53 decisions |
| Upgrade upsell handled globally (no SendTab inline upsell) | STATE.md "[Phase 59-billing-ui]: UpgradeModal uses window.fetch monkey-patch" |
| Toast library = `sonner` | `components/workspace/send/send-form.tsx` line 24, `components/settings/whatsapp-connect-card.tsx` line 9 |
| Icon: `MessageCircle` for WhatsApp (vs `MessageSquare` for SMS) | lucide-react inventory; SMS already owns `MessageSquare` in `send-form.tsx` line 23 |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
