# Phase 53: PDF Attachment Delivery - Research

**Researched:** 2026-05-11
**Domain:** Meta Cloud API document messages + Supabase Storage + @react-pdf/renderer (server-side, no auth context)
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WAPDF-01 | Owner can select "PDF attachment" as a third delivery format option in WhatsApp settings (alongside share_link and formatted_text) | UI: WhatsAppConnectCard + updateDeliveryFormat action + migration adding 'pdf_attachment' to CHECK constraint |
| WAPDF-02 | System generates estimate PDF using existing `/api/estimates/[id]/pdf` endpoint logic and uploads to Supabase Storage with 24h signed URL | Direct reuse of renderToBuffer + EstimatePDF + getEstimateWithContext; service-role upload to `pdfs` bucket (already exists); createSignedUrl(path, 86400) |
| WAPDF-03 | Client receives WhatsApp document message with descriptive filename and company caption | sendWhatsAppMessage with type:"document" + document:{link, filename, caption} — existing function handles it via spread |
| WAPDF-04 | PDF delivery failure degrades gracefully to share_link fallback — no crash | try/catch around PDF path wrapping the full pipeline; existing pattern in confirm.ts handleSend (non-fatal try/catch on client send already present) |
</phase_requirements>

---

## Summary

Phase 53 adds `pdf_attachment` as a third delivery format to the WhatsApp outbound pipeline. The work is contained in four areas: (1) a DB migration extending the `delivery_format` CHECK constraint, (2) the `handleSend` branch in `confirm.ts` that calls a new `generateAndUploadPDF()` helper, (3) the `sendWhatsAppMessage()` call with `type: "document"`, and (4) a small UI addition in `WhatsAppConnectCard`.

The existing codebase already has every primitive needed: `renderToBuffer + EstimatePDF + getEstimateWithContext` for PDF generation (used in both `pdf/route.ts` and `send/route.ts`), a `pdfs` bucket in Supabase Storage with `createServiceClient()` for service-role uploads, `createSignedUrl()` already demonstrated in photo-lightbox and recording-item components, and `sendWhatsAppMessage()` which accepts any object body via spread. The only net-new logic is connecting these primitives in a try/catch fallback chain.

The critical architectural decision is **direct in-process PDF generation** (calling `renderToBuffer` directly inside `confirm.ts`'s `handleSend`) rather than an internal HTTP fetch to `/api/estimates/[id]/pdf`. The route uses session auth (`createClient()`), which is unavailable in the WhatsApp webhook context. The service-level code `generateEstimateForProject` already established the pattern of calling library functions directly instead of making internal HTTP requests. Reuse `renderToBuffer` + `getEstimateWithContext` with the service client, bypassing the route entirely.

**Primary recommendation:** In `handleSend`, after the existing Promise.all that loads estimate+project+config, add a `pdf_attachment` branch that calls a `generateAndUploadEstimatePDF(estimateId, companyId, supabase)` helper returning `{signedUrl, filename}`. Wrap the entire PDF path in try/catch that degrades to `share_link`. Use the existing `pdfs` bucket (already provisioned with RLS bypassed for service role) rather than creating a new `estimates-pdf` bucket.

---

## Standard Stack

### Core (already in codebase — no new installs needed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| @react-pdf/renderer | ^4.4.0 | Generate PDF buffer from React component | Already installed; `renderToBuffer` is the server-side entry point |
| @supabase/supabase-js | ^2.103.0 | Upload buffer + create signed URL | Already installed; `requireServiceClient()` is the right variant |

### No new packages required
All primitives are already present. The only new artifact is a helper function in `lib/whatsapp/`.

---

## Architecture Patterns

### Pattern 1: In-Process PDF Generation (NOT internal HTTP fetch)

**What:** Call `renderToBuffer(createElement(EstimatePDF, props))` directly inside `handleSend`, using the service-role Supabase client to fetch estimate context.

**Why not internal HTTP fetch:**
- `/api/estimates/[id]/pdf` uses `createClient()` which requires auth cookies — unavailable in the webhook/confirm context
- `generateEstimateForProject` already established this precedent: do NOT call your own API routes internally; call the library functions directly
- Internal fetch would also require constructing absolute URL and forwarding auth headers — fragile

**The PDF generation snippet (mirrors existing send/route.ts + pdf/route.ts):**
```typescript
// Source: app/api/estimates/[id]/pdf/route.ts and app/api/estimates/[id]/send/route.ts
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import EstimatePDF from '@/components/pdf/estimate-pdf'

// supabase here is the requireServiceClient() instance already used in handleSend
const result = await getEstimateWithContext(supabase, estimateId)
const { estimate, project, company } = result

const projectName = project?.name ?? 'Untitled Project'
const clientRaw = project?.client
const client = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw ?? null

const element = createElement(EstimatePDF, { estimate, company, client, projectName, projectType: project?.project_type ?? null })
const pdfBuffer = await renderToBuffer(element as any)
```

### Pattern 2: Supabase Storage Upload + Signed URL

**What:** Upload PDF buffer to `pdfs` bucket using service-role client; create 24h signed URL immediately after upload.

**Established pattern (from handler.ts image upload):**
```typescript
// Source: lib/whatsapp/handler.ts lines 377-381 + components/workspace/photos/photo-lightbox.tsx
const storagePath = `${companyId}/whatsapp-pdf/${estimateId}-${Date.now()}.pdf`
const { error: uploadError } = await supabase.storage
  .from('pdfs')
  .upload(storagePath, Buffer.from(pdfBuffer), { contentType: 'application/pdf', upsert: false })

if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`)

