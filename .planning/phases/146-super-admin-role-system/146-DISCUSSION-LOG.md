# Phase 146-149 (v4.14): Admin Sales Mode - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in each phase's CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-28
**Phase:** 146-149 — v4.14 Admin Sales Mode (discussed holistically)
**Areas discussed:** Role system, Modal fields, Quota mechanism, Paywall UX, Handoff entry point, Quota scope

---

## Discovery: platform_admins already exists

Before discussion, codebase scout revealed that `platform_admins` table + `requireAdmin()` helper already exist from Phase 8. This eliminated the need for a new `is_super_admin` column on `profiles`. Phase 146 scope was dramatically reduced to "wire isAdmin to CompanySelector."

---

## Demo Estimate Quota mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Coluna separada: estimate_quota | Independent column on companies, separate from AI credits | ✓ (Claude decided) |
| Usar credit_balance existente | Reuse existing AI credit mechanism | |
| Você decide | Let Claude decide | ✓ (user selected) |

**User's choice:** "Você decide"
**Claude's decision:** Separate `demo_estimate_quota` column on `companies`, usage tracked by counting estimates table rows (not a counter column). Reason: keeps AI compute credits and estimate-count gates as distinct concerns.

---

## Admin company creation modal fields

| Option | Description | Selected |
|--------|-------------|----------|
| Mínimo: nome + industry (2 campos) | Fastest, minimal | |
| Básico: nome + industry + phone + email | 4 fields, captures contact | |
| Completo: nome + industry + logo + cor | 4 fields focused on brand | ✓ |

**User's choice:** "completo e a cor junto com o logo, acho que inclusive não precisa de um email e telefone, para não gerar atrito no início Nome da empresa, industry, logo e cor, isso nesse onboarding de street sales, o onboarding normal, continua igual"
**Notes:** Logo + color are kept because they make the live-demo estimate look professional. Phone/email removed to reduce friction. Regular onboarding unchanged.

---

## After handoff: admin role

| Option | Description | Selected |
|--------|-------------|----------|
| Admin permanece como 'admin' | Admin keeps access for support | ✓ |
| Admin é removido da empresa | Clean handoff, admin loses access | |
| Admin escolhe na hora | Checkbox at handoff time | |

**User's choice:** Admin permanece como 'admin' da empresa
**Notes:** Allows admin to help with support/follow-up after handoff.

---

## Paywall UX when quota exhausted

| Option | Description | Selected |
|--------|-------------|----------|
| Bloqueia geração + mostra upgrade (padrão) | Reuse existing upgrade modal | ✓ |
| Banner no topo + botão de upgrade | Warning banner before exhaustion | |
| Você decide | Let Claude align with existing pattern | |

**User's choice:** Bloqueia geração + mostra upgrade (padrão)
**Notes:** Reuse existing paywall pattern byte-for-byte. No new UI needed.

---

## Handoff entry point

| Option | Description | Selected |
|--------|-------------|----------|
| Settings → Team (v4.12 surface) | Within each company's settings | |
| Botão no Company Selector | Always accessible from dropdown | |
| Painel super-admin (/admin) | Centralized admin management | ✓ |

**User's choice:** "no painel de super admin"
**Notes:** Admin manages all demo accounts centrally from /admin.

---

## Quota override scope

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas contas demo | Only for companies with quota set | |
| Qualquer empresa | Any company, via super-admin panel | ✓ |

**User's choice:** "sim pode, precisa ser feito via super admin também"
**Notes:** This is the admin's "manual recovery valve" — can override estimates for any company if there's a technical issue.

---

## Claude's Discretion

- Quota column design: `demo_estimate_quota INTEGER DEFAULT NULL` (Claude decided after user said "você decide")
- Usage tracking: COUNT from estimates table (not a counter column)
- `requireSuperAdmin` vs `requireAdmin` alias — Claude picks most readable

## Deferred Ideas

- Logo URL from web (instead of upload) — might be faster on the street
- "Remove admin after handoff" option checkbox
- Automated quota increase after first payment
- Estimate quota analytics in admin panel
