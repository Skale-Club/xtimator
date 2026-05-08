# Phase 22: AI Price Anchoring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 22-ai-price-anchoring
**Areas discussed:** Multi-provider architecture, Price book injection format, price_source tool schema, Injection cap, Matching instruction framing
**Mode:** User invoked discuss-phase; selected "faca o recomendado" for original 4 areas. Then surfaced a critical architectural requirement: multi-provider AI support (not env vars — admin panel only). Claude auto-selected recommended options for the 4 original areas.

---

## Critical User Input: Multi-Provider Requirement

**User statement:** "porque voce está citando só o Claude aqui? sendo que o motor do sistema vai ser o Gemini?"
→ Raised that the AI engine will be Gemini, not only Claude.

**Follow-up clarification:** "quero ter a liberdade de ter vários providers, e o claude é apenas uma opção"
→ Wants a multi-provider architecture where Claude is one option among many.

**Explicit constraints confirmed:**
- "nada no env, tudo cadastrado no painel de super admin"
  → Zero env vars. API keys and provider selection 100% through the super admin panel.
- "quero que voce considere multiplos modelos agora sim"
  → Multiple providers in scope for Phase 22 NOW — not deferred.

---

## Original 4 Gray Areas (Recommended Defaults Applied)

### Formato do price book no prompt

| Option | Description | Selected |
|--------|-------------|----------|
| Lista flat compacta (Category \| Name \| $price/unit) | Compact, human-readable, minimal tokens | ✓ (recommended) |
| Agrupada por categoria | More structured, slightly more tokens | |
| Bloco JSON | Machine-readable, verbose, harder to parse semantically | |

**Notes:** Flat list selected — easy for any model (Claude or Gemini) to parse, minimal prompt overhead.

---

### price_source no tool schema

| Option | Description | Selected |
|--------|-------------|----------|
| Required + fallback defensivo no adapter | Schema enforces it; code falls back to "ai_estimate" if model omits | ✓ (recommended) |
| Optional com default ai_estimate | More lenient but less explicit | |

**Notes:** `required` field + defensive fallback is belt-and-suspenders — both adapters implement it.

---

### Cap de itens injetados

| Option | Description | Selected |
|--------|-------------|----------|
| Injetar tudo (sem cap) | Simpler; researcher verifies token budget | ✓ (recommended) |
| Truncar em N itens | Adds complexity; researcher to document if needed as safeguard | |

**Notes:** 1000 items ≈ ~8-10KB. Researcher will verify model context limits and document a soft cap as fallback if needed.

---

### Instrução de matching

| Option | Description | Selected |
|--------|-------------|----------|
| Instrução explícita e precisa | "use that exact unit_price and set price_source to 'price_book'" | ✓ (recommended) |
| Guia semântico suave | Less directive, more ambiguous | |
| Match exato por nome | Too brittle; semantic matching is more useful | |

**Notes:** Explicit directive language — reads like instructions to a human estimator, which works well with both Claude and Gemini.

---

## Multi-Provider Architecture (New Scope, User-Confirmed)

### Escopo

| Option | Description | Selected |
|--------|-------------|----------|
| Interface + Claude + Gemini agora | Both adapters shipped in Phase 22 | ✓ (user confirmed) |
| Só interface + Claude agora | Safer but deferred Gemini | |
| Abstração mínima | No formal interface | |

### Seleção de Provider

| Option | Description | Selected |
|--------|-------------|----------|
| Admin panel | Stored in DB, no env vars, no redeploy | ✓ (user confirmed: "nada no env, tudo cadastrado no painel de super admin") |
| Env var / config estático | Explicitly rejected by user | |

---

## Deferred Ideas

- Per-company AI provider selection → future requirement
- Photo analysis route migration (`analyze-photos`) → out of scope for Phase 22
- Additional providers (GPT-4, Mistral) → adapter pattern makes this easy later
- Model version selection UI → hardcoded in adapters for v1.3
