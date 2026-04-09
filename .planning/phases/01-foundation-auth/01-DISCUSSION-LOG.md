# Phase 1: Foundation & Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-09
**Phase:** 01 — Foundation & Auth

---

## Gray Areas Discussed

User selected all 4 gray areas: Auth page layout, Root route behavior, Database schema spec, shadcn/ui component scope.

---

## Area 1: Auth Page Layout

**Q1:** How should the auth pages look (/auth/login, /auth/signup, /auth/reset-password)?
- Options: Centered card, Split layout, Full-page minimal
- **Selected:** Centered card

**Q2:** Should the company logo and name appear on auth pages?
- Options: App logo + name above card, App name inside card only, No branding on auth pages
- **Selected:** App logo + name above card

**Q3:** Where should the Google OAuth button sit relative to the email/password form?
- Options: Google button at top / divider / email form, Email form first / divider / Google button, Side by side
- **Selected:** Google button at top, divider, then email form

---

## Area 2: Root Route Behavior

**Q1:** What should `/` (the root URL) do?
- Options: Redirect to /auth/login or /dashboard, Marketing landing page, You decide
- **Selected:** Redirect to /auth/login or /dashboard

**Q2:** Which routes should be protected by middleware?
- Options: Protect everything except /auth/* and /estimate/*, Only protect /dashboard and /settings, You decide
- **Selected:** Protect everything except /auth/* and /estimate/*

---

## Area 3: Database Schema Spec

**Q1:** Do you have a full column-level schema to provide, or should the executor infer?
- Options: Infer from requirements, I'll provide a schema spec, Partially — notes only
- **Selected:** Infer from requirements — I trust the AI

**Q2:** Specific schema constraints?
- Options: UUID primary keys everywhere, Serial/bigint IDs, You decide
- **Selected:** UUID primary keys everywhere

**Q3:** Soft-delete or hard-delete?
- Options: Hard-delete (v1), Soft-delete with deleted_at
- **Selected:** Hard-delete (Recommended for v1)

---

## Area 4: shadcn/ui Component Scope

**Q1:** How many shadcn/ui components should Phase 1 install?
- Options: Full app set upfront, Auth-only minimal, You decide
- **Selected:** Full app set upfront

---

*Discussion log generated: 2026-04-09*
