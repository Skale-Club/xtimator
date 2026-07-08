# Feature Research

**Domain:** Estimate/Quote document, per-document settings, and client-send experience — US service-business estimating/invoicing SaaS (Jobber, ServiceTitan, Housecall Pro, HoneyBook, PandaDoc, Proposify, Invoice Ninja, QuickBooks, Dubsado, Contractor+, Joist, plus URL-pattern precedents from Notion/Stripe)
**Researched:** 2026-07-08
**Confidence:** MEDIUM-HIGH (direct competitor help-docs verified via WebFetch for Housecall Pro and PandaDoc; multiple-source WebSearch corroboration for the rest; a few claims — Bonsai inline client editing, exact PandaDoc override hierarchy — are LOW confidence and flagged inline)

This research answers 4 targeted questions for Xtimator's v4.18 milestone (SEED-041..044), not a full ecosystem survey. It maps directly onto the milestone's 4 target features.

## Question-by-Question Findings

### (a) Per-document settings that override company defaults

**Closest direct analog: Housecall Pro's "Adjust Individual Estimate Settings"** (same industry — US home-service contractors). Verified via their help docs:
- Per-estimate toggles override "Default Estimate Settings" (company-wide) without touching other estimates ("ad hoc changes will only affect that specific estimate").
- Covers: estimate number/date, message, view format, business/customer info visibility, per-line-item field visibility (name/description/qty/unit price/amount/subtotal), multi-option consolidation/reorder.
- **Critical rule, directly validates SEED-041's "avoid destructive hiding" principle:** unchecking a field only hides it from the customer-facing PDF/view — "it does not delete the information from the job itself," and dollar amounts still accrue toward totals even when hidden. Presentation and calculation are explicitly decoupled.
- One thing is permanently locked regardless of settings: company address cannot be removed from estimates — a precedent for "some fields are calculation/legal-adjacent and should not be hideable."

**Contractor+ (construction-specific)** — discount before/after tax is configurable, deposit default is configurable, tax scope is labor/materials/both. Load-bearing finding for SEED-041 decision #3 (tax-off semantics): **settings changes only apply to draft/new estimates going forward — already-approved/sent estimates are NOT retroactively recalculated.** This is a settings-snapshot pattern, not a live-recompute-on-every-view pattern.

