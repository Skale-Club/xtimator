# Phase 149: Account Handoff - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a "Share with client" handoff flow in the super-admin panel (`/admin`) that
invites a prospect's email as `owner` of a demo company. Reuses the Phase 136
`inviteMember` flow byte-for-byte. After acceptance, admin stays as `admin` of
the company. Zero new email infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Handoff entry point (user decision)
- **D-01:** The handoff is triggered from the **super-admin panel (`/admin`)**, NOT from Settings → Team. The admin sees a list of companies they created and can initiate handoff from there. Rationale: the admin manages demos centrally, not from within each company's settings.

### Mechanism: reuse Phase 136 exactly
- **D-02:** The handoff calls `inviteMember(companyId, email, 'owner')` from Phase 136 (`lib/actions/company-members.ts` or equivalent). NO new invite or email infrastructure. A static test asserts no duplicate invite-send code exists.
- **D-03:** The prospect receives the standard Phase 136 Resend invite email with the accept link.
- **D-04:** The prospect accepts via the Phase 137 `acceptInvite(token)` path — existing-user joins directly, new-user does signup-then-join (skipping company creation). Unchanged.

### Post-handoff roles (user decision)
- **D-05:** After the prospect accepts: they become `owner` of the company. The admin's `company_members` role REMAINS as `admin` — the admin is NOT removed. This gives the admin ongoing access for support and follow-up.

### Admin panel UI
- **D-06:** The super-admin panel gets a "Demo Companies" or "Sales Accounts" view showing companies created via the admin modal (identifiable by `demo_estimate_quota IS NOT NULL`). Each row has a "Hand off" action.
- **D-07:** The handoff modal in `/admin` takes one input: the prospect's email address. No role selection (always 'owner'). One-click confirm.

### Authorization gate
- **D-08:** The handoff server action is gated by `requireAdmin()` (the existing helper). A non-admin caller is rejected before `inviteMember` is ever called.

### Mobile
- **D-09:** The `/admin` handoff flow should be mobile-safe (the admin may be doing this on their phone after the street demo).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Invite infrastructure (MUST REUSE — do NOT duplicate)
- `lib/actions/company-members.ts` (or equivalent) — `inviteMember(companyId, email, role)` from Phase 136
- Phase 137 `acceptInvite(token)` path — unchanged, the prospect uses this to join

### Admin panel
- `app/admin/` — existing super-admin panel structure to extend with the "Demo Companies" view
- `app/admin/admins/actions.ts` — reference for service-role gated admin actions

### Authorization
- `lib/auth/admin-context.ts` — `requireAdmin()` is the gate for the handoff action

### Phase 148 dependency
- Companies with `demo_estimate_quota IS NOT NULL` are the "demo companies" to show in the admin handoff view

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `inviteMember(companyId, email, role)` — Phase 136 implementation; must be called as-is, not wrapped in a new function that re-implements the email send.
- `requireAdmin()` — the authorization gate for the handoff action.
- Existing `/admin` panel — the list-with-actions pattern (same as `/admin/admins`) for the demo companies view.

### Established Patterns
- Admin actions: service-role gated, use `requireAdmin()`, follow `app/admin/admins/actions.ts` pattern.
- The handoff does NOT touch Stripe — it's purely a `company_members` role change + invite flow.

### Integration Points
- `app/admin/` → new "Demo Companies" section with handoff action
- `lib/actions/company-members.ts` → `inviteMember` called with 'owner' role (Phase 136 — no changes)
- `supabase/company_invites` → Phase 136 table (no changes)

</code_context>

<specifics>
## Specific Ideas

- The admin's use case: "I showed the prospect the tool, they loved it, now I want to give them the account we just created." The handoff is a one-step email entry in the admin panel.
- "essa conta tem que ficar ready to go pra eu fazer o handoff dela pra esse cliente no futuro" — the account is a persistent demo until the handoff is done. It can be revisited later.
- Post-handoff, the admin staying as `admin` means they can help if the client has questions, without the client needing to explicitly invite the admin back.

</specifics>

<deferred>
## Deferred Ideas

- "Remove admin after handoff" option — the user said admin stays as admin, but a future v2 could add a checkbox.
- Automated handoff trigger (e.g., admin shares a link that the prospect can use to self-claim the account) — deferred.
- Handoff analytics / tracking (which demo accounts converted to paid customers) — deferred.

</deferred>

---

*Phase: 149-account-handoff*
*Context gathered: 2026-06-28*
