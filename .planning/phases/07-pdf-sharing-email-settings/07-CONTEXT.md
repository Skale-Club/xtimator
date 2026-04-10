# Phase 7: PDF, Sharing, Email & Settings - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the estimate delivery pipeline: branded PDF generation via @react-pdf/renderer, public share page with accept/decline, email delivery via Resend API with optional PDF attachment, and a full settings page. Replaces the PlaceholderTab for the "Preview & Send" tab. This is the final phase — after completion the app delivers the full core value proposition.

</domain>

<decisions>
## Implementation Decisions

### PDF Generation
- **D-01:** Server route `GET /api/estimates/[id]/pdf` (Next.js Route Handler). Auth required — only the estimate owner can download. Returns PDF as binary with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="Estimate-{projectName}.pdf"`.
- **D-02:** Use `@react-pdf/renderer` (needs install). Build a React PDF document component `components/pdf/estimate-pdf.tsx` that renders the full branded estimate.
- **D-03:** PDF content (PDF-02): company logo (fetched from Storage URL), company name/contact, brand primary color for headers/accents, client name/contact/address, project name/type, all sections with line items (description, qty, unit, unit price, total), section subtotals, overall subtotal, discount line (if applicable), tax line, grand total, payment terms, warranty terms, notes, timeline. Page numbers at bottom.
- **D-04:** PDF styling: professional typography, proper page breaks between sections if needed, alternating row backgrounds for readability, brand color for section headers and accents, page margins.

### Public Share Page
- **D-05:** Route `app/estimate/[token]/page.tsx` — NOT in the `(app)` route group (no auth required). Server component that queries estimate by share_token.
- **D-06:** Query: `supabase.from('estimates').select('*, project:projects(name, project_type), company:companies(name, owner_name, phone, email, website, address, city, state, zip, logo_url, brand_primary_color)').eq('share_token', token).single()`. Also fetch sections + items. Use service role client (bypasses RLS) since this is a public page.
- **D-07:** Log view event: insert into `estimate_activity` with event_type 'estimate_viewed'. Only log once per session (use a cookie or just always log — dedup is not critical for v1).
- **D-08:** Page displays the full estimate in a branded, read-only layout matching the PDF content. Company logo, brand colors, all line items, totals.
- **D-09:** Accept/Decline buttons at bottom (SHARE-04). Server actions: `respondToEstimate(token, response: 'accepted' | 'declined')`. Updates estimate `client_response` and `responded_at`, updates project status to 'accepted' or 'declined', logs activity event. After response, show confirmation message and disable buttons.
- **D-10:** Email notification (SHARE-07): after view/accept/decline, check company notification preferences. If enabled, send email to company owner via Resend. Defer to the same Resend setup used for estimate sending.

### Preview & Send Tab
- **D-11:** The "Preview & Send" tab replaces PlaceholderTab. It has two sections: (a) Preview with PDF download, (b) Send via Email.
- **D-12:** Preview section: rendered estimate preview (similar to share page layout but inside the app), "Download PDF" button that fetches the PDF route, "Copy Share Link" button that copies the public URL to clipboard (SHARE-01).
- **D-13:** Send section (EMAIL-01): form with To (pre-filled with client email), Subject (default: "Estimate from {companyName} - {projectName}"), Body (Textarea, default template with estimate summary and share link), Attach PDF checkbox (EMAIL-03). Send button calls a server route.
- **D-14:** Server route `POST /api/estimates/[id]/send` — uses Resend API to send the email. If PDF attachment enabled, generates PDF server-side and attaches. Updates project status to 'sent', logs activity. (EMAIL-04, EMAIL-05)
- **D-15:** "Mark as Sent" button (EMAIL-06): for in-person delivery. Just updates status to 'sent' and logs activity without actually sending email.
- **D-16:** Install `resend` npm package. RESEND_API_KEY env var required.

### Settings Page
- **D-17:** Route `app/(app)/settings/page.tsx`. Four sections in a single scrollable page using Cards.
- **D-18:** Company Info section (SET-01, SET-02): all fields from onboarding editable — name, owner_name, phone, email, website, address, city, state, zip, industry, logo, brand_primary_color. Reuse logo uploader component. Save via server action `updateCompanySettings`.
- **D-19:** Defaults section (SET-03): payment_terms (Textarea), warranty_terms (Textarea), default_tax_rate (number input as percentage), default_validity_days (number input). Save via same or separate server action.
- **D-20:** Notifications section (SET-04): three toggles — notify_on_view, notify_on_accept, notify_on_decline. Save via server action.
- **D-21:** Account section (SET-05, SET-06): Change password (current + new + confirm), Change email (new email + confirm). Delete account with AlertDialog confirmation — calls `supabase.auth.admin.deleteUser()` via service role or user's own `supabase.auth.updateUser()` + sign out. Actually, Supabase doesn't expose admin deleteUser to client — use a server action with service role.

### Environment & Dependencies
- **D-22:** Install `@react-pdf/renderer` and `resend`.
- **D-23:** Add `RESEND_API_KEY` to `.env.example`.
- **D-24:** No new database migrations needed — all tables and columns exist.

### Claude's Discretion
- PDF layout spacing and typography details
- Share page visual styling
- Settings page section ordering and spacing
- Email template default text
- Exact preview layout in the Send tab

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — PDF-01 through PDF-03, SHARE-01 through SHARE-07, EMAIL-01 through EMAIL-06, SET-01 through SET-06
- `.planning/PROJECT.md` — Tech stack constraints (@react-pdf/renderer, Resend, Vercel deployment)

### Prior Phase Context
- `.planning/phases/06-ai-estimate-generation-editor/06-CONTEXT.md` — Estimate data model, editor patterns
- `.planning/phases/05-audio-recording-photo-management/05-CONTEXT.md` — Storage patterns
- `.planning/phases/02-company-onboarding/02-CONTEXT.md` — Onboarding wizard, logo upload pattern (reuse in settings)

### Database Schema
- `supabase/migrations/20260409000001_initial_schema.sql` — estimates table (share_token, sent_at, viewed_at, responded_at, client_response), companies table (all settings fields, notification preferences), estimate_activity table

### Existing Code
- `components/workspace/project-workspace.tsx` — Tab structure where Preview & Send tab replaces PlaceholderTab
- `lib/queries/estimate.ts` — EstimateWithSections, getCurrentEstimate
- `lib/actions/estimate.ts` — Estimate server actions pattern
- `lib/supabase/service.ts` — Service role client for public pages
- `components/onboarding/logo-uploader.tsx` — Logo upload pattern to reuse in settings
- `lib/actions/company.ts` — Company update server action (updateCompanyAction)
- `app/(app)/layout.tsx` — App shell layout

### Roadmap
- `.planning/ROADMAP.md` §Phase 7 — Plan descriptions, success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/queries/estimate.ts` — getCurrentEstimate, getEstimateById, EstimateWithSections
- `lib/actions/estimate.ts` — saveEstimate pattern
- `lib/actions/company.ts` — updateCompanyAction (needs extension for all settings fields)
- `components/onboarding/logo-uploader.tsx` — File upload to Supabase Storage
- `components/clients/client-logo-uploader.tsx` — Alternative logo upload reference
- `lib/supabase/service.ts` — Service role client for public share page
- All shadcn/ui: Card, Button, Input, Textarea, Select, Switch, AlertDialog, Tabs, Badge, Tooltip