const { data: signedData } = await supabase.storage
  .from('pdfs')
  .createSignedUrl(storagePath, 86400)   // 86400 = 24 hours in seconds

if (!signedData?.signedUrl) throw new Error('Could not create signed URL')
const signedUrl = signedData.signedUrl
```

**Bucket choice:** Use the existing `pdfs` bucket (id: `pdfs`), NOT a new `estimates-pdf` bucket. Rationale:
- `pdfs` already exists with `application/pdf` MIME type filter and 20MB limit (sufficient for estimates)
- Service role bypasses RLS — no new policies needed
- REQUIREMENTS.md says "bucket: estimates-pdf" but that was written before discovering `pdfs` already exists. The plan MUST document this alignment decision clearly. Creating a new bucket just to match the name in REQUIREMENTS adds schema debt with no technical benefit.
- Storage path `{companyId}/whatsapp-pdf/{estimateId}-{ts}.pdf` segments by company so existing `company_pdfs_*` policies remain coherent if authenticated access is ever needed.

**Important:** `Buffer.from(pdfBuffer)` cast is required — `renderToBuffer` returns `Buffer` from Node.js, but the storage upload method accepts `ArrayBuffer | ArrayBufferView | Blob | Buffer | string`. Passing the raw Buffer is fine; the codebase already does this (handler.ts imageBuffer is a Buffer).

### Pattern 3: Meta Cloud API Document Message

**Exact payload (MEDIUM confidence — verified against multiple sources + SEED-015 spec):**
```typescript
// Source: SEED-015 Gap 3 spec + Meta docs + confirmed by sendWhatsAppMessage spread pattern
await sendWhatsAppMessage(clientPhone, {
  type: 'document',
  document: {
    link: signedUrl,          // HTTPS URL — Supabase signed URLs qualify
    filename: `Estimate-${safeClientName}-${date}.pdf`,
    caption: `Your estimate from ${companyName}`,
  },
})
```

**How this works with existing `sendWhatsAppMessage`:**
The function signature is `sendWhatsAppMessage(to: string, body: object)` and it does:
```typescript
body: JSON.stringify({ messaging_product: 'whatsapp', to, ...body })
```
So `{ type: 'document', document: {...} }` spreads correctly into:
```json
{
  "messaging_product": "whatsapp",
  "to": "+15551234567",
  "type": "document",
  "document": { "link": "...", "filename": "...", "caption": "..." }
}
```
No changes to `client.ts` are needed.

**Meta API document message requirements (MEDIUM confidence):**
- `link` must be a publicly accessible HTTPS URL. Supabase signed URLs are HTTPS and temporarily accessible — they qualify.
- `filename` is a display name shown in the WhatsApp chat; only supported for document type (not images/audio).
- `caption` is optional text shown below the document in the chat.
- Max document size: 100MB (estimates are typically < 1MB).
- Supported MIME types include `application/pdf`.
- Meta caches media URLs for ~10 minutes. Adding a timestamp to the signed URL path (already done via `Date.now()` in storagePath) ensures uniqueness.

### Pattern 4: Graceful Fallback (WAPDF-04)

**What:** Wrap the entire PDF path in try/catch; on any failure, fall through to the existing `share_link` send path.

```typescript
// In handleSend, after loading deliveryFormat
if (clientPhone && deliveryFormat === 'pdf_attachment') {
  let usedPdf = false
  try {
    const { signedUrl, filename } = await generateAndUploadEstimatePDF(
      draft_estimate_id, companyId, supabase
    )
    await sendWhatsAppMessage(clientPhone, {
      type: 'document',
      document: {
        link: signedUrl,
        filename,
        caption: companyName ? `Your estimate from ${companyName}` : 'Your estimate',
      },
    })
    usedPdf = true
    deliveredToClient = true
  } catch (err) {
    console.error('[WhatsApp] PDF delivery failed, falling back to share_link:', err)
    // falls through to share_link branch below
  }

  if (!usedPdf) {
    // share_link fallback
    try {
      await sendWhatsAppMessage(clientPhone, { type: 'text', text: { body: buildShareLinkMessage(shareUrl, clientName) } })
      deliveredToClient = true
    } catch { /* non-fatal */ }
  }
} else if (clientPhone) {
  // existing share_link / formatted_text branches unchanged
  ...
}
```

**Precedent:** The existing `try { await sendWhatsAppMessage(clientPhone, ...) } catch { }` block at line 387-394 in confirm.ts is already non-fatal. The PDF path adds one outer try/catch that degrades to the inner share_link path.

### Pattern 5: Filename Generation

**Target format:** `Estimate-ClientName-2026-05-11.pdf`

```typescript
function buildPdfFilename(clientName: string | null, date = new Date()): string {
  const datePart = date.toISOString().slice(0, 10) // "2026-05-11"
  if (!clientName) return `Estimate-${datePart}.pdf`
  const safeName = clientName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 30)
  return `Estimate-${safeName}-${datePart}.pdf`
}
```

**Precedent:** Existing filename sanitization in `pdf/route.ts` lines 55-58 uses the same replace pattern.

### Pattern 6: DB Migration — Extending delivery_format CHECK

**Current constraint (from phase44 migration):**
```sql
CHECK (delivery_format IN ('share_link', 'formatted_text'))
```

**Required migration pattern:**
```sql
-- Drop old check constraint (Postgres requires drop+add; no ALTER CONSTRAINT)
ALTER TABLE company_whatsapp DROP CONSTRAINT IF EXISTS company_whatsapp_delivery_format_check;
ALTER TABLE company_whatsapp ADD CONSTRAINT company_whatsapp_delivery_format_check
  CHECK (delivery_format IN ('share_link', 'formatted_text', 'pdf_attachment'));
