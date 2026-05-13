# Requirements: v2.2 - WhatsApp Channel Polish

## v2.2 Requirements (SEED-015 Gaps 3 & 5)

### PDF Attachment Delivery (WAPDF)

- [x] **WAPDF-01**: User can select "PDF attachment" as a third delivery format option in WhatsApp settings (alongside existing share_link and formatted_text)
- [x] **WAPDF-02**: System generates the estimate PDF using the existing `/api/estimates/[id]/pdf` endpoint and uploads to Supabase Storage (bucket: `estimates-pdf`) with a 24h signed URL on send
- [x] **WAPDF-03**: Client receives the estimate as a WhatsApp document message (Meta API `type: "document"`) with a descriptive filename (e.g. `Estimate-ClientName-2026-05-11.pdf`) and caption from the company name
- [x] **WAPDF-04**: PDF delivery failure (generation error, upload error, Meta API error) degrades gracefully to `share_link` fallback — no crash, send always completes

### WhatsApp Status Flow (WASTATUS)

- [x] **WASTATUS-01**: WhatsApp connection settings UI displays current status with clear human-readable labels: Pending, Verified, Active, Suspended
- [x] **WASTATUS-02**: Status transitions follow the full pipeline: `pending` (credentials submitted, awaiting OTP) → `verified` (OTP confirmed) → `active` (auto-approved post-verification) → `suspended` (admin-controlled)
- [x] **WASTATUS-03**: Admin (or owner) can suspend and reactivate a WhatsApp connection — setting `status = 'suspended'` or back to `active`
- [x] **WASTATUS-04**: Inbound message handler enforces `status = 'active'` gate — connections in `pending`, `verified`, or `suspended` state are silently ignored

## Traceability

| Requirement | Phase |
|-------------|-------|
| WAPDF-01 | Phase 53 |
| WAPDF-02 | Phase 53 |
| WAPDF-03 | Phase 53 |
| WAPDF-04 | Phase 53 |
| WASTATUS-01 | Phase 54 |
| WASTATUS-02 | Phase 54 |
| WASTATUS-03 | Phase 54 |
| WASTATUS-04 | Phase 54 |

## Future Requirements (deferred)

- Gap 4: WhatsApp provider abstraction (`WhatsAppProvider` interface + `TwilioWhatsAppProvider`) — only needed if Meta becomes a problem (v3.x)
- Section/item-level edit commands in pre-send flow (deferred from Phase 51 MVP subset)

## Out of Scope (v2.2)

- Twilio provider support — low priority, no current pain point
- Per-company `verified → active` manual approval gate — auto-approve after OTP keeps friction low
- Admin MRR/suspension tooling — covered by SEED-013 (v3.0 Monetization)

---

## Prior Milestone Requirements (v2.0 / v2.1 — archived)

See `.planning/milestones/` for v2.0 and v2.1 requirement history.
