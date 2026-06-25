# Requirements: Xtimator — Milestone v4.11 Advanced Pricing Model

**Defined:** 2026-06-25
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Enrich the estimate's pricing MODEL (per-item tax, discounts, deposit, markup) so the existing server-side deterministic math engine computes them — without giving the AI a calculator. Source: [SEED-032](seeds/SEED-032-advanced-pricing-model-tax-discount-deposit.md).

> **Locked decisions (non-negotiable):**
> - **The arithmetic integrity already exists** (GUARD-03, server-side deterministic recalculation, never-trust-LLM). This milestone adds the DATA MODEL + math, NOT a better calculator.
> - **All new arithmetic stays SERVER-SIDE and DETERMINISTIC** — the AI NEVER computes tax/discount/deposit/markup; it only provides inputs (qty, unit_price or cost, labor/materials classification). EXTEND the existing GUARD-03 math block (`lib/services/generate-estimate.ts` ~L255-373); do NOT create a parallel one.
> - **NO AI calculator tool** — explicitly excluded; it would reintroduce the n8n calculator's 3 LLM-failure points (a regression).
> - **Retrocompat is mandatory** — existing estimates (taxable=true, discount=0, deposit=none, no tax_config) must be BYTE-IDENTICAL on the happy path; a regression test locks this.
> - **Calculation sequence (locked):** `line_net = round2(qty×unit_price) − line_discount`; `subtotal = Σ line_net`; `disc_global = amount | subtotal×pct`; `taxable_base = Σ(line_net where taxable) − (disc_global prorated)`; `taxAmount = Σ(taxable_base_per_category × rate_category)`; `grandTotal = (subtotal − disc_global) + taxAmount`; `deposit = grandTotal×deposit_pct | deposit_amount`; `balanceDue = grandTotal − deposit`.
> - **Discount before tax** (US norm — discount reduces the taxable base; configurable per company).
> - **Mirrored across all 3 channels** (web/WhatsApp/MCP) because the math engine is the shared core — the richer totals appear everywhere with no channel-adapter changes.

## v1 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Per-Item Taxability

- [x] **TAX-01**: Schema — `estimate_items.taxable` (boolean, default true) + optional `tax_category` ('labor'|'materials'|'other'); `companies.tax_config` (per-category rate OR a "labor exempt" rule). Idempotent migration; retrocompat defaults.
- [x] **TAX-02**: The AI output schema/types carry `taxable`/`tax_category` per item — the AI CLASSIFIES (labor/materials) but NEVER computes tax. Types widened; AI never gains arithmetic.
- [x] **TAX-03**: The server math computes tax PER-ITEM (Σ taxable_base_per_category × rate_category) instead of a flat `subtotal × rate`; when `tax_config` is absent the result is BYTE-IDENTICAL to today's flat-rate computation (retrocompat).

### Discounts

- [x] **DISC-01**: Schema — `estimate_items.discount` (line-level, amount or percent) + `estimates.discount` (global, amount or percent).
- [x] **DISC-02**: The server math applies line discount before the subtotal and the global discount before tax (configurable before/after per company), prorating the global discount into the taxable base.

### Deposit / Down-Payment

- [x] **DEP-01**: Schema + server math — `estimates.deposit_type` ('none'|'percent'|'amount') + `deposit_value` → a server-computed `balance_due` (grandTotal − deposit).
- [x] **DEP-02**: The deposit is the value the Stripe payment link charges — the deposit threads to the SEED-020/SEED-036 payment + 1% fee contract (the fee computes on the amount actually charged).

### Markup

- [x] **MARK-01**: `estimate_items.cost` (optional) + `markup_pct` → a SERVER-DERIVED `unit_price` (`cost × (1 + markup)`) — never-trust-LLM applied to markup; the price book stores cost + markup per item.

### Engine & Retrocompat

- [x] **ENG-01**: All new arithmetic EXTENDS the existing GUARD-03 server-side math block (single deterministic authority); a static test asserts the AI is given NO calculator tool and computes none of tax/discount/deposit/markup.
- [x] **ENG-02**: Retrocompat invariant — an estimate with no new fields (taxable defaults true, discount 0, deposit none, no tax_config) produces a BYTE-IDENTICAL subtotal/tax/total to the pre-milestone engine; a regression test locks the happy path (no number drift on already-generated estimates).

### Editor & Output

- [x] **PUI-01**: The estimate editor (`item-row.tsx` + `item-card-mobile.tsx`) gains per-line discount/taxable fields + global discount + deposit controls; server actions accept the new fields.
- [ ] **PUI-02**: The PDF + plain-text output render the new totals structure (subtotal → discount → tax → total → deposit → balance due) across all 3 channels.

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

### Richer Pricing

- **PRICEX-01**: Tiered pricing (first N units at rate X, rest at Y) + per-line difficulty multipliers.
- **PRICEX-02**: Admin UI for source/allowance config + margin (the SEED-035 billing admin already exists; pricing-specific config could extend it).

## Out of Scope

| Feature | Reason |
|---------|--------|
| An AI calculator tool | Reintroduces the n8n calculator's 3 LLM-failure points — a regression; all math stays server-side |
| Rebuilding the math engine | EXTEND GUARD-03, do not parallel it |
| Channel-adapter changes | The math engine is the shared core; the richer totals appear in all 3 channels for free |
| Changing already-generated estimate numbers | Retrocompat is mandatory — byte-identical happy path when the new fields are absent |
| Tiered/difficulty pricing | Deferred to v2 |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TAX-01 | Phase 129 | Complete |
| TAX-02 | Phase 130 | Complete |
| TAX-03 | Phase 130 | Complete |
| DISC-01 | Phase 131 | Complete |
| DISC-02 | Phase 131 | Complete |
| DEP-01 | Phase 132 | Complete |
| DEP-02 | Phase 132 | Complete |
| MARK-01 | Phase 132 | Complete |
| ENG-01 | Phase 129 | Complete |
| ENG-02 | Phase 129 | Complete |
| PUI-01 | Phase 133 | Complete |
| PUI-02 | Phase 134 | Pending |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12 ✓
- Unmapped: 0 ✓

**Phase rollup:**
- Phase 129 (Schema + Engine Scaffold + Retrocompat Lock): TAX-01, ENG-01, ENG-02
- Phase 130 (Per-Item Taxability): TAX-02, TAX-03
- Phase 131 (Discounts): DISC-01, DISC-02
- Phase 132 (Deposit + Markup + Stripe Contract): DEP-01, DEP-02, MARK-01
- Phase 133 (Editor UI): PUI-01
- Phase 134 (PDF + Plain-Text Totals): PUI-02

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-25 — milestone v4.11 Advanced Pricing Model roadmap created (6 phases 129-134, 12/12 requirements mapped, 0 orphans)*
