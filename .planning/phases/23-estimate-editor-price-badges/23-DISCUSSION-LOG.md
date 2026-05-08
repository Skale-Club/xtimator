# Phase 23: Estimate Editor Price Badges - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-05-08
**Phase:** 23-estimate-editor-price-badges
**Mode:** User responded "next" → Claude applied recommended defaults for both gray areas.

---

## Badge Placement & Visual

| Option | Description | Selected |
|--------|-------------|----------|
| Inline com unit_price, ícone + texto pequeno | Compact badge right of price field, uses existing Badge component | ✓ (recommended) |
| No início da linha | More visible but crowds description column | |
| Tooltip no unit_price | Clean but low discoverability | |

**Decision:** Inline, `variant="secondary"` for price_book (`<CheckCircle2>`), `variant="outline"` for ai_estimate (`<Zap>`) and "Edited".

---

## Override UX

| Option | Description | Selected |
|--------|-------------|----------|
| Badge 'Edited' neutro (Recomendado) | Neutral outline badge while editing; price_source=null on save | ✓ (recommended) |
| Badge some imediatamente | Simpler but less feedback | |
| Badge fica até salvar | Less responsive feel | |

**Decision:** `isManuallyEdited: true` client flag → shows "Edited" badge immediately on unit_price edit → `price_source: null` written to DB on save → badge disappears.

---

## Deferred Ideas

- PDF badges, share page badges → v2
- i18n for badge copy → deferred
- "Save to price book" → discarded by REQUIREMENTS
- Bulk "Edited" reset → out of scope
