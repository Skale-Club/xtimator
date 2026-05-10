---
id: SEED-009
status: dormant
planted: 2026-05-10
planted_during: v1.8 Iterative Estimate Refinement
trigger_when: "when adding multi-tenant / white-label / client branding features"
scope: Small
---

# SEED-009: Custom Domain Support for Clients

## Why This Matters

Currently all clients access their estimates via Xtimator's domain (e.g., `xtimator.com/estimate/{token}`). Some businesses — especially agencies, franchises, or branded service companies — want their clients to see a fully branded experience under their own domain (e.g., `estimates.mycompany.com`). This gives clients greater autonomy and trust, reinforcing the business's own identity rather than redirecting them to a third-party tool.

Custom domain support transforms Xtimator from "your estimate tool" into "your professional estimate platform" — a meaningful differentiation for sales-focused businesses.

## When to Surface

**Trigger:** When adding multi-tenant / white-label / client branding features

This seed should be presented during `/gsd-new-milestone` when the milestone scope matches any of these conditions:
- multi-tenant architecture
- white-label support
- client-side domain configuration
- subdomain routing per company
- CNAME / DNS configuration for estimates

## Scope Estimate

**Small** — A few hours of work. Main effort is subdomain routing logic and DNS configuration documentation. Does not require schema changes; primarily URL handling and middleware routing.

## Breadcrumbs

Related code and decisions found in the current codebase:

- `app/estimate/[token]/page.tsx` — current public estimate page routing
- `lib/queries/share.ts` — share token lookup and estimate fetching
- `middleware.ts` — existing routing/redirect logic
- `proxy.ts` — route protection patterns used throughout the app
- `app/api/generate-estimate/route.ts` — estimate generation endpoint
- STATE.md decisions: D-04 (no landing page in v1), D-07 (404-rewrite precedence)
- Phase 8 decision: "Admin gate runs BEFORE updateSession redirect for /admin/* paths" — relevant pattern for subdomain routing before auth checks

## Notes

Key implementation considerations:
- CNAME record pointing to `clients.xtimator.com` or similar
- Middleware that detects incoming host and maps to company
- TLS/SSL handled at the platform level (no per-client certificate management for v1)
- Estimate tokens remain unique across all domains
- Dashboard and internal routes remain on the primary domain only
- Consider Vercel/AWS ALB for subdomain routing

This is distinct from the current branding admin panel (which controls logo/colors within the platform) — custom domains go further by removing Xtimator branding entirely from the client's view.