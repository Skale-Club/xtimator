# Pitfalls Research

**Domain:** Modify-in-place milestone on a live production SaaS's core document/send surface — per-document settings panels, URL-scheme evolution alongside a live secret-token scheme, mobile editor visual rewrite, duplicated-component consolidation.
**Milestone:** v4.18 Estimate Document & Send Experience Refresh (SEED-041..044)
**Researched:** 2026-07-08
**Confidence:** HIGH — every pitfall below is grounded in direct inspection of the current Xtimator codebase (file/line citations included), not generic domain knowledge. Where a claim is inference rather than a direct code fact, it is flagged LOW/MEDIUM.

## Critical Pitfalls

### Pitfall 1: Settings-drift — the new presentation settings get read by some renderers and silently ignored by others

**What goes wrong:**
The owner toggles "hide Summary" (or turns tax off, or hides section subtotals) in the new gear panel, previews it in the editor, and sends it — but the PDF, the "classic" share page, the "modern" share page, or the plain-text/WhatsApp message the client actually receives still shows the old content, because that renderer never learned about the new setting.

**Why it happens:**
This is not hypothetical risk — it is the *current, proven* architecture. Section visibility today is decided independently in at least 5 places, each with its own `!= null` / `isFieldVisible()` check, with **zero shared source of truth**:
- Editor: `components/workspace/estimate/estimate-document.tsx` — `isFieldVisible()` (L1616) is local `useState<Set<OptionalField>>` React state, not persisted.
- Modern share page: `components/share/estimate-document-modern.tsx` (L346-533) — repeats its own `data.summary != null`, `data.payment_terms != null`, etc.
- Modern PDF: `components/pdf/estimate-pdf-modern.tsx` (L624-805) — repeats the same checks a third time.
- Classic PDF: `components/pdf/estimate-pdf.tsx` — a fourth independent implementation.
- Plain-text/WhatsApp: `lib/utils/estimate-template.ts` → `buildItemsBreakdown()` (L85-96) **iterates every section/item unconditionally** — there is no visibility gate here at all today, and section-hiding via SEED-041 will not affect it unless someone explicitly wires it in.

Five renderers, five independent implementations of "should this render." Add a 6th behavior (persisted `presentation_settings`) without a single shared predicate function, and it is near-certain at least one of the five drifts.

**How to avoid:**
Build ONE pure function (e.g. `lib/estimate/presentation.ts` → `resolveVisibleSections(data, settings)` / `isSectionVisible(field, settings, data)`) that every renderer — editor, classic share, modern share, classic PDF, modern PDF, plain-text template, WhatsApp send — imports and calls. No renderer may re-derive visibility from `data.field != null` on its own once settings exist. Treat this the same way `lib/estimate/compute-totals.ts` is already treated for math (single authoritative module, byte-identical retrocompat tests) — this milestone's own key context explicitly says the settings panel "only changes inputs/preferences" the way tax/discount already do; visibility deserves the identical discipline.

**Warning signs:**
- Any PR that adds a `presentation_settings.xxx` check inside `estimate-pdf.tsx`, `estimate-pdf-modern.tsx`, `estimate-document-modern.tsx`, or `estimate-template.ts` directly (duplicated logic) instead of importing a shared resolver.
- `buildItemsBreakdown()` / the WhatsApp plain-text path not mentioned at all in the settings-panel plan.
- A demo where the editor preview and the "Open Preview" link (real share page) are shown side by side and match — but PDF or plain text isn't checked.

**Phase to address:**
"Renderer Application + Tests" phase (SEED-041's own phase 3) — should be the LAST phase of that seed's work, and its success criteria must explicitly require diffing all 5+ output surfaces for the same toggle, not just the editor + one renderer.

---

### Pitfall 2: The new non-destructive settings panel collides with the existing destructive "Add Details" hide toggle

**What goes wrong:**
SEED-041 explicitly requires: "If a section has generated text and the owner toggles it off, retain the text so it can be toggled back on." But that non-destructive behavior does not exist today for these exact same fields — a different, already-shipped control does the opposite.

**Why it happens:**
`estimate-document.tsx`'s existing `AddDetailsPopover` + `toggleField()` (L1470-1522, L1619-1632) already lets an owner "hide" Summary/Payment Terms/Timeline/Warranty/Notes — but toggling one off calls `dispatch({ type: 'UPDATE_FIELD', field, value: null })`, i.e. it **deletes the content** (sets it to `null`), not just hides it. If SEED-041 ships a second, parallel "hide this section" control in the new gear panel that behaves non-destructively, the estimate now has two UI affordances for "hide Summary" that do materially different things (one nukes the AI-generated text permanently, one doesn't) — guaranteed user confusion and a realistic support ticket ("I hid a section and now the text is gone").

**How to avoid:**
Decide explicitly (this is SEED-041's own open decision #1, but it's actually load-bearing, not cosmetic): either (a) retire `AddDetailsPopover`'s destructive toggle and route ALL show/hide through the new non-destructive `presentation_settings`-backed control, or (b) keep `AddDetailsPopover` strictly as "add/generate new content for an empty section" (its original purpose) and make the new gear panel the ONLY place that can hide a section that already has content. Do not ship both as independent toggles over the same five fields.

**Warning signs:**
- Any estimate where a section is both (a) `data.field == null` (content was deleted) and (b) marked `visible: true` in `presentation_settings` — that pairing means content already got nuked by the old mechanism and the new one can't recover it.
- QA script: fill Summary → hide via new gear panel → verify Summary text still exists in `estimates` table → toggle back on via gear panel → verify same text reappears without re-generation.

