# Phase 106: Cache Table + Tenant-Scoped Cache Module - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous; milestone decisions locked in REQUIREMENTS.md + research/SUMMARY.md)

<domain>
## Phase Boundary

Build a tenant-scoped, TTL-bounded cache for researched market prices — a new `price_research_cache` table plus a small cache module — unit-tested in isolation. Ships standalone (no research wiring yet; Phase 108 consumes it). The cached value is a NEUTRAL market datum (no company/client/margin/job text) so it can never leak across tenants. Scope is RCACHE-01 + RCACHE-02. Parallelizable with Phase 105 (already done).
</domain>

<decisions>
## Implementation Decisions

### Table (`price_research_cache`)
- Columns: `company_id` (uuid, FK/scoped), `normalized_name` (text), `region` (text, "city|state" canonical), `currency_code` (text), `unit_price` (numeric), `source` (text), `confidence` (numeric, nullable), `expires_at` (timestamptz), plus an id + created_at. Unique key on `(company_id, normalized_name, region, currency_code)`.
- RLS: **deny-all for clients, service-role-only** — mirror the `pipeline_events` posture exactly (RLS ENABLED, zero tenant policies; only the service role reads/writes). No normal Supabase client can read or write it.
- Idempotent migration following existing supabase/migrations conventions. NOT applied to remote (CI→GHCR→Coolify owns deploy).

### Cache module (new `lib/estimate/price-research/{cache,normalize}.ts`)
- `get(company_id, name, region, currency)` → returns the row if present AND `expires_at >= now`, else a miss (treat expired as miss).
- `put(...)` stamps `expires_at = now + 30 days` (TTL constant; keep configurable as a module const).
- `normalize.ts`: region normalizer canonicalizes "city|state"; the name normalizer **reuses `normalizeNameForMatch`** (from `lib/ai/price-anchoring.ts`) so "couch cleaning 8 seats" and "sofa cleaning, 8-seat" can share an entry and quantity never leaks into the key.
- Service-role client only (`requireServiceClient`), never-throw friendly where reasonable (a cache failure must never break generation later).

### Tests
- A **static leakage test** asserting the cache value/type carries NO `company_id` echoed into the *value* shape / no client / no margin / no job-text field — only the neutral datum (`{ unit_price, currency, source, confidence?, expires_at }`). (company_id is a KEY column for tenant scoping, not part of the returned market datum.)
- A unit test: a cache HIT returns the stored price WITHOUT any provider call (stub a provider that must NOT be invoked on a hit).
- TTL: a `put` then `get` past `expires_at` is a miss.

### Claude's Discretion
- Exact migration timestamp/name per convention; numeric precision/scale for unit_price (match estimate_items conventions).
- Module file layout under `lib/estimate/price-research/`.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/REQUIREMENTS.md` — RCACHE-01, RCACHE-02 + Locked decisions block (per-tenant cache, city+state region)
- `.planning/research/ARCHITECTURE.md` — the cache design (table key, RLS posture, TTL, neutral-datum discipline)
- `.planning/research/PITFALLS.md` — multi-tenant cache leakage pitfall + prevention
- `lib/ai/price-anchoring.ts` — `normalizeNameForMatch` to reuse for the name key
- `lib/observability/pipeline-events.ts` + its migration — the service-role/deny-all RLS posture to mirror
- `supabase/migrations/` — existing migration conventions (and the Phase-92 `pipeline_events` migration as the RLS template)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `normalizeNameForMatch` (`lib/ai/price-anchoring.ts`) — reuse for the name cache key.
- `requireServiceClient` (`lib/supabase/service`) — service-role DB access.
- `pipeline_events` table + migration (Phase 92) — the deny-all/service-role RLS template + the static "no leakage" test pattern (Phase 93 used a SAFE-columns whitelist test).

### Established Patterns
- Idempotent migrations; RLS ENABLED with zero tenant policies for platform/service-role-only tables; deploy via CI→GHCR→Coolify (never on the VPS).

### Integration Points
- `lib/estimate/price-research/` is a NEW module dir that Phase 107 (provider seam) and Phase 108 (orchestrator) will consume. This phase ships it dormant + unit-tested.
</code_context>

<specifics>
## Specific Ideas

Cache is a neutral market datum — explicitly NOT tenant-private content. Per-tenant scoping (company_id key) is for RLS uniformity + future per-company margin safety, not because the price itself is secret.
</specifics>

<deferred>
## Deferred Ideas

A future platform-wide `(name, region)` cache tier (cross-tenant reuse) is out of scope — tenant-scoped first (locked decision).
</deferred>