```

**Why this is safe:** The column has `DEFAULT 'share_link'` — existing rows are unaffected. The constraint name follows Postgres auto-naming convention `{table}_{column}_check`. Verify actual constraint name via `\d company_whatsapp` or introspect before running migration.

### Pattern 7: UI — Adding pdf_attachment to WhatsAppConnectCard

**Current state:** `WhatsAppStatus.deliveryFormat` is typed `'share_link' | 'formatted_text'`. `onFormatChange` casts to this union. The `<Select>` has two `<SelectItem>` entries.

**Changes required:**
1. Extend `WhatsAppStatus.deliveryFormat` type to include `'pdf_attachment'`
2. Add `<SelectItem value="pdf_attachment">PDF attachment</SelectItem>` with a descriptive `p` hint
3. `updateDeliveryFormat` server action accepts the new value — no Zod schema changes (it passes straight to Supabase; the DB constraint is the source of truth)

**Anti-pattern:** Do NOT add `pdf_attachment` to a TypeScript `as const` without also updating the DB CHECK constraint — they drift.

### Recommended Project Structure for New Code

```
lib/whatsapp/
├── confirm.ts          # handleSend: add pdf_attachment branch (call generateAndUploadEstimatePDF)
├── pdf-delivery.ts     # NEW: generateAndUploadEstimatePDF() helper + buildPdfFilename()
├── client.ts           # no changes needed
└── formatter.ts        # no changes needed

supabase/migrations/
└── 20260511000003_phase53_pdf_attachment.sql  # ALTER delivery_format CHECK constraint