**Phase to address:**
"Settings Model + Persistence" phase (SEED-041 phase 1) must lock this decision before "Floating Gear UI" (phase 2) is built, since the UI's hide/show semantics depend on it.

---

### Pitfall 3: Reintroducing the exact anon-PII-leak class of bug that was already found and fixed once on this table

**What goes wrong:**
The friendly-URL lookup path (company slug + estimate slug + short suffix) is implemented as a new Supabase query pattern that, even unintentionally, ends up readable by the `anon` role via RLS instead of exclusively through the service-role client with an exact-match filter — re-exposing every estimate's owner/client PII (name, email, phone, address) to anyone who can guess or enumerate a slug.

**Why it happens:**
This is not a theoretical risk for this codebase — it already happened once and was deliberately fixed. Migration `supabase/migrations/20260606000002_drop_estimates_anon_select_policy.sql` documents dropping a policy `estimates_anon_select_by_share_token ... FOR SELECT TO anon USING (share_token IS NOT NULL)`. Its own comment: *"let the unauthenticated anon/publishable key read EVERY estimate row, because share_token defaults to a UUID on all rows. An attacker could SELECT * FROM estimates, harvest every share_token, then open each public share page to scrape every client's and owner's phone/email/address."* The fix: every public lookup today goes through `requireServiceClient()` (bypasses RLS) filtered by an **exact-match** `.eq('share_token', token)` (`lib/queries/share.ts` L96, L280; `app/estimate/[token]/actions.ts` L17, L120). The root cause of the original bug was a predicate that checked "is this column non-null" instead of "does this column equal the caller's presented secret." A friendly-URL lookup that resolves `companySlug + estimateSlug` first and only checks the short suffix as an afterthought (or via a client-readable RLS policy scoped by slug-existence rather than suffix-equality) recreates the identical class of bug with a new column.

**How to avoid:**
The new lookup (`getEstimateBySlug(companySlug, estimateSlug, shortToken)` or equivalent) must live in the same service-role, exact-match pattern as `getEstimateByShareToken` — never grant anon a new RLS SELECT policy on `estimates` scoped by slug alone. The short public token/suffix must be part of the WHERE-equivalent filter, not a post-fetch check on data already returned to a broader-than-necessary query. Reuse `getEstimateByShareToken`'s existing safe-payload shape (which already strips `share_token` before it reaches the browser, `lib/queries/share.ts` L243) rather than writing a second payload-shaping function that might forget a field.

**Warning signs:**
- Any new RLS policy on `estimates` (or a new lookup table backing slugs) granted to `anon` or `authenticated` roles as part of this milestone.
- A slug-resolution query executed against anything other than `requireServiceClient()`.
- The new short-token entropy source not reviewed (see Pitfall 4).

**Phase to address:**
"URL Contract + Data Model" phase (SEED-042 phase 1) — this is the single highest-severity item in the whole milestone and should have an explicit security-review checkpoint / negative test ("anon Supabase client cannot read an estimates row by slug alone") before Send Hub UI work begins.

---

### Pitfall 4: The "friendly" slug + short suffix is guessable/enumerable even though it looks like it has a secret component

**What goes wrong:**
`companySlug` will almost certainly be derived from the company name (e.g. `skale-club`), and `estimateSlug` from the estimate/project title (e.g. `untitled-scope-assessment`) — both are attacker-visible or guessable (company names are public marketing info; generic estimate titles like "roof-repair-estimate" repeat across many customers). If the "secret suffix" appended to make the URL unguessable is short, uses a small alphabet, or is derived from something predictable (e.g. `estimates.id` truncated, or a sequential/incrementing counter), the combined URL is far weaker than the current 128-bit random UUID `share_token`, even though it visually looks like it has a random-looking tail.

**Why it happens:**
The current `share_token` is `UUID DEFAULT gen_random_uuid()` (`20260409000001_initial_schema.sql` L94) — full 122 bits of entropy, effectively unguessable. SEED-042 itself flags this risk directly ("a human-readable slug based only on company and estimate name is guessable, so it cannot safely replace the token unless the system adds a non-guessable public slug/secret") but leaves the suffix length/alphabet as an open decision. A "short" suffix optimized for URL aesthetics (6-8 base62 chars ≈ 36-48 bits) is meaningfully weaker than a UUID, and weaker still if there is no rate limiting on the public `/estimate/...` route — nothing currently rate-limits anonymous GETs to `app/estimate/[token]/page.tsx`.

