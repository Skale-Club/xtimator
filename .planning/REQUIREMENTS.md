# Requirements: Xtimator — Milestone v4.22 Product-Native Demo

**Defined:** 2026-07-26
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Replace the standalone public demo with an isolated, read-only session that renders the real authenticated Xtimator product.

> **Locked decisions (owner-confirmed through the implementation discussion):**
> - The demo uses the real app shell and real product routes; no second demo design is maintained.
> - Production isolation uses `demo.xtimator.com` so host-only Supabase and active-company cookies cannot overwrite a real session on `xtimator.com`.
> - The dedicated demo user and deterministic demo company are always read-only. Canonical admin/provider exemptions must never make the public demo writable.
> - The existing standalone demo remains available until the replacement passes automated and browser verification.
> - Production is GitHub Actions → Docker/GHCR → Coolify. Vercel artifacts in the repository are not production configuration.

## v4.22 Requirements

### Demo Entry and Session Isolation (ENTRY)

- [x] **ENTRY-01**: A visitor opening the public demo entry on the apex domain is transferred to the configured demo host without changing an existing apex-domain Supabase session.
- [x] **ENTRY-02**: The demo host creates a host-only authenticated session for the dedicated demo user, selects the deterministic demo company in a host-only `active_company_id` cookie, and redirects to the real `/dashboard`.
- [x] **ENTRY-03**: Re-entering the demo is idempotent and recovers from stale or partial demo cookies without redirect loops.
- [x] **ENTRY-04**: Local development supports the same isolated-host flow on the configured localhost port without weakening production cookie rules.

### Product Parity (PARITY)

- [ ] **PARITY-01**: A demo visitor sees the same authenticated app layout, navigation, responsive behavior, components, and styling used by a real tenant.
- [ ] **PARITY-02**: The demo visitor can navigate the core read surfaces—dashboard, projects, clients, price book, estimates, and settings surfaces intentionally exposed to the demo—using the deterministic demo tenant's data.
- [ ] **PARITY-03**: The shared app shell visibly identifies demo/read-only mode and removes or disables controls that would otherwise initiate a mutation or paid/external side effect.

### Read-Only Security (SAFE)

- [ ] **SAFE-01**: Every server action and API route reachable from the demo denies mutations when either the authenticated session is the dedicated demo user or the active company is the deterministic demo company.
- [ ] **SAFE-02**: External side effects—including AI generation, uploads, email/SMS/WhatsApp sends, billing, background jobs, and webhooks initiated from the UI—cannot be triggered by the public demo.
- [ ] **SAFE-03**: Database/RLS policy provides a final deny-write boundary for the demo user/company even if a UI or server guard is missed.
- [ ] **SAFE-04**: Automated tests prove allowed read navigation, denied mutation paths, host-only cookie isolation, stale-cookie recovery, and absence of redirect loops.

### Cutover and Operations (CUTOVER)

- [ ] **CUTOVER-01**: Landing-page demo entry points use the product-native flow after verification, and the obsolete standalone `/demo/*` UI is removed without leaving broken internal links.
- [ ] **CUTOVER-02**: Environment and deployment documentation specifies the demo host, Supabase redirect allow-list requirements, DNS/Coolify domain setup, and local host setup without treating Vercel as production.
- [ ] **CUTOVER-03**: Browser verification demonstrates that a real apex session remains intact before and after visiting the demo host and that the demo renders the real product at desktop and responsive widths.

## Future Requirements

- **DEMO-FUT-01**: Periodically reset demo data to a canonical fixture after scheduled intervals.
- **DEMO-FUT-02**: Provide scenario-specific demo tenants for multiple service industries.
- **DEMO-FUT-03**: Capture privacy-safe demo funnel analytics across landing, entry, and product exploration.

## Out of Scope

| Feature | Reason |
|---------|--------|
| A second demo-only design system | The milestone exists specifically to eliminate visual and behavioral divergence. |
| Public visitors receiving a real admin/provider identity | It creates an unsafe mutation path and is unnecessary for product exploration. |
| Production deployment, DNS mutation, or Coolify domain creation from local code | These are operator actions; the repository will provide exact configuration requirements and remain deploy-ready. |
| Demo data editing with periodic rollback | Read-only is the safer first release; resettable sandboxes can be considered later. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENTRY-01 | Phase 180 | Complete |
| ENTRY-02 | Phase 180 | Complete |
| ENTRY-03 | Phase 180 | Complete |
| ENTRY-04 | Phase 180 | Complete |
| PARITY-01 | Phase 181 | Pending |
| PARITY-02 | Phase 181 | Pending |
| PARITY-03 | Phase 181 | Pending |
| SAFE-01 | Phase 180 | Pending |
| SAFE-02 | Phase 180 | Pending |
| SAFE-03 | Phase 180 | Pending |
| SAFE-04 | Phase 180 | Pending |
| CUTOVER-01 | Phase 181 | Pending |
| CUTOVER-02 | Phase 181 | Pending |
| CUTOVER-03 | Phase 181 | Pending |

**Coverage:**
- v4.22 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0
- Duplicate mappings: 0

---
*Requirements defined: 2026-07-26*
*Last updated: 2026-07-26 after roadmap creation*