**Invoice Ninja** — layered override hierarchy: company defaults → client-group settings → individual client settings → per-invoice override (e.g., a client's "auto-add to invoice" preference can be overridden on one invoice without touching the client record). Also line-level vs invoice-level tax as an explicit either/or choice, not both simultaneously.

**PandaDoc** — workspace-level "Document settings" (delivery method default, expiration, theme, currency) explicitly documented as overridable "on a per template basis and a per document basis," though the precise UI mechanics of that override weren't detailed in their public docs (LOW confidence on exact mechanics, MEDIUM confidence the capability exists).

**Section/column visibility as a standard proposal-software pattern** — GoProposal, HubSpot Quotes, Qwilr, Better Proposals, and QuoteCloud all ship show/hide toggles for sections, line items, and pricing-table columns (qty, unit price, discount, totals). This is table-stakes across the whole proposal-software category, not just service-business tools, and confirms SEED-041's "Document Sections" panel concept (Summary/sections/payment terms/timeline/warranty/notes/photos) is an established pattern, not a novel one.

### (b) Send flow: artifact-first vs channel-first

**The category is mid-migration from channel-first to artifact/link-first, and the leaders have already moved.**

- **Jobber** (closest strategic analog to SEED-042): sending via *either* email or SMS delivers the client to the same **Client Hub** — an interactive online view where the client can approve, request changes, pay a deposit, or select optional line items — plus a PDF is generated for their records. Jobber explicitly does NOT auto-attach the PDF to email; the link/portal is primary, PDF is an on-demand secondary download from inside the hub. This is the strongest evidence supporting SEED-042's "Online Estimate is primary, PDF secondary" design.
- **ServiceTitan** — the online estimate link (`{OnlineEstimateLink}` merge tag) is embedded in customizable email templates and carries business-unit branding (logo, name, contact) automatically. Channel (email today, others via template) is the delivery wrapper around one link-based artifact.
- **HoneyBook "Smart Files"** — goes further than artifact-first: it collapses proposal + contract + invoice into ONE shareable link/experience ("choose package → sign contract → pay invoice" as one continuous flow), rather than separating format at all. Relevant secondary finding: clients can **view** a smart file via link/email with no login, but **sensitive actions** (sign, pay) require an emailed verification code — a useful precedent for "no-login viewing, gated action" that Xtimator's public estimate page already follows.
- **Dubsado** — still fundamentally an email-first tool (canned emails), but bundles multiple artifact links (contract + invoice + portal) into a single message via "smart field links," rather than picking one channel tab.
- **Legacy channel-first pattern still in the market:** Housecall Pro and QuickBooks Online both default to Email/SMS as the top-level choice, with PDF-attach as a checkbox/setting inside that channel — i.e., today's Xtimator `SendForm` pattern (Email/SMS tabs, PDF as attach-checkbox) matches the *older*, not the *emerging*, convention.

**Emerging best practice (MEDIUM-HIGH confidence, triangulated across Jobber/ServiceTitan/HoneyBook):** organize the top-level choice around the **artifact** (interactive online link > PDF > plain text), because only the online artifact supports interactivity (approve, pay deposit, select options) that a static PDF or text message cannot. Channel (email/SMS/WhatsApp/copy/download) becomes a secondary "how do you want to deliver this" decision nested under the chosen artifact — which is exactly SEED-042's proposed structure.

### (c) Friendly/branded public document URLs

Three real precedent patterns exist in the wild, spanning the full readability↔security tradeoff:

1. **Notion (readable-slug + opaque suffix, "hybrid" pattern):** URL shape is `{title-slug}-{long-hex-id}` (e.g. `Arpit-Dalal-115f0f16d2cd80ea8cf0d37ffb8ccfdf`). The slug is cosmetic/SEO-flavored; the actual lookup key is the trailing high-entropy ID, so renaming the source title doesn't break old links, and the ID portion alone remains unguessable even though a human-readable prefix is exposed. **This is structurally identical to SEED-042's Option 1 (`/estimate/{companySlug}/{estimateSlug}-{shortPublicToken}`).**
2. **Stripe Payment Links (fully opaque):** `buy.stripe.com/{opaque-id}` — no readable component at all. Prioritizes unguessability/simplicity over branding; relies entirely on the shared domain for trust signal, not the path.
3. **Proposify (branded custom domain + opaque slug):** tenants configure a CNAME (`proposals.yourdomain.com`) so the *domain* carries the brand, while the path segment itself stays an opaque "gibberish" identifier. Readability is achieved at the domain level, not the path level — and this requires the tenant to own/configure DNS, a heavier lift than Xtimator's shared-domain approach.

**Conclusion (MEDIUM-HIGH confidence):** nobody in this research ships a *purely* human-readable path with zero entropy for a financial/client document — that would be the anti-pattern. The two viable, observed approaches are (i) readable-prefix + high-entropy suffix on a shared domain (Notion-style — matches SEED-042's locked-in direction) or (ii) opaque path + branded custom domain (Proposify-style — a heavier, DNS-dependent alternative). Given Xtimator's tenants won't all configure custom domains, the Notion-style hybrid is the correct default, with true custom-domain white-labeling remaining a possible future differentiator, not a v1 requirement.

### (d) Inline editing of the client/recipient block on the document

This is the one area where the milestone's proposed feature (SEED-044's hover-to-edit "Bill To" with a pencil icon directly on the document canvas) goes **beyond** what any researched competitor documents publicly:

- **PandaDoc** allows changing recipient details ("Edit Personal Details") or the signer entirely ("Change Signer") after a document is sent — but as a dedicated recipient-management action/panel, not an in-canvas hover-and-click edit on the document body itself. Critically, editing a sent document's *content* (as opposed to just recipient metadata) **erases any signature/initials fields already completed**, specifically to protect a signer from having signed an altered document — an integrity guardrail worth carrying into Xtimator's design.
- **DocuSign** allows recipient changes ("Correct") only while an envelope is still "Waiting for Others"/"Needs Action" — never on a completed envelope. Recipient identity is treated as locked once the document has been acted upon.
- **Bonsai** — no confirmed evidence of literal inline client-block editing on the document surface; their flow routes through a separate "Invoice Preview Page" for edits (LOW confidence finding — could not verify either way).

**Conclusion:** true in-canvas "hover reveals pencil beside Bill To → click → popover picker → swap client" is not an established competitor pattern — it is a genuine differentiator opportunity for Xtimator, not a table-stakes gap to close. The one universal safety principle that DOES transfer from PandaDoc/DocuSign: **once an estimate has been sent/viewed/accepted, changing the linked client (or its details) should not happen silently** — competitors gate this by document status specifically to avoid an accepted/signed document silently pointing at different client data after the fact.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-estimate override of tax/discount/deposit, scoped to that estimate only | Housecall Pro, Contractor+, Invoice Ninja all ship this; owners expect "this one job is different" flexibility | MEDIUM | Builds directly on the v4.11 (SEED-032) per-item tax/discount/deposit model + `compute-totals.ts`; this milestone adds the UI surface, not new math |
| Hiding a section/field only changes presentation, never deletes underlying data or recalculates totals silently | Housecall Pro explicit behavior: hidden fields still accrue to totals; unhiding restores them | LOW-MEDIUM | Directly matches SEED-041's "avoid destructive hiding" rule already written into the seed |
| Section/column visibility toggles (summary, line detail, qty/unit price, terms, notes) | Standard across GoProposal, HubSpot Quotes, Qwilr, Better Proposals, QuoteCloud | LOW-MEDIUM | Confirms SEED-041's "Document Sections" panel concept is industry-normal, not novel |
| Link/portal as the primary send artifact, with PDF generated on demand rather than force-attached | Jobber's Client Hub model is the category leader; ServiceTitan mirrors it | MEDIUM | Core of SEED-042; the online link enables interactivity a PDF cannot |
| Same artifact deliverable through multiple channels (email, SMS, copy) without changing its content | Jobber and Housecall Pro both deliver the identical estimate via email OR SMS | LOW | Already partially true in Xtimator; format-first reorg formalizes it |
| Company branding (logo, name, colors) auto-applied to the public/shared view | ServiceTitan pulls branding automatically from the business unit for portal + link | LOW | Already exists in Xtimator's share page; must survive the URL/UI rework |
| Recipient can view a shared estimate with no login/account required | Universal across Jobber Client Hub, HoneyBook Smart Files (view without a code), ServiceTitan | LOW | Already true for Xtimator's `/estimate/{token}` page; must be preserved under the new URL scheme |
| Old share links keep working after a URL-format change | Implicit expectation any time a URL scheme changes; Notion/Stripe both decouple lookup-by-ID from display-slug specifically to allow this | MEDIUM | Explicitly required by SEED-042; backward-compat with existing `share_token` |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| In-canvas hover-to-edit "Bill To" block (pencil icon → popover picker) | No researched competitor (PandaDoc, DocuSign, Bonsai) does true in-canvas recipient editing — they use separate recipient-management panels | MEDIUM | SEED-044; genuine UX lead if executed cleanly, not a parity gap |
| 3 equal top-level format choices (Online / PDF / Plain Text) fully replacing channel tabs | Housecall Pro and QuickBooks still default to channel-first (Email/SMS) with PDF as an attach-checkbox; even Jobber/HoneyBook lean link-first without fully exposing 3 peer format choices in one hub | MEDIUM-HIGH | SEED-042's core reorg — ahead of the observed market, not merely catching up |
| Human-readable branded URL on the shared domain with no tenant DNS setup required | Proposify requires a paid custom-domain/CNAME setup to get readability; Xtimator gets `xtimator.com/estimate/{companySlug}/{estimateSlug}-{token}` readability by default | MEDIUM | SEED-042; matches the Notion hybrid pattern, zero setup burden on the tenant |
| Single consolidated "settings for this estimate" panel (pricing + section visibility + presentation) opened from a gear near Send | Competitors scatter this: Housecall Pro nests it inside the send flow's preview step; PandaDoc keeps document settings at account/template level with override mechanics not clearly exposed at document level | MEDIUM | SEED-041; a genuinely more discoverable single point of control |
| Mobile line-item editor with true visual parity to desktop (same document language, not a distinct card-based mobile form) | Joist — the cleanest mobile-first competitor researched — still uses a visually distinct mobile card treatment rather than a literal responsive version of its desktop table | MEDIUM | SEED-043; exceeds the current best-in-class mobile bar (Joist), not just matches it |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Exhaustive per-field toggle sprawl (show/hide/lock dozens of individual fields, mirroring HubSpot Quotes' granular section-by-section control) | Feels like "maximum control" for power users | Cognitive overload on exactly the screen (right before Send) where speed and confidence matter most; documented complexity-fatigue pattern in enterprise software (Salesforce/Workday-style criticism: "more options, more problems") | Segmented high-level controls (Default/Custom/Off for tax; on/off toggles for whole sections, not individual sub-fields) — already SEED-041's stated direction; defer granular per-field toggles unless real usage data demands them |
| Fully opaque, non-readable public URLs as the only option (Stripe Payment Links style) | Maximizes unguessability with minimal engineering | Reads as generic/untrustworthy to a client receiving a link from a small local business — undermines the "professional, branded" goal that motivated this milestone | Notion-style hybrid (readable prefix + secret suffix) — already the locked SEED-042 direction |
| Letting per-estimate settings changes silently recompute totals on an estimate the client has already viewed/accepted/paid a deposit on | Feels convenient — "always show the latest configured price" | Breaks client trust (approved total changes underneath them), breaks deposit/payment reconciliation already in flight; Contractor+ explicitly freezes settings on approved/sent estimates, and PandaDoc/DocuSign both lock or invalidate signed content on post-send edits | Settings apply going forward from save time; once sent/accepted/paid, changing calculation-affecting settings should warn and require an explicit resend, never silently mutate a document the client already has |
| Silent/unconfirmed client reassignment via the inline Bill To editor on an already-sent or paid estimate | Feels like a fast convenience edit | DocuSign/PandaDoc both gate recipient changes by document status specifically to prevent an accepted quote from silently pointing at different client data after the fact — an integrity bug class, not a style preference | Allow free editing pre-send; require explicit confirmation (and consider an audit trail) once the estimate has financial/sent state |
| Pixel-based PDF/email open-tracking analytics ("client viewed 3 times") bolted onto this milestone | Sounds like valuable sales visibility, and delivery-tracking research surfaced it as a common adjacent feature | PDF-embedded tracking pixels are unreliable (stripped by re-save/print/many mail clients per research); this is unrequested scope creep — none of SEED-041/042/043/044 ask for it | Out of scope for v4.18; if pursued later, track link-open events server-side against the online-link artifact only, not PDF pixels |

## Feature Dependencies

```
Per-estimate settings panel (SEED-041)
    └──requires──> v4.11 per-item tax/discount/deposit model + compute-totals.ts (already shipped)

Format-first Send hub (SEED-042)
    └──requires──> Per-estimate settings persistence (SEED-041)
                       (the artifact renderers — online/PDF/plain-text — must read the same
                        settings snapshot the panel writes, so section-visibility flows through consistently)
    └──requires──> Backward-compatible share_token lookup
                       (friendly URLs are an additive resolution layer over getEstimateByShareToken,
                        not a replacement — old links must keep resolving)

Editable Bill To (SEED-044, part of the alignment pass)
    └──enhances──> existing linkProjectToClient / unlinkProjectFromClient server actions (already exist)
    (does not require SEED-041/042; primarily a UI + shared-client-picker consolidation task)

Mobile line-item parity (SEED-043)
    └──touches same file as──> Document alignment pass (SEED-044, both edit estimate-document.tsx)
       (sequencing/coordination risk, not a hard dependency — both are in-scope for the same milestone)
```

### Dependency Notes

- **Format-first Send hub requires the settings panel's persistence layer:** whichever artifact the client receives (online link, PDF, plain text) must honor the same section-visibility settings the gear panel writes — otherwise a business owner could hide "Warranty" in the settings panel but still have it appear in the PDF. This is the single biggest cross-feature coupling in the milestone and matches PROJECT.md's framing of shipping all 4 seeds as one coherent milestone rather than four independent ones.
- **Friendly URLs are additive, not a replacement:** every competitor precedent researched (Notion, PandaDoc doc-settings) treats the lookup key as separate from the display slug specifically so old links never break. Xtimator's plan (`/estimate/{share_token}` keeps working) follows the same principle.
- **Editable Bill To has no hard dependency on the settings panel** — it reuses already-shipped project/client-linking server actions, so it can be sequenced independently if needed, though PROJECT.md's plan is to ship it alongside the alignment pass in the same milestone.
- **Mobile line-item parity and the document alignment pass share a file** (`estimate-document.tsx` and its mobile branch) — not a logical dependency, but a coordination point to avoid merge/rebase conflicts within the milestone.

## MVP Definition (this milestone's scope, not a new product)

### Launch With (v4.18)

- [ ] Per-estimate settings gear panel: Pricing (tax/discount/deposit segmented controls) + Document Sections (on/off per section) — not granular per-field toggles
- [ ] Settings persist per estimate and are read consistently by editor, share page, PDF, and plain-text/WhatsApp output
- [ ] Send hub reorganized around Online Estimate / PDF / Plain Text, Online Estimate as default
- [ ] Friendly URL shape `/estimate/{companySlug}/{estimateSlug}-{shortPublicToken}` with old `/estimate/{share_token}` still resolving
- [ ] Mobile line-item editor rebuilt on document-native styling (no standalone glass card)
- [ ] Inline-editable Bill To block (hover/focus pencil → popover picker → `linkProjectToClient`), pre-send editing unrestricted
- [ ] Document alignment pass (header, title band, info grid, table columns) + clean (non-dotted) inline-edit underline

### Add After Validation (v4.18.x)

- [ ] Granular per-field visibility toggles inside a section (e.g., hide unit price but keep totals) — only if owners request it after the coarse on/off ships
- [ ] Confirmation/warning step when changing calculation settings on an already-sent/viewed estimate
- [ ] Reusable estimate settings presets/templates (explicitly deferred inside SEED-041 itself)

### Future Consideration (v2+)

- [ ] Tenant custom-domain white-labeling for public estimate URLs (Proposify-style CNAME) — heavier DNS lift, not needed while the shared-domain friendly-URL pattern already reads as branded
- [ ] Server-side link-open/view analytics on the online estimate artifact (not PDF pixel tracking)
- [ ] Post-send recipient-change audit trail, matching the PandaDoc/DocuSign status-gating precedent, if inline Bill To editing is later extended to post-send estimates

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Per-estimate settings panel (coarse: Pricing + Sections) | HIGH | MEDIUM | P1 |
| Format-first Send hub (3 artifact choices) | HIGH | MEDIUM-HIGH | P1 |
| Friendly branded URLs with secret suffix + backward compat | MEDIUM-HIGH | MEDIUM | P1 |
| Mobile line-item editor document-native parity | MEDIUM-HIGH | MEDIUM | P1 |
| Inline editable Bill To block | MEDIUM | MEDIUM | P1 |
| Document alignment/polish pass | MEDIUM | LOW-MEDIUM | P1 |
| Granular per-field visibility toggles | LOW-MEDIUM | MEDIUM | P3 (anti-feature risk if pulled forward) |
| Reusable settings presets/templates | LOW-MEDIUM | MEDIUM | P3 |
| Post-send settings-change confirmation guard | MEDIUM (risk mitigation) | LOW | P2 — cheap insurance against the Contractor+/PandaDoc integrity pitfall, worth pulling into v4.18 if time allows even though not explicitly in the seeds |
| Tenant custom-domain white-labeling | LOW (at current scale) | HIGH | P3 |

## Competitor Feature Analysis

| Feature Area | Housecall Pro / Jobber (service-business leaders) | PandaDoc / DocuSign (document/proposal leaders) | HoneyBook / Dubsado (creative-services leaders) | Our Approach (v4.18) |
|---------|--------------|--------------|--------------|--------------|
| Per-document settings override | Housecall Pro: full per-estimate override, additive-only (hiding ≠ deleting), locked company address field | PandaDoc: workspace defaults overridable per template/document (mechanics not fully public) | Not a strong pattern here — HoneyBook leans on unified Smart Files, not per-doc setting overrides | Gear panel: Pricing (tax/discount/deposit) + Document Sections, snapshot-per-estimate, retrocompat defaults |
| Send flow organization | Jobber: link/portal-first, PDF secondary; Housecall Pro: still channel-first (Email/SMS) with PDF attach checkbox | Not applicable (signature workflow, not client-facing send-format choice) | HoneyBook: single unified Smart File link (no format choice); Dubsado: channel-first (email) bundling multiple links | Format-first hub: Online Estimate (default) / PDF / Plain Text, each with its own channel actions |
| Public URL shape | ServiceTitan: opaque token + on-page branding from business unit; not a readable-slug pattern | Not applicable (auth-gated documents mostly) | Not documented as a readable-URL pattern | Notion-style hybrid: `/estimate/{companySlug}/{estimateSlug}-{shortToken}`, old `/estimate/{token}` still works |
| Recipient/client editing on document | Not documented as in-canvas editing | PandaDoc/DocuSign: separate recipient-management action, status-gated after send, erases signatures on content edit | Not documented | In-canvas hover-to-edit Bill To (pre-send unrestricted; post-send guard recommended as P2 add) |
| View-without-login | Yes (Client Hub / Online Estimate link) | N/A (typically requires identity verification for signing) | Yes for viewing; verification code required for sign/pay actions | Already true for Xtimator's public estimate page; must be preserved under new URL scheme |

## Sources

- [Adjust Individual Estimate Settings on Web or Mobile — Housecall Pro](https://help.housecallpro.com/en/articles/6908612-adjust-individual-estimate-settings-on-web-or-mobile) (WebFetch-verified, HIGH confidence)
- [How to Send an Estimate — Housecall Pro](https://help.housecallpro.com/en/articles/120533-how-to-send-an-estimate)
- [Document settings — PandaDoc Help Center](https://support.pandadoc.com/en/articles/9715025-document-settings) (WebFetch-verified for workspace defaults; per-document override mechanics MEDIUM confidence)
- [Edit sent documents — PandaDoc Help Center](https://support.pandadoc.com/en/articles/9714684-edit-sent-documents)
- [Add and manage recipients — PandaDoc Help Center](https://support.pandadoc.com/en/articles/9714650-add-and-manage-recipients)
- DocuSign Community: recipient-correction threads on changing/removing signers after send (MEDIUM confidence, community not official docs)
- [Quote Basics — Jobber Help Center](https://help.getjobber.com/hc/en-us/articles/115009378727-Quote-Basics)
- [What Do Your Clients See in Client Hub — Jobber Help Center](https://help.getjobber.com/hc/en-us/articles/1500011237822-What-Do-Your-Clients-See-in-Client-Hub)
- [Use Online Estimates — ServiceTitan](https://help.servicetitan.com/how-to/online-estimates)
- [Set up and customize the New Customer Portal — ServiceTitan](https://help.servicetitan.com/docs/set-up-and-customize-the-new-customer-portal)
- [How clients access and submit smart files — HoneyBook Help Center](https://help.honeybook.com/en/articles/9768365-how-clients-access-and-submit-smart-files)
- [Creating and sending a Proposal — HoneyBook Help Center](https://help.honeybook.com/en/articles/2209024-creating-and-sending-a-proposal)
- [Connect a contract and invoice to a proposal — Dubsado Help Center](https://help.dubsado.com/en/articles/6943800-connect-a-contract-and-invoice-to-a-proposal)
- [Send multiple Dubsado links in one email — Dubsado Help Center](https://help.dubsado.com/en/articles/14363243-send-multiple-dubsado-links-in-one-email)
- [Branded URL — Proposify Knowledge Base](https://support.proposify.com/articles/2882195-branded-url)
- [Taxes — Invoice Ninja Docs](https://invoiceninja.github.io/docs/user-guide/taxes)
- [Tax setting per item or invoice total — Invoice Ninja Blog](https://www.invoiceninja.com/tax-setting-per-item-or-invoice-total/)
- [Configuring Estimate & Invoice Settings in Contractor+ — Help Center](https://support.contractorplus.app/en/articles/9468352-configuring-estimate-invoice-settings-in-contractor) (settings-snapshot-on-approved-documents finding, MEDIUM confidence — single source)
- [How to hide line items and sections — GoProposal Help Centre](https://help.goproposal.com/en/articles/3315368-how-to-hide-line-items-and-sections)
- [Create quote templates — HubSpot Knowledge Base](https://knowledge.hubspot.com/quotes/create-quote-templates)
- [Quote Blocks — Qwilr Help Center](https://help.qwilr.com/article/179-creating-quotes-with-quote-blocks)
- [Hide content on a sales quote — QuoteCloud User Guide](https://quote.cloud/hide-content-on-a-sales-quote)
- [Create and send estimates — QuickBooks/Intuit](https://quickbooks.intuit.com/learn-support/en-us/help-article/job-estimates/create-send-estimates-quickbooks-online/L0kOXRjoP_US_en_US)
- URL Design / Notion-style slug+ID pattern — [Enhancing UX with Notion-style URL architecture](https://blog.arpitdalal.dev/enhancing-user-experience-with-notion-style-url-architecture) (MEDIUM confidence, single blog-post source but internally consistent with observed Notion behavior)
- [Payment Link API — Stripe Docs](https://docs.stripe.com/api/payment-link) (opaque-ID pattern, HIGH confidence — official docs)
- Joist mobile UI reviews — [A No-Nonsense Review of Joist — Workyard](https://www.workyard.com/compare/joist-review), [Joist App Reviews — GetOneCrew](https://www.getonecrew.com/post/joist-app-reviews) (MEDIUM confidence, third-party review aggregators)
- Bad-UX-complexity precedent (Salesforce/Workday) — [12 Bad UX Examples — Eleken](https://www.eleken.co/blog-posts/bad-ux-examples) (LOW-MEDIUM confidence, general UX blog, used only for the "more options, more problems" anti-feature framing, not a hard fact claim)
- PDF/email tracking-pixel reliability — [A Comprehensive Guide to PDF Tracking — FlippingBook](https://flippingbook.com/blog/guides/pdf-tracking-guide), [PDF Document Tracking — Locklizard](https://www.locklizard.com/track-pdf-monitoring/) (MEDIUM confidence, vendor blogs but consistent across sources)

---
*Feature research for: Xtimator v4.18 Estimate Document & Send Experience Refresh*
*Researched: 2026-07-08*