### Established Patterns
- getClaims() / getAuthContext() for auth in server actions
- Next.js Route Handlers in `app/api/` for complex operations
- Server actions in `lib/actions/` for mutations
- Toast notifications via sonner
- react-hook-form + zod for settings form
- Debounced save pattern (estimate editor)

### Integration Points
- `components/workspace/project-workspace.tsx` — Replace PlaceholderTab for send tab with SendTab/PreviewSendTab
- `app/(app)/projects/[id]/page.tsx` — Already loads estimate data
- `estimate_activity` table — Log send/view/accept/decline events
- `projects.status` — Update to 'sent', 'accepted', 'declined'
- `estimates.sent_at`, `viewed_at`, `responded_at`, `client_response` — Update on send/view/respond
- Nav items `components/app-shell/nav-items.ts` — Add Settings nav item

</code_context>

<specifics>
## Specific Ideas

- @react-pdf/renderer renders on server (no browser APIs needed) — ideal for Vercel serverless
- Resend has a generous free tier (100 emails/day) — perfect for v1
- The public share page needs its own layout (no app shell) — it's outside the (app) route group
- Company notification preferences already exist as boolean columns (notify_on_view, notify_on_accept, notify_on_decline)
- Account deletion should sign out the user and redirect to login page
- The PDF route can be reused by the email send route (generate PDF, attach to email)
- Share token is auto-generated by the DB default (gen_random_uuid()) when estimate is created

</specifics>

<deferred>
## Deferred Ideas

None — all v1 requirements covered.

</deferred>

---

*Phase: 07-pdf-sharing-email-settings*
*Context gathered: 2026-04-10*