**How to avoid:**
Pick a suffix length with real security margin (10-12 base62 characters ≈ 60-70+ bits is a reasonable floor) and generate it with a CSPRNG (`crypto.randomBytes`/`gen_random_uuid()`-derived), never from a sequential ID, timestamp, or truncated hash of predictable inputs (company slug + title). Add basic abuse protection to the public estimate route (rate limiting or at minimum consistent 404 timing/response for "wrong suffix" vs "no such slug," so the endpoint can't be used as an existence oracle for enumeration). Treat the suffix exactly like `share_token` from a threat-model standpoint — same TTL/expiry rules (Pitfall 6), same "never exposed in any payload it doesn't belong in" discipline.

**Warning signs:**
- Suffix generation logic that reuses/truncates `estimate.id`, `created_at`, or any other value already knowable/derivable from other public data (project name, company slug, sequence number visible elsewhere).
- No rate limiting mentioned anywhere in the URL Contract phase's plan.
- Suffix shorter than ~10 characters of a 62-character alphabet.

**Phase to address:**
"URL Contract + Data Model" phase (SEED-042 phase 1), same phase as Pitfall 3 — this is a design decision that must be locked before any UI work references the new URL shape.

---

### Pitfall 5: Old `/estimate/{share_token}` call sites get "helpfully" migrated to the new format and silently drop the Stripe redirect query-param contract

**What goes wrong:**
Share-link URLs are constructed independently in at least 7 places in the current codebase, not through one shared builder:
- `lib/utils/share-link.ts` → `buildShareLink()` (used by `send-form.tsx`, `send-actions-menu.tsx`)
- `lib/whatsapp/send-estimate.ts` L76 (own inline template string)
- `lib/whatsapp/confirm-actions.ts` L123 (own inline template string)
- `app/api/estimates/[id]/send-sms/route.ts` L103 (own inline template string)
- `lib/billing/connect-webhook.ts` L179 and L324 (two more inline template strings, used for Stripe Connect payment confirmation/notification emails)

SEED-042 requires the OLD token URLs keep working (retrocompat) — that's the easy, well-scoped part. The real risk is the opposite direction: a developer, mid-milestone, decides to proactively update all 7 call sites to emit the NEW friendly format for consistency, and in doing so forgets that `tests/e2e/visual/share.spec.ts` and `tests/e2e/estimate-share-payment.spec.ts` assert on `?stripe=success` / `?stripe=canceled` query params appended to the share URL after a Stripe Checkout round-trip. If the new friendly route doesn't parse/honor those same query params (or the checkout `success_url`/`cancel_url` construction in `connect-webhook.ts` isn't updated to build a friendly-URL-shaped redirect target with the param preserved), the post-payment redirect silently regresses for real paying customers going through Stripe Connect.

**Why it happens:**
There is no single `buildShareLink()`-style function used everywhere — it's the exception (2 of 7 call sites), not the rule. Any "search and update the share URL" pass is highly likely to miss at least one of these 5 additional inline constructions, especially the two inside `connect-webhook.ts`, which are payment-webhook code far from the Send UI a developer would naturally think to check.

**How to avoid:**
Before touching any URL construction, grep for every literal `/estimate/${` and `buildShareLink(` occurrence (this research already found all 7) and route them ALL through one function that knows both formats (e.g. `buildShareLink(estimate, { preferFriendly: true })` falling back to token format when slug/suffix data isn't available). Explicitly test the Stripe success/cancel redirect against whichever URL shape is actually deployed for that estimate — don't assume the friendly path inherits query-param handling for free just because the route resolves to the same page component.

**Warning signs:**
- A grep for `/estimate/${` after the milestone still shows more than 1-2 remaining literal constructions.
- `connect-webhook.ts`'s two share-URL builders not mentioned in the phase's file list.
- Stripe success/cancel e2e tests (`tests/e2e/estimate-share-payment.spec.ts`) not re-run against the new URL shape.

**Phase to address:**
"URL Contract + Data Model" phase should introduce the shared builder; "Delivery APIs + Templates" phase (SEED-042 phase 3) is responsible for actually swapping each of the 7 call sites and must include `connect-webhook.ts` explicitly in scope (easy to overlook since it's billing code, not send/share code).

---

### Pitfall 6: `share_expires_at` expiry and `viewed_at`/`estimate_activity` view-logging silently stop firing on the new route because they're keyed by `share_token`, and the new route may not have that value in hand

**What goes wrong:**
A client opens a friendly link. The page loads fine (estimate resolves via the new slug lookup). But `viewed_at` never updates, no "estimate viewed" in-app notification fires for the owner, and `estimate_activity` gets no row — analytics and owner notifications silently go dark for every view through the new URL, while the old token URL keeps working perfectly. Nobody notices immediately because the page itself renders correctly.

**Why it happens:**
`logEstimateView(token)` and `respondToEstimate(token, response)` (`app/estimate/[token]/actions.ts` L9, L110) both take a single `token` param and query `.eq('share_token', token).single()` (L17, L120) — a query that **quietly returns `null`/no-op on no match rather than throwing**, per the existing `if (!estimate) return` / `if (!estimate) return { success: false, ... }` guards. If the new friendly-URL page passes its own `shortToken` (a value distinct from the DB's `share_token` column) into these functions instead of the estimate's actual `share_token`, the lookup fails silently — no error surfaces anywhere, because "no such token" is treated as a normal, expected case (an expired/garbage link), not a bug. Additionally, `getShareLinkState()` (`lib/queries/share.ts` L275-287) is a SEPARATE function from `getEstimateByShareToken()` used only to distinguish "expired" from "missing" for the friendly 404 page — a second parallel lookup that must also be extended/reused for the new URL shape, or expired friendly links will show a generic 404 instead of the deliberate "this link has expired" messaging that exists today.

**How to avoid:**
Whichever identifier the new friendly route resolves with, make sure `logEstimateView`, `respondToEstimate`, and `getShareLinkState` are called with the estimate's real `share_token` (fetched as part of resolving the friendly URL) — not the new short suffix — unless those three functions are deliberately updated to accept either identifier. The safest approach: have the new slug-lookup function return the full estimate row (which already contains `share_token` internally, even though it's stripped before reaching the browser), and pass `estimate.share_token` through to these existing actions unchanged, rather than inventing a parallel identity plumbing path for view-logging.

**Warning signs:**
- `estimate_activity` rows for `event_type = 'estimate_viewed'` never appear for estimates only ever opened via friendly links (checkable by comparing view-logged estimates against which URL format was sent).
- QA script: open a friendly link → check `viewed_at` updates on first view → open again → confirm no duplicate view-triggered email (existing "only on first view" guard, L32).
- Expired friendly link shows a generic Next.js 404 instead of the "This estimate link has expired" message.

**Phase to address:**
"URL Contract + Data Model" phase must explicitly plan how `logEstimateView`/`respondToEstimate`/`getShareLinkState` are wired to the new route, not leave it as an implicit "same as before" assumption; "Logging + Tests" phase (SEED-042 phase 4) must add a friendly-link view-logging regression test as a named requirement, not just "URL generation" tests.

---

### Pitfall 7: Consolidating the 3 (really 4) client-picker implementations loses a capability one of them will be asked to gain, and the "shared" component quietly re-forks the next time someone touches just one call site

**What goes wrong:**
The 3 named candidates (`LinkClientButton`, `LinkClientCard`) plus the undocumented 4th (`LinkClientInline` + `ClientSearchList`, inline inside `estimate-document.tsx` L1339-1415) are consolidated into one shared component. Six months later, someone needs "allow creating a new client inline" for the Bill-To editor specifically (SEED-044's own open decision #5) and bolts it on ONLY inside the document's usage of the shared component via a local wrapper — recreating exactly the fragmentation this milestone set out to eliminate, just with fewer total files.

**Why it happens:**
Direct comparison of the current 3 implementations shows they are **already functionally identical** — all three fetch from `GET /api/clients`, filter client-side by name/email substring, and call `linkProjectToClient(projectId, clientId)` on select; they differ only in container chrome (`Card` wrapper vs `Button` trigger vs bare popover). None of the three supports inline client creation or unlinking today. SEED-044 explicitly needs the consolidated component to grow NEW capabilities it doesn't have anywhere yet: an "Unlink client" action (`unlinkProjectFromClient` already exists in `lib/actions/project.ts` but no picker calls it) and possibly inline client creation. If those new capabilities are added as component-specific escape hatches (a special prop only the document's usage sets) rather than first-class, testable options on the shared component's public API, the fork starts immediately.

**How to avoid:**
Design the shared component's props around capability flags from day one — e.g. `<ClientPicker projectId trigger="button"|"card"|"inline" allowCreate={boolean} allowUnlink={boolean} onSelect />` — and have each of the 3+ call sites (floating pill, client-tab no-client state, document Bill-To) pass explicit flags rather than each maintaining its own copy. Write one shared test suite (search/filter/select/create/unlink) that all call sites exercise via the same component, so a future capability change is visible everywhere it's used instead of file-local.

**Warning signs:**
- A new file named something like `bill-to-client-picker.tsx` or `client-link-popover-v2.tsx` appears that is 80% similar to the "shared" component instead of extending it.
- `allowCreate`/`allowUnlink` implemented as a conditional inside the shared component keyed off which page it's rendered on, rather than an explicit prop the caller sets.
- Only 1 of the 3 call sites gets updated to the new shared component while the other 2 keep their pre-milestone implementations "for now."

**Phase to address:**
"Bill To Editing" phase (SEED-044 phase 3) — the shared-component extraction should happen BEFORE the new unlink/create capabilities are designed, so the capability API is designed once, not retrofitted onto three call sites separately.

---

### Pitfall 8: `estimate_deliveries` schema can't represent the new `format × channel` model — delivery/analytics logging silently fails or is quietly skipped

**What goes wrong:**
The Send Hub ships with new delivery actions (copy link, open preview, download PDF, mark-as-sent via plain text) that attempt to log to `estimate_deliveries`, but the insert either throws (CHECK constraint violation, if the app surfaces the error) or the app's existing "fire-and-forget, ignore analytics failures" pattern silently swallows it (as `logEstimateView` does today, L55-57 of the share page) — so nothing appears broken in the UI, but delivery history/audit for the new formats never gets recorded.

**Why it happens:**
`estimate_deliveries.channel` has a hard CHECK constraint. It has already been widened once via a deliberate `DROP CONSTRAINT` + `ADD CONSTRAINT` migration (`20260526000005_phase81_whatsapp_delivery_channel.sql`, adding `'whatsapp'` to what was `('email','sms')`) — that precedent exists and must be followed again, but today the constraint is still only `IN ('email', 'sms', 'whatsapp')`. SEED-042's own delivery model explicitly wants `channel: copy | open | download | email | sms | whatsapp | manual` — 4 new values not yet in the CHECK — and a `format: online_link | pdf | plain_text` dimension that has **no column at all** in the current schema (only `channel`, no `format`).

**How to avoid:**
Add the migration (mirroring the `20260526000005` DROP+ADD pattern) to widen `channel` and add a `format` column (or a compatible metadata JSONB field, per SEED-042's own decision #7) in the SAME phase that starts emitting these new values — not after the UI ships. Since this is a genuinely new table shape, decide explicitly per SEED-042 decision #7 whether `copy`/`open`/`download` (client-only, no server round-trip) even belong in `estimate_deliveries` (a server-side delivery-attempt table) versus a lighter client-analytics event, rather than forcing every UI action through a table designed for email/SMS/WhatsApp provider send-attempts.

**Warning signs:**
- Send Hub UI PRs that add `channel: 'copy'` or `channel: 'download'` insert calls without an accompanying migration in the same phase.
- Supabase logs (`get_logs`/`get_advisors` via the Supabase MCP tools) showing recurring CHECK-constraint violations on `estimate_deliveries` after this milestone ships.
- No delivery rows ever appearing for "Copy Link" / "Download PDF" actions in QA, despite the buttons visibly working.

**Phase to address:**
"Delivery APIs + Templates" phase (SEED-042 phase 3) — the migration must land before or alongside the first UI action that logs a new channel/format value; "Logging + Tests" phase (SEED-042 phase 4) should include a schema-level test asserting all planned format×channel combinations are insertable.

---

### Pitfall 9: The mobile visual rewrite is verified at one viewport (375px) that isn't even one of the three the seed asks for, and "resize the browser" verification misses real touch regressions

**What goes wrong:**
SEED-043 explicitly requires screenshot verification "at 360px, 390px, and 430px widths" plus real iOS Safari/Android Chrome touch verification. The rewrite ships looking great in the PR screenshots, but those screenshots were taken by resizing a desktop Chrome window (which reports pointer capabilities, hover state, and default tap-highlight behavior differently from a real touchscreen) at whatever width was convenient — commonly 375px, not the three specified widths — and a control that's fine at 375px clips text or overlaps at 360px (the narrowest common Android width) or looks sparse/misaligned at 430px (iPhone Pro Max).

**Why it happens:**
The project's own existing Playwright visual-regression harness (`tests/e2e/visual/_helpers.ts`) defines exactly ONE mobile viewport: `{ name: 'mobile', width: 375, height: 812 }` (L6) — none of 360/390/430 are currently automated anywhere in the repo. Without deliberately adding new viewport entries, "visual verification" for this seed will default to whatever the existing harness already covers (375px only), which technically passes CI but doesn't fulfill the seed's own stated bar. Separately, `hover:` and `group-hover:` interaction patterns used elsewhere in this exact document (e.g. `ProjectTitle`'s edit-pencil, L119 of `project-title.tsx`: `opacity-60 sm:opacity-0 sm:group-hover:opacity-100`) already show the team is aware that hover ≠ touch discoverability — but a rewrite focused purely on "looks like desktop" density could regress that awareness for new mobile-only controls if hover-revealed affordances are copied in without the sm:-gated always-visible-on-touch pattern.

**How to avoid:**
Extend `tests/e2e/visual/_helpers.ts`'s `viewports` array with the three widths the seed asks for (at minimum for the estimate document / mobile line-item route) before claiming this seed's UI work is verifiable, and capture baselines at all three. For touch verification specifically, don't rely on resized-desktop-Chrome screenshots alone — either use Playwright's mobile device emulation (`devices['iPhone 12']`/`devices['Pixel 5']`, which sets `hasTouch: true` and correct DPR) for interaction tests, or require a real-device manual pass before sign-off, since desktop Chrome resize does not exercise `:hover`-vs-touch discoverability bugs at all.

**Warning signs:**
- PR screenshots attached only at one width, or captured via manual window resize rather than named device presets.
- New viewport entries never added to `tests/e2e/visual/_helpers.ts`.
- Any newly-introduced `hover:` / `group-hover:`-only affordance on a control that only exists in the mobile layout (no touch-visible fallback).

**Phase to address:**
"Visual verification" task within SEED-043's own phase — should be promoted to an explicit phase success-criterion ("baselines exist at 360/390/430 + one desktop, in `tests/e2e/visual/`"), not left as a manual, easy-to-shortcut checklist item.

---

### Pitfall 10: Shrinking mobile line-item controls to desktop-like density silently drops the 44px touch targets this exact component was already tuned to have

**What goes wrong:**
The rewritten mobile item editor visually matches the desktop table's compactness (the seed's explicit goal) but the interactive elements — remove button, taxable toggle, unit select, discount input — shrink along with the surrounding whitespace, dropping below a comfortable real-thumb tap size. It looks like a win in a screenshot; it's measurably worse to actually use on a phone.

**Why it happens:**
The current `ItemCardMobile` (`components/workspace/estimate/item-card-mobile.tsx`) already has deliberate, commented touch-target engineering from a past phase: `min-h-[44px]` on the taxable-toggle wrapper (L134) and `h-9 w-9 min-h-[44px] min-w-[44px]` on the remove button (L156), with an explicit code comment: *"Mobile-safe: numeric keypad via MoneyInput, 44px tap target on the toggle row"* (L119-120). SEED-043 asks for "32-36px visual control height where possible" — a real, intentional tension between "looks document-native/compact" and "the 44px minimum this file was already tuned to." A pure visual rewrite optimizing for the screenshot-density goal can regress the touch-target goal without anyone noticing, because both goals live in the same component and only one of them shows up in a static screenshot.

**How to avoid:**
Treat 44px as the tap-*target* size (via padding/hit-slop or `min-h-`/`min-w-` on the interactive wrapper), decoupled from the *visual* control height (which can legitimately shrink to 32-36px). This is exactly what the current code already does for the remove button (`h-9` visual height + `min-h-[44px]` hit area) — carry that same pattern forward for every new compact control (Select trigger, Switch, any tap targets in the "mobile table card" alternate layout), rather than only preserving it for the elements that happened to already have it.

**Warning signs:**
- New compact controls where the visible box height AND the clickable/tappable area are the same shrunk value (no `min-h-[44px]`/padding hit-slop separating them).
- Any control's computed bounding box <44px in both dimensions in a real-device inspector, even if it "looks right" in a screenshot.

**Phase to address:**
Same phase as Pitfall 9 (SEED-043's implementation phase) — should be a named acceptance check ("every interactive control's tappable area is ≥44×44px, verified via computed styles, independent of visual size"), and it should be checked against the decision the seed itself flags as open ("What is the minimum acceptable touch target for dense estimate editing").

---

### Pitfall 11: The document already has two independently-diverged inline-rename implementations for "the same" concept — fixing one (the dotted underline) without reconciling the other propagates the weaker one forward

**What goes wrong:**
SEED-044 targets `InlineProjectName` inside `estimate-document.tsx` for its underline fix and suggests extracting "shared inline editable text styles for project name, estimate number, dates, and future client field editing." But there is already a SECOND, more mature inline-rename component for what is conceptually the same field (project name) — `components/workspace/project-title.tsx`'s `ProjectTitle` — and the two have already drifted:

| Behavior | `InlineProjectName` (estimate-document.tsx L1421-1467) | `ProjectTitle` (project-title.tsx) |
|---|---|---|
| Edit affordance discoverability | Dotted underline only, no icon | Always-visible Pencil icon on mobile, hover-revealed on desktop |
| Escape to cancel | Yes | Yes |
| Length validation | None | Yes (200 char max, empty check, with toast) |
| Error handling on save failure | Silently closes edit mode either way (`finally` block) | Reverts draft but **keeps editing open** so the user can retry |
| No-op detection (unchanged value) | Implicit (`trimmed === name` skips) | Explicit early-return with the same check |

If the underline fix is applied to `InlineProjectName` in isolation (the narrow reading of the seed), the weaker implementation (no validation, no error-retry) ships polished-looking but behaviorally worse than the sibling component sitting one directory over — and if it's used as the template for the NEW Bill-To client editor (which SEED-044 also builds), the gap propagates to a third component.

**Why it happens:**
The two components were built at different times for slightly different contexts (project header vs. embedded document) and nobody has since unified them, because visually they look unrelated (one is a page `<h1>`, one is a document field). This milestone is the first time anyone is asked to think about "shared inline editable text styles" explicitly, which is exactly the moment this kind of quiet regression either gets fixed for good or gets baked in a third time.

**How to avoid:**
Before styling `InlineProjectName`'s underline, diff it against `ProjectTitle` for behavior (not just look) and decide once whether to extract a single shared inline-edit-text primitive (hook or component) both consume, carrying forward `ProjectTitle`'s validation + error-retry behavior. Build the new Bill-To client-edit affordance on top of that same shared primitive/pattern, not a third bespoke implementation.

**Warning signs:**
- The underline fix ships as a pure CSS/className change to `InlineProjectName` with no discussion of the behavioral gap above.
- The new Bill-To editable-field affordance is built as yet another bespoke inline-edit implementation rather than reusing whatever came out of reconciling the first two.

**Phase to address:**
"Inline Edit Polish" phase (SEED-044 phase 2) — should explicitly scope in `ProjectTitle` as a comparison/consolidation target, not just `InlineProjectName` in isolation, per the seed's own decisions-to-lock item #1.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Wire the new `presentation_settings` flags into the editor + modern share/PDF only, deferring the classic renderers ("modern" is the newer/preferred template) | Ships faster, covers the template most new estimates likely use | Any tenant on `estimate_template_style = 'classic'` (the fallback for unrecognized/legacy values per `estimate-view.tsx` L182-186) gets a client-visible mismatch between what the owner configured and what renders | Only acceptable if explicitly scoped out in the phase plan AND a visible warning/fallback exists in the editor when a classic-template company edits settings that won't apply |
| Keep `estimate_deliveries.channel` logging only for the 3 existing values (email/sms/whatsapp) and skip logging `copy`/`open`/`download`/`manual` entirely for v1 | Avoids a migration in this milestone | Loses delivery-history/audit visibility for what the seed calls the "highest-value moment in Xtimator" — no data to answer "did the owner ever actually send this?" for link-copy-only flows | Acceptable ONLY if explicitly decided (SEED-042 decision #7) and documented, not silently dropped |
| Generate `companySlug` once at company creation and never re-derive it when the company renames | Simpler, no link-breaking on rename | If slugs DO get regenerated on rename instead, every previously-shared friendly link 404s — a real regression the milestone must avoid | Never acceptable to silently regenerate; if renaming is supported, the slug must either stay stable or old slugs must keep resolving |
| Ship the mobile item rewrite verified only via Playwright emulation (no real-device pass) | Faster, fully automatable | Playwright's touch emulation doesn't catch every real iOS Safari quirk (e.g. 100vh/safe-area, momentum scroll, native date/number keyboard behavior) that this project's own CLAUDE.md flags as a real constraint ("Audio recording and camera capture must work on iOS Safari and Android Chrome") | Acceptable for the visual-density work; NOT acceptable as the only verification for touch-target/interaction work given the project's known iOS Safari sensitivity (see also the iOS PWA session-cookie issue already on file for this project) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Supabase RLS (public estimate lookup) | Adding a new anon-readable RLS policy scoped by slug/company to make the friendly route "simpler" client-side | Keep ALL public estimate reads on `requireServiceClient()` with exact-match filtering (the pattern that replaced the exact policy this milestone must not reintroduce — see Pitfall 3) |
| Stripe Checkout success/cancel redirect | Updating `success_url`/`cancel_url` construction in `lib/billing/connect-webhook.ts` to the new friendly format without confirming the new route still parses `?stripe=success`/`?stripe=canceled` | Explicitly re-run `tests/e2e/estimate-share-payment.spec.ts` (and `visual/share.spec.ts`) against whichever URL shape is live for a given estimate before considering the URL migration done |
| WhatsApp / SMS estimate sends | Each of `lib/whatsapp/send-estimate.ts`, `lib/whatsapp/confirm-actions.ts`, and `app/api/estimates/[id]/send-sms/route.ts` builds its own share-link string inline — a new format change requires editing all three independently, and it's easy to update the visible Send UI paths while forgetting the WhatsApp confirm-flow (`confirm-actions.ts`), which is triggered from conversational flows, not the Send dialog | Route every share-URL construction through one shared builder function (see Pitfall 5) so a future format change is a one-file edit, not a grep-and-hope |
| `estimate_deliveries` CHECK constraints | Assuming the existing `('email','sms','whatsapp')` CHECK already covers "channel" conceptually and building the new format×channel model on top without a migration | Follow the exact `DROP CONSTRAINT` / `ADD CONSTRAINT` precedent already used once in `20260526000005_phase81_whatsapp_delivery_channel.sql` |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Friendly-URL lookup does 2 sequential queries (resolve company by slug, then estimate by slug within that company) instead of 1 indexed query | Public share page feels slightly slower than the current single `.eq('share_token', token)` lookup, more pronounced under load | Add a composite index on `(company_id, estimate_slug)` or equivalent, and consider denormalizing the resolved slug pair onto the estimate row so a single query resolves it, mirroring the existing single-query token lookup | Noticeable once share-page traffic exceeds a few requests/sec per instance; low risk at current ~18-tenant scale but worth avoiding by design since it's free to get right now |
| `estimate_deliveries` gains high-frequency inserts for `copy`/`open` events if those are logged there | Table grows much faster than the email/SMS/WhatsApp send-attempt volume it was designed for; per-estimate delivery-history UI becomes noisy/slow | Keep lightweight client-side actions (copy, open-preview) out of the delivery-attempt table, or add an index/partition strategy if they must live there (see decision #7 in SEED-042) | Not urgent at current scale, but worth deciding deliberately rather than accidentally coupling analytics volume to a table with RLS policies designed for provider webhooks |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Treating the new short public-token suffix as "just a nicer URL" rather than a bearer credential with the same sensitivity as `share_token` | Weak entropy or leaking the suffix in a log/analytics payload exposes the same PII (owner+client name/email/phone/address) the original `share_token` protects | Apply identical handling discipline: never log the full friendly URL server-side in a way that's broadly readable, never include it in a payload sent to third-party analytics, same TTL/expiry enforcement as `share_token` (Pitfall 6) |
| Company-slug collisions resolved by silently appending a numeric suffix (`skale-club`, `skale-club-2`) without checking uniqueness is enforced at the DB level | Two companies could theoretically resolve to overlapping/ambiguous slugs under a race condition (two companies signing up simultaneously with the same name) | Enforce slug uniqueness with a DB-level unique constraint/index, not just application-level "check then insert" (TOCTOU race) |
| Public estimate route (`app/estimate/...`) has no rate limiting today and the new friendly route inherits that as-is | A suffix-guessing/enumeration attack against the new format is only as hard as the suffix's raw entropy, since there's nothing slowing repeated attempts | Consider basic rate limiting (even coarse, e.g. per-IP) on the public estimate route as part of this milestone, since it now has a second, potentially-weaker-entropy lookup path alongside the UUID one |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Gear settings panel shows the SAME toggle set as the existing `AddDetailsPopover` ("+Add Details") button, both visible in the UI at once | Owner doesn't know which control to use, or uses one and is confused the other doesn't reflect the change | Either merge them into one control or clearly differentiate "add content" (empty→filled) from "hide/show existing content" (the new settings panel) — see Pitfall 2 |
| Format-first Send hub defaults change (Online Estimate first, replacing Email/SMS tabs) without migrating the "remembered last channel" expectation some owners have built habit around | Owners who always used Email now have to re-learn where their familiar action lives | SEED-042 itself asks this as decision #6 ("default to Online Estimate, or remember the user's last used format/channel") — resolve explicitly, don't let it default silently to "always Online Estimate" without checking whether that breaks an established owner habit |
| Bill-To inline client editor and the floating-pill `LinkClientButton` both exist on the same estimate page after SEED-044 ships, doing overlapping things (both can change the linked client) from two different visual locations | Owner doesn't know if changing the client in one place also updates the other, or which is "the" way to do it now | Once the Bill-To block is editable, consider whether the floating-pill `Link Client` control becomes redundant for estimates that already have a client (vs. its real job today: initial linking on a client-less project) and scope its visibility accordingly |

## "Looks Done But Isn't" Checklist

- [ ] **Settings panel toggle**: Often looks done after the editor preview updates — verify the SAME toggle change is reflected in the actual PDF download, the actual public share URL (both classic and modern templates), and the actual plain-text/WhatsApp message body, not just the in-app preview.
- [ ] **Friendly URL**: Often looks done once the new route renders the estimate — verify `viewed_at`, `estimate_activity` view logging, and low-balance/notification email triggers (`notify_on_view`) still fire correctly when accessed via the friendly path, not just via the legacy token path.
- [ ] **Old share links**: Often looks done because "the old page still exists" — verify links already sent to real clients weeks ago (pre-milestone `share_token` values, no `share_expires_at` set = legacy "never expires" per `20260606000003`'s own comment) still resolve after this milestone ships, including through a full deploy cycle.
- [ ] **Client picker consolidation**: Often looks done once the 3 known call sites are updated — verify no 4th/5th caller was missed (this research found the undocumented `LinkClientInline`/`ClientSearchList` pair inside `estimate-document.tsx` that isn't named in the seed's own "Candidates to consolidate" list).
- [ ] **Mobile line-item rewrite**: Often looks done from PR screenshots at a single convenient width — verify at 360px, 390px, AND 430px per the seed's own explicit requirement, plus a real iOS Safari and Android Chrome pass, not just Chrome DevTools device toolbar.
- [ ] **estimate_deliveries analytics**: Often looks done because the Send Hub buttons all work in the UI — verify the DB actually accepts an insert for every new format/channel combination (no CHECK-constraint violations swallowed silently by a fire-and-forget pattern).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| Settings drift shipped (PDF/plain-text ignore a toggle) | LOW | Since the underlying data (`presentation_settings`, section content) is still intact and non-destructive per Pitfall 2's fix, this is a pure rendering-logic bug — patch the missed renderer to call the shared resolver; no data recovery needed if Pitfall 2's non-destructive design was followed |
| Friendly-URL RLS/anon-leak regression shipped | HIGH | Immediately drop/patch the offending policy (mirror the exact `DROP POLICY IF EXISTS` pattern from `20260606000002`), rotate/regenerate affected short-suffix tokens if any evidence of scraping exists, audit `estimate_activity`/access logs for anomalous view patterns across many estimates from one source |
| Old share links broken by the URL migration | MEDIUM | Because `share_token` and `share_expires_at` are untouched columns (only the resolution path changes), recovery is a routing fix — restore the legacy token route's lookup path; no data loss since the token itself is never removed from the estimate row |
| Client-picker consolidation dropped an inline-create capability a call site needed | LOW | Since `linkProjectToClient`/`unlinkProjectFromClient` already exist as stable server actions independent of the picker UI, re-adding a capability flag to the shared component is a UI-only fix, no data migration |
| Mobile touch-target regression shipped (controls too small) | LOW | Pure CSS/hit-slop fix (`min-h-`/`min-w-` or padding) on the affected controls; no data or architecture change needed if Pitfall 10's separation of visual size vs. tap target wasn't followed initially |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 1. Settings-drift across renderers | Renderer Application + Tests (SEED-041 ph.3) | Single shared visibility/settings resolver imported by all 5+ renderers; a test that toggles one setting and asserts identical section presence across editor, classic share, modern share, classic PDF, modern PDF, and plain-text output |
| 2. Destructive vs. non-destructive hide collision | Settings Model + Persistence (SEED-041 ph.1) | Explicit decision recorded in plan; test that hiding a filled section preserves the underlying text in the DB and restores it on re-show |
| 3. Anon RLS / slug-lookup PII leak | URL Contract + Data Model (SEED-042 ph.1) | No new anon-readable RLS policy added to `estimates`; negative test using an anon Supabase client attempting a slug-only read |
| 4. Weak/guessable short suffix | URL Contract + Data Model (SEED-042 ph.1) | Suffix generation reviewed for entropy (≥60 bits, CSPRNG source); rate-limiting or existence-oracle mitigation considered |
| 5. Scattered URL builders / Stripe redirect regression | URL Contract + Data Model → Delivery APIs + Templates (SEED-042 ph.1 & ph.3) | Grep for remaining literal `/estimate/${` constructions after the phase == near-zero; Stripe success/cancel e2e re-run against both URL shapes |
| 6. View-logging/expiry silently broken on new route | URL Contract + Data Model (SEED-042 ph.1) | `logEstimateView`/`respondToEstimate`/`getShareLinkState` explicitly wired with the estimate's real `share_token`; test asserts `viewed_at` updates via a friendly-link open |
| 7. Client-picker consolidation re-forks | Bill To Editing (SEED-044 ph.3) | Shared component with explicit capability props (`allowCreate`/`allowUnlink`/`trigger`); one shared test suite exercised from all call sites |
| 8. `estimate_deliveries` schema can't hold new format×channel | Delivery APIs + Templates (SEED-042 ph.3) | Migration lands widening `channel` CHECK / adding `format` column before/alongside first UI action logging a new value; insert test for every planned combination |
| 9. Mobile verified at wrong/single viewport | SEED-043's implementation phase | `tests/e2e/visual/_helpers.ts` viewports extended to 360/390/430; baselines captured and reviewed at all three plus desktop |
| 10. Compact rewrite drops 44px touch targets | SEED-043's implementation phase | Computed tap-area check (≥44×44px) on every interactive control, independent of visual size, on a real device or Playwright touch-emulated device preset |
| 11. Two diverged inline-rename implementations | Inline Edit Polish (SEED-044 ph.2) | `ProjectTitle` explicitly compared/reconciled with `InlineProjectName` before/alongside the underline fix; new Bill-To editor built on the reconciled pattern, not a third bespoke one |

## Sources

- Direct codebase inspection (HIGH confidence, primary evidence for every pitfall above):
  - `lib/queries/share.ts`, `app/estimate/[token]/page.tsx`, `app/estimate/[token]/actions.ts`, `lib/estimates/share-link.ts`, `lib/utils/share-link.ts`
  - `supabase/migrations/20260606000002_drop_estimates_anon_select_policy.sql` (documents a real, previously-fixed PII-leak vulnerability on this exact table)
  - `supabase/migrations/20260606000003_estimates_share_expires_at.sql`, `20260409000001_initial_schema.sql`, `20260519000003_estimate_deliveries.sql`, `20260526000005_phase81_whatsapp_delivery_channel.sql`
  - `components/workspace/estimate/estimate-document.tsx`, `components/workspace/estimate/item-card-mobile.tsx`, `components/workspace/project-title.tsx`
  - `components/share/estimate-document-modern.tsx`, `components/share/estimate-view.tsx`, `components/pdf/estimate-pdf-modern.tsx`, `components/pdf/estimate-pdf.tsx`
  - `components/workspace/link-client-button.tsx`, `components/workspace/link-client-card.tsx`
  - `lib/estimate/compute-totals.ts`, `lib/utils/estimate-template.ts`
  - `lib/whatsapp/send-estimate.ts`, `lib/whatsapp/confirm-actions.ts`, `lib/billing/connect-webhook.ts`, `app/api/estimates/[id]/send-sms/route.ts`
  - `tests/e2e/visual/_helpers.ts`, `tests/e2e/visual/share.spec.ts`, `tests/e2e/estimate-share-payment.spec.ts`
- Project source of truth (HIGH confidence): `.planning/PROJECT.md` (v4.18 milestone section, prior-milestone retrocompat discipline e.g. v4.11/v4.13 byte-identical math precedent), `.planning/seeds/SEED-041..044-*.md`

---
*Pitfalls research for: Xtimator v4.18 Estimate Document & Send Experience Refresh*
*Researched: 2026-07-08*