components/settings/
└── whatsapp-connect-card.tsx  # add pdf_attachment SelectItem + type extension
```

**Why a separate `pdf-delivery.ts`:** Keeps confirm.ts focused on the state machine. PDF generation is a distinct concern (~40 lines) that also needs its own unit test coverage.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF generation | Custom PDF renderer | `renderToBuffer(createElement(EstimatePDF, props))` | Already branded, fully tested, used in pdf/route.ts and send/route.ts |
| File upload | Direct HTTP to Supabase REST | `supabase.storage.from('pdfs').upload(...)` | Service client handles auth headers; established in handler.ts |
| Signed URL | Manually constructing URL with token | `supabase.storage.from('pdfs').createSignedUrl(path, 86400)` | Handles signing internally; established in photo-lightbox, recording-item |
| WhatsApp document send | New fetch() to Meta | `sendWhatsAppMessage(to, { type: 'document', document: {...} })` | Existing function spreads body correctly; handles auth headers |

---

## Common Pitfalls

### Pitfall 1: Calling /api/estimates/[id]/pdf internally
**What goes wrong:** Internal HTTP fetch fails because the route uses `createClient()` which requires auth cookies. The webhook context has no session cookies.
**Why it happens:** Developers assume "reuse the endpoint" means "call it via HTTP".
**How to avoid:** Call `renderToBuffer` + `getEstimateWithContext(supabase, estimateId)` directly with the service client. This is the same pattern as `generateEstimateForProject` in Phase 41.
**Warning signs:** Any `fetch('/api/...')` call inside `lib/whatsapp/` is wrong.

### Pitfall 2: Wrong Supabase client (createClient vs requireServiceClient)
**What goes wrong:** `createClient()` requires cookie context; called from confirm.ts (no HTTP context) it throws or returns anon-level access. Storage upload to `pdfs` bucket will fail if using the authenticated-user client policy.
**How to avoid:** confirm.ts already receives `supabase: SupabaseClient` from the caller (webhook handler), which is the service-role client. Pass it through to `generateAndUploadEstimatePDF`. Do NOT call `requireServiceClient()` inside the helper — accept it as a parameter.

### Pitfall 3: Creating a new `estimates-pdf` bucket instead of reusing `pdfs`
**What goes wrong:** New bucket needs new storage policies, potentially new RLS setup, and duplicates what `pdfs` already provides.
**How to avoid:** Use the existing `pdfs` bucket. The service role bypasses RLS. Distinguish WhatsApp PDFs by path prefix: `{companyId}/whatsapp-pdf/`.
**Note:** REQUIREMENTS.md says `estimates-pdf` — this is a naming preference from the spec, not a technical requirement. The plan MUST make this decision explicit and document it.

### Pitfall 4: URL caching by Meta
**What goes wrong:** Meta caches media URLs for ~10 minutes by the URL string. If two estimates generate the same URL, the second client might receive the first estimate's PDF.
**Why it happens:** Same path = same cache key.
**How to avoid:** Include timestamp in the storage path (e.g., `{estimateId}-{Date.now()}.pdf`). Already shown in the pattern above.

### Pitfall 5: Buffer type mismatch in storage upload
**What goes wrong:** `renderToBuffer` returns a Node.js `Buffer`. Supabase storage `.upload()` accepts `ArrayBuffer | ArrayBufferView | Blob | Buffer`. Passing a `Buffer` is fine but TypeScript may complain depending on Supabase JS types.
**How to avoid:** Cast: `Buffer.from(pdfBuffer)` (no-op but satisfies types). Precedent: Phase 45 decision — "Send BYTEA as '\xHEX' strings" — type coercion issues with supabase-js are a known pattern.

### Pitfall 6: The CHECK constraint name is not the assumed default
**What goes wrong:** Migration assumes constraint name `company_whatsapp_delivery_format_check` but Postgres may have a different auto-generated name, causing `DROP CONSTRAINT IF EXISTS` to silently no-op — then the ADD succeeds with two constraints.
**How to avoid:** Check with `SELECT conname FROM pg_constraint WHERE conrelid = 'company_whatsapp'::regclass;` or use `ALTER TABLE ... DROP CONSTRAINT IF EXISTS` followed by `ADD CONSTRAINT` — both are idempotent if named explicitly. The phase 44 migration uses `ADD COLUMN IF NOT EXISTS` — match that idiom.

### Pitfall 7: Non-null `deliveryFormat` string check in handleSend
**What goes wrong:** `deliveryFormat` is cast from `waConfigResult.data?.delivery_format as string | null` with `?? 'share_link'` default. Adding `=== 'pdf_attachment'` check on a string that could be null is fine because the null coalescing already handles it. But the TypeScript type is `string` — not the literal union — so the compiler won't warn about typos.
**How to avoid:** Use a `const DELIVERY_FORMATS = ['share_link', 'formatted_text', 'pdf_attachment'] as const` type guard or simply be careful with the string literal. Low risk.

### Pitfall 8: WhatsAppStatus type in component out of sync with DB
**What goes wrong:** `WhatsAppStatus.deliveryFormat` typed as `'share_link' | 'formatted_text'` in the component. Adding `pdf_attachment` to the DB without updating the TypeScript type means the Select value will be `""` (not matching any SelectItem) when a company switches back from pdf_attachment.
**How to avoid:** Update the TypeScript type in `whatsapp-connect-card.tsx` alongside the SelectItem addition. One atomic change.

---

## Code Examples

### Full helper: generateAndUploadEstimatePDF
```typescript
// lib/whatsapp/pdf-delivery.ts
// Source: mirrors app/api/estimates/[id]/pdf/route.ts pattern
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import EstimatePDF from '@/components/pdf/estimate-pdf'

