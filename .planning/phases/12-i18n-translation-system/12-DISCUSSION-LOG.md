# Phase 12: i18n Translation System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 12-i18n-translation-system
**Areas discussed:** t() wrapping scope, LanguageProvider placement, Static dictionary size, Landing page i18n

---

## Gray Area Selection

All 4 areas discussed with recommended defaults selected by user ("do the recommended").

---

## Area 1: `t()` Wrapping Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Every single string | Wrap 100% of user-visible text across entire app | |
| Practical common-strings-first (Recommended) | ~80 high-frequency strings in static dict; rare strings fall back to AI | ✓ |

**User's choice:** Practical common-strings-first (recommended default)
**Notes:** Admin panel, legal copy, placeholder text explicitly excluded. Goal: zero API calls for typical dashboard session.

---

## Area 2: LanguageProvider Placement

| Option | Description | Selected |
|--------|-------------|----------|
| `app/layout.tsx` root — wraps everything (Recommended) | Provider at root; toggle only shown in authenticated topbar; admin/estimate default to 'en' | ✓ |
| `(app)` route group only | Provider scoped to authenticated routes only | |

**User's choice:** Root layout (recommended default)
**Notes:** Admin panel and /estimate/* share page see no toggle and default to 'en'. SEED-001 specifies root layout — matches.

---

## Area 3: Static Dictionary Size

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal (nav + common buttons only) | ~20 strings, fast to ship | |
| Comprehensive common set (~80 strings, Recommended) | Navbar, buttons, status labels, form labels, headings, empty states, errors | ✓ |

**User's choice:** Comprehensive common set (recommended default)
**Notes:** Goal: zero /api/translate calls for typical authenticated session (dashboard → project → estimate flow).

---

## Area 4: Landing Page i18n

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to v1.3 (Recommended) | Server component incompatible with client hook; design SSR i18n properly in next milestone | ✓ |
| Include in Phase 12 | Requires different approach for server components | |

**User's choice:** Defer (recommended default)
**Notes:** Landing page is server-rendered; client-side useTranslation() hook doesn't apply. I18N-03 mentions "landing page" but practical constraint is EN-first for v1.2.

---

## Claude's Discretion

- Exact Claude model for translation (haiku recommended)
- In-memory cache implementation approach
- 50ms debounce batch assembly pattern
- LanguageToggle UX (dropdown vs cycle-click)
- RLS policy on translations table

## Deferred Ideas

- Landing page translation — SSR i18n design needed, defer to v1.3
- Admin panel translation — EN-only v1.2
- /estimate/* share page translation — EN-only v1.2
- Per-user DB language preference — localStorage covers v1.2
- Browser locale auto-detection — manual toggle covers v1.2
- Translation admin UI — deferred to v2