export async function generateAndUploadEstimatePDF(
  estimateId: string,
  companyId: string,
  supabase: SupabaseClient,
  clientName: string | null
): Promise<{ signedUrl: string; filename: string }> {
  // 1. Fetch estimate context (same as pdf/route.ts)
  const result = await getEstimateWithContext(supabase, estimateId)
  if (!result || !result.company) throw new Error('Estimate not found for PDF generation')

  const { estimate, project, company } = result
  const projectName = project?.name ?? 'Untitled Project'
  const clientRaw = project?.client
  const client = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw ?? null

  // 2. Render PDF buffer (same as pdf/route.ts)
  const element = createElement(EstimatePDF, {
    estimate,
    company,
    client,
    projectName,
    projectType: project?.project_type ?? null,
  })
  const pdfBuffer = await renderToBuffer(element as any)

  // 3. Upload to pdfs bucket (service role bypasses RLS)
  const filename = buildPdfFilename(clientName)
  const storagePath = `${companyId}/whatsapp-pdf/${estimateId}-${Date.now()}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('pdfs')
    .upload(storagePath, Buffer.from(pdfBuffer), { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw new Error(`PDF upload failed: ${uploadError.message}`)

  // 4. Create 24h signed URL
  const { data: signedData } = await supabase.storage
    .from('pdfs')
    .createSignedUrl(storagePath, 86400)
  if (!signedData?.signedUrl) throw new Error('Failed to create signed URL for PDF')

  return { signedUrl: signedData.signedUrl, filename }
}

export function buildPdfFilename(clientName: string | null, date = new Date()): string {
  const datePart = date.toISOString().slice(0, 10)
  if (!clientName) return `Estimate-${datePart}.pdf`
  const safeName = clientName
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 30)
  return `Estimate-${safeName}-${datePart}.pdf`
}
```

### Migration
```sql
-- supabase/migrations/20260511000003_phase53_pdf_attachment.sql
-- Phase 53: Add pdf_attachment as a third delivery_format option
-- Drop and re-add the CHECK constraint to include the new value
ALTER TABLE company_whatsapp
  DROP CONSTRAINT IF EXISTS company_whatsapp_delivery_format_check;

ALTER TABLE company_whatsapp
  ADD CONSTRAINT company_whatsapp_delivery_format_check
  CHECK (delivery_format IN ('share_link', 'formatted_text', 'pdf_attachment'));
```

### handleSend modification (only the client delivery block)
```typescript
// In confirm.ts handleSend — replaces the existing client delivery block
let deliveredToClient = false
if (clientPhone) {
  if (deliveryFormat === 'pdf_attachment') {
    let pdfDelivered = false
    try {
      const { signedUrl, filename } = await generateAndUploadEstimatePDF(
        draft_estimate_id, companyId, supabase, clientName
      )
      await sendWhatsAppMessage(clientPhone, {
        type: 'document',
        document: {
          link: signedUrl,
          filename,
          caption: companyName ? `Your estimate from ${companyName}` : 'Your estimate',
        },
      })
      pdfDelivered = true
    } catch (err) {
      console.error('[WhatsApp] PDF delivery failed, falling back to share_link:', err)
    }
    if (!pdfDelivered) {
      // fallback: share_link
      try {
        await sendWhatsAppMessage(clientPhone, {
          type: 'text',
          text: { body: buildShareLinkMessage(shareUrl, clientName) },
        })
        deliveredToClient = true
      } catch { /* non-fatal */ }
    } else {
      deliveredToClient = true
    }
  } else {
    const clientMessageBody =
      deliveryFormat === 'formatted_text'
        ? formatEstimateForWhatsApp(estimate as FormatterEstimate, clientName, companyName)
        : buildShareLinkMessage(shareUrl, clientName)
    try {
      await sendWhatsAppMessage(clientPhone, { type: 'text', text: { body: clientMessageBody } })
      deliveredToClient = true
    } catch { /* non-fatal */ }
  }
}
```

---

## Key Codebase Facts (Verified)

| Fact | Source | Confidence |
|------|--------|------------|
| `sendWhatsAppMessage(to, body)` spreads body directly — no changes needed to send a document | `lib/whatsapp/client.ts:12-27` | HIGH |
| `pdfs` bucket exists with `application/pdf` MIME filter, 20MB limit, service role bypasses RLS | `supabase/migrations/20260409000001_initial_schema.sql:272` | HIGH |
| `renderToBuffer + createElement(EstimatePDF, props)` is the established PDF generation pattern | `app/api/estimates/[id]/pdf/route.ts:44-52` | HIGH |
| `getEstimateWithContext(supabase, estimateId)` fetches all data needed for EstimatePDF | `lib/queries/estimate.ts:101-125` | HIGH |
| `delivery_format` column is TEXT with CHECK constraint (not Postgres ENUM) — safe to extend with DROP+ADD | `supabase/migrations/20260510000004_phase44_delivery_format.sql` | HIGH |
| `WhatsAppStatus.deliveryFormat` typed as `'share_link' \| 'formatted_text'` in component | `components/settings/whatsapp-connect-card.tsx:70` | HIGH |
| `createSignedUrl(storagePath, expiresInSeconds)` is the established signed URL pattern | `components/workspace/photos/photo-lightbox.tsx:43-46` | HIGH |
| confirm.ts already receives `supabase: SupabaseClient` — the service-role instance from handler.ts | `lib/whatsapp/confirm.ts:38-39` + handler.ts call site | HIGH |
| `updateDeliveryFormat` server action exists and is wired in the card | `components/settings/whatsapp-connect-card.tsx:156-167` | HIGH |
| No `estimates-pdf` bucket exists — only `pdfs`, `audio`, `photos`, `logos`, `platform-brand` | All migration files | HIGH |
| `renderToBuffer` from @react-pdf/renderer v4.4.0 returns a Node.js Buffer | Package.json + pdf/route.ts usage | HIGH |

---

## Open Questions

1. **`estimates-pdf` vs `pdfs` bucket name**
   - REQUIREMENTS.md says `estimates-pdf`, which does not exist in the codebase
   - The existing `pdfs` bucket is a perfect match functionally
   - Recommendation: Use `pdfs` with path prefix `{companyId}/whatsapp-pdf/`. Document this alignment in the plan's decision log.
   - If a separate `estimates-pdf` bucket is truly required, the migration must create it with policies (service-role only access is fine since no authenticated UI needs these PDFs).

2. **Does Meta accept Supabase signed URLs?**
   - Supabase signed URLs are public HTTPS URLs with a token in the query string — they satisfy Meta's "publicly accessible HTTPS" requirement.
   - MEDIUM confidence — verified via community consensus and SEED-015 spec which explicitly designs this flow. No official Meta doc confirmation that signed URLs (with `?token=...`) work. This is the expected approach per the spec.
   - Risk: LOW. Supabase signed URLs have been confirmed working with third-party services in community sources.

3. **Cleanup of uploaded PDFs**
   - Phase 53 does not include a cleanup job for uploaded `whatsapp-pdf/*` objects. These accumulate at ~1 per sent estimate.
   - Recommendation: Accept as deferred (Phase 54 or later). Add a note in the plan. A pg_cron job matching the Phase 43 pattern could purge files older than 30 days.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| @react-pdf/renderer | PDF generation | Yes | ^4.4.0 | — |
| @supabase/supabase-js | Storage upload + signed URL | Yes | ^2.103.0 | — |
| Next.js | App framework | Yes | 16.2.3 | — |
| Supabase `pdfs` bucket | PDF storage | Yes (exists in initial_schema.sql) | — | Create `estimates-pdf` bucket |
| Meta Graph API v21.0 | Document message send | Runtime (token in env) | — | Degrades to share_link (WAPDF-04) |

**No blocking dependencies.**

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | vitest.config.ts (include: tests/unit/**) |
| Quick run command | `npx vitest run tests/unit/whatsapp/` |
| Full suite command | `npx vitest run tests/unit/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WAPDF-01 | `pdf_attachment` option appears in SELECT, `updateDeliveryFormat` accepts it | unit (action) | `npx vitest run tests/unit/whatsapp/pdf-delivery.test.ts` | No — Wave 0 |
| WAPDF-02 | `generateAndUploadEstimatePDF` uploads buffer, returns signedUrl+filename | unit | `npx vitest run tests/unit/whatsapp/pdf-delivery.test.ts` | No — Wave 0 |
| WAPDF-03 | `handleSend` with `pdf_attachment` calls `sendWhatsAppMessage` with `type:'document'` | unit | `npx vitest run tests/unit/whatsapp/confirm.test.ts` | Partial (exists but needs pdf_attachment case) |
| WAPDF-04 | On PDF failure, `sendWhatsAppMessage` is called with share_link text instead | unit | `npx vitest run tests/unit/whatsapp/confirm.test.ts` | Partial (exists but needs fallback case) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/whatsapp/`
- **Per wave merge:** `npx vitest run tests/unit/`
- **Phase gate:** Full unit suite green before marking complete

### Wave 0 Gaps
- [ ] `tests/unit/whatsapp/pdf-delivery.test.ts` — covers WAPDF-02 (generateAndUploadEstimatePDF: upload success, upload failure, signedUrl failure) + buildPdfFilename edge cases
- [ ] `tests/unit/whatsapp/confirm.test.ts` — add cases for `deliveryFormat: 'pdf_attachment'` (WAPDF-03: document message sent) and fallback on throw (WAPDF-04: share_link sent instead)

---

## Sources

### Primary (HIGH confidence)
- `lib/whatsapp/confirm.ts` — full handleSend implementation, existing delivery branching at lines 382-394
- `app/api/estimates/[id]/pdf/route.ts` — renderToBuffer + getEstimateWithContext pattern to replicate
- `lib/whatsapp/client.ts` — sendWhatsAppMessage spread pattern; no changes needed
- `supabase/migrations/20260409000001_initial_schema.sql` — confirms `pdfs` bucket exists with service-role bypass
- `supabase/migrations/20260510000004_phase44_delivery_format.sql` — exact migration pattern to extend
- `components/settings/whatsapp-connect-card.tsx` — delivery format selector + WhatsAppStatus type
- `components/workspace/photos/photo-lightbox.tsx` — createSignedUrl(path, 3600) pattern
- `lib/supabase/service.ts` — requireServiceClient vs createServiceClient distinction
- `.planning/REQUIREMENTS.md` — WAPDF-01 through WAPDF-04 verbatim

### Secondary (MEDIUM confidence)
- SEED-015 Gap 3 spec — exact JSON payload design for document message (verified against Meta docs format)
- Meta Cloud API document message structure — `{ type: "document", document: { link, filename, caption } }` confirmed by multiple sources including official docs navigation and third-party implementations
- Meta URL requirement: "publicly accessible HTTPS URL" — confirmed via web search (smsgatewaycenter.com, quickreply.ai docs citing Meta specs)
- Meta document file size limit: 100MB — confirmed via multiple third-party sources citing Meta specs

### Tertiary (LOW confidence)
- Supabase signed URLs accepted by Meta API — community assumption; no official Meta source confirmed. Treat as working hypothesis validated by SEED-015 spec design.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and actively used
- Architecture patterns: HIGH — all primitives verified in codebase; PDF generation pattern copied from existing route
- Meta API payload: MEDIUM — confirmed via multiple sources but official docs were not fully fetchable
- Pitfalls: HIGH — all grounded in specific codebase evidence
- Signed URL acceptance by Meta: LOW — reasonable assumption, not officially documented

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (Meta API is stable; Supabase storage API is stable)
