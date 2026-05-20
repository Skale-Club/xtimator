# Feature Landscape: Multi-Tenancy (Multiple Companies per User)

**Project:** Xtimator v4.0
**Researched:** 2026-05-20
**Mode:** Ecosystem (subsequent-milestone scope)
**Overall confidence:** HIGH — patterns verified across 5+ major SaaS products (Slack, Linear, Notion, Vercel, Stripe, GitHub)

---

## Context Recap (from files_to_read)

- **Current state:** `company-selector.tsx` already renders a dropdown but shows only the single company and has a dead "Add company" menu item — UI scaffold exists, wiring does not.
- **Current onboarding:** `OnboardingSurvey` → `createOrUpdateCompany()` upserts a single row keyed by `claims.sub` (user_id). Re-entering onboarding today **overwrites** the existing company. v4.0 must split this into "create new" mode that never overwrites.
- **Locked scope:** Owner-only role, no invites, 1 Stripe subscription per company, migration backfills 1 membership per existing company.
- **Implication for this research:** features that depend on multiple users per company (invite UI, member roles, audit logs of who-did-what across orgs) are **out of scope** and called out below as deferred, not anti-features.

---

## Switcher UX

### Reference patterns from major products

| Product | Switcher location | Trigger | Items shown | Active indicator |
|---------|-------------------|---------|-------------|------------------|
| Slack | Left rail of workspace icons + Cmd/Ctrl+Shift+S | Click avatar / keyboard | Avatar grid, draggable to reorder | Highlighted avatar + workspace name in topbar |
| Linear | Top-left dropdown | Click workspace name | List with avatar, name, role | Checkmark on active |
| Notion | Top-left "current workspace name" | Click workspace name | Workspaces grouped by email account + "Create / join" entries | Visual selection of current |
| Vercel | Top-left dropdown | Click team name | Personal account + all teams, "Create team" entry at bottom | Bold/checkmark |
| Stripe | Upper-left account name | Click account name | Account list + "New account" entry | Bold current |
| GitHub | Top-right avatar | Click profile picture | Profile + "Switch dashboard context" for orgs | List item highlight |

**Consistent across all 6 products:**
1. Switcher lives in a **persistent chrome region** (topbar or left rail) — never buried in settings.
2. Triggered by clicking the **current workspace name or avatar** — not a separate icon.
3. Active workspace shows **avatar + name**; dropdown list shows **avatar + name + active checkmark**.
4. **"Create new" entry sits inside the same dropdown** — separated by a divider at the bottom of the list.
5. Switching is **single-click**, no confirmation dialog.

### Xtimator's existing scaffold

The current `company-selector.tsx` already follows the standard pattern: avatar + name + chevron, dropdown with avatar+name+check, "Add company" entry at the bottom after a separator. **The visual structure is correct and matches industry conventions.** Only wiring is missing (list multiple companies, mark active, invoke switch server action, route the "Add company" item).

### Feature breakdown — Switcher UX

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Topbar dropdown trigger (avatar + name + chevron) | **Table Stakes** | Low | Already implemented in `company-selector.tsx` |
| Dropdown lists all companies user belongs to | **Table Stakes** | Low | Requires query joining `company_members` → `companies` |
| Active company has checkmark + visual emphasis | **Table Stakes** | Low | Trivial conditional rendering |
| "Add company" entry at the bottom of dropdown | **Table Stakes** | Low | Already in UI; needs routing |
| Switch via server action (set cookie + revalidate) | **Table Stakes** | Medium | Server action must `cookies().set()` and `revalidatePath('/', 'layout')` to flush React `cache()` |
| Avatar fallback (company initial) when no logo | **Table Stakes** | Low | Already implemented |
| Keyboard shortcut to open switcher (Cmd/Ctrl+K-style) | Differentiator | Medium | Slack/Linear ship this; Xtimator is mobile-first so lower priority |
| Search-as-you-type within switcher | Differentiator | Medium | Only valuable at 10+ workspaces — niche for Xtimator's owner-operator persona |
| Pinned/recent companies sort | Differentiator | Medium | Useful at 5+ companies, low value at 2–3 |
| Drag-to-reorder companies | Differentiator | Medium-High | Slack does this; UX overhead not worth it for v4.0 |
| Show role badge per company ("Owner") in dropdown | Differentiator (deferred) | Low | Only meaningful once non-Owner roles exist — defer with invites milestone |
| Show last-active timestamp per company | Differentiator | Low-Medium | Niche; defer |
| Multi-account email grouping (Notion style) | Anti-feature for v4.0 | High | Notion uses this because one human can have multiple emails; Xtimator's single-user auth makes this irrelevant |
| Side-by-side multi-workspace view ("see all channels") | Anti-feature | High | Slack does it; explicitly out of scope (locked: no cross-company analytics) |

### Switcher dependencies on existing Xtimator surfaces

- **`AppShell` topbar** — switcher already rendered here; no layout change needed.
- **`React cache()` for auth/company** (PERF-02) — switching companies must invalidate this cache. `revalidatePath('/', 'layout')` after cookie write is the canonical Next.js 16 App Router pattern.
- **Sidebar projects list** (PROJ-10..12) — re-fetches via server component on route change; will naturally re-scope to new active company after cookie flip + revalidate.
- **Trial banner / billing UI** — must re-read tier from the new active company (already per-company; just needs the cookie wired).

---

## Active Workspace Persistence

### What major products actually do

| Product | Mechanism | Indicator in URL | Notes |
|---------|-----------|------------------|-------|
| Slack | Native app: stored per-workspace login. Web: subdomain `team.slack.com` | Subdomain | Each workspace is functionally a separate session |
| Linear | Path-based `linear.app/{workspace-slug}/...` | Path slug | Switching = full client-side route change |
| Notion | Cookie-based, no workspace in URL | Implicit | URL only contains page IDs, workspace is session state |
| Vercel | Path-based `vercel.com/{team-slug}/...` | Path slug | Personal account at `vercel.com/{username}` |
| Stripe | Cookie-based for dashboard; no slug in URL | Implicit | Single-account-at-a-time, switching requires full reload |
| GitHub | Path-based for org scope `/orgs/{org}/...` | Path prefix | Personal scope vs org scope explicit in URL |

### Tradeoffs

| Mechanism | Pros | Cons |
|-----------|------|------|
| **Cookie only** (Notion/Stripe pattern) | Simplest; no URL refactor; existing routes work unchanged; bookmarks remain stable per active company | URLs are not shareable across workspaces (paste a link → opens in wrong company); cookie staleness edge cases (deleted workspace); no "open in another tab in different workspace" |
| **Path slug** (Linear/Vercel pattern) | URLs are self-describing; multiple tabs can sit in different workspaces; deep links work cross-org | Requires rewriting every `/projects/[id]`, `/clients/[id]`, `/estimate/[id]` route to `/{company}/projects/[id]`; middleware must parse and validate slug on every request; massive refactor |
| **Subdomain** (Slack pattern) | Strongest isolation; per-workspace cookie scoping out of the box | DNS/wildcard cert complexity; breaks Xtimator's current custom-domain feature (already uses subdomains for tenants' branded share pages) |

### Recommendation for Xtimator

**Cookie-based active company (matches the locked decision in PROJECT.md).** This is the right call because:
1. **Xtimator already has cookie SSR infrastructure** — `eb-theme` cookie + `onboarding_complete` cookie patterns are established in the codebase.
2. **Custom-domain feature** (SEED-009) already consumes subdomains for tenant share pages; layering app subdomains on top would conflict.
3. **Owner-operator persona** rarely needs cross-workspace deep links — a plumber switching between their LLC and their wife's catering business doesn't paste estimate URLs across companies.
4. **Refactor cost of path-based** is the largest single risk to the v4.0 timeline (~30 routes + middleware overhaul).

The downside (URL not self-describing) is mitigated by **shared estimate links being public + Stripe-Connect-scoped** — those don't need workspace context, they're already keyed by estimate share token.

### Feature breakdown — Persistence

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| `active_company_id` cookie (httpOnly, signed) | **Table Stakes** | Low | Use Next.js `cookies()` API; httpOnly:true (no client-side reads needed, unlike `eb-theme`) |
| Server actions derive company from cookie, not from `auth.uid()` | **Table Stakes** | High | ~20 server actions to sweep — biggest scope item in v4.0 |
| Middleware validates membership on every request | **Table Stakes** | Medium | New middleware check: cookie → query `company_members` → if no row, clear cookie + redirect to switcher / first-membership |
| Cookie fallback when missing (first company in list) | **Table Stakes** | Low | If user has memberships and no cookie, default to most-recent-active |
| Path-based URL (`/w/{id}/...`) | Anti-feature for v4.0 | Very High | Confirmed deferred; revisit only if Xtimator gains "share workspace deep link" use cases |
| Subdomain-based workspace | Anti-feature | Very High | Conflicts with existing custom-domain feature |
| LocalStorage as primary store | Anti-feature | N/A | Breaks SSR; cookie must be authoritative for server components |
| `?company=...` URL param override (debug-only) | Differentiator | Low | Useful for support: "open this URL pretending to be in company X" — defer |

---

## Create New Workspace

### Reference patterns

| Product | Entry point | Surface | Defaults inheritance |
|---------|-------------|---------|---------------------|
| Slack | "Create a new workspace" link → dedicated multi-step web flow | Dedicated route (`slack.com/create`) | Blank slate (different workspace = different team) |
| Linear | Switcher → "Create new workspace" → dedicated onboarding | Dedicated route | Blank slate; auto-generated 3 starter issues |
| Notion | Switcher → "Create workspace" → 2-step modal | Modal-then-page | Blank slate; offers templates |
| Vercel | Switcher → "Create team" → multi-step in-app flow | Dedicated route (`vercel.com/teams/create`) | Blank slate; plan selection inline |
| Stripe | Switcher → "New account" → opens a redirect to account creation | Dedicated flow | Blank slate; KYC starts from scratch |

**Strong industry consensus:** Workspace creation is a **dedicated route, not a modal**. Reason: it has too many fields (name, industry, logo, branding, defaults) to fit a modal pattern; users expect to navigate "into" the creation flow, not be interrupted by it.

**Inheritance is universally blank slate** — none of the 5 products copy defaults from the active workspace. Rationale: each workspace represents a different business entity; copying defaults implies shared identity. The one place where inheritance happens is the user's **personal preference** (language, theme) — those persist across workspaces because they belong to the user, not the company.

### Xtimator's mapping

The existing `OnboardingSurvey` component is **already a multi-step survey** that collects exactly the right fields (company name, industry, brand color, address, defaults). For v4.0, the cleanest play is to **add a "mode" prop** (`'first-time' | 'add-additional'`) and:
- **`first-time`** mode: current behavior — runs after signup, no escape, redirects to `/dashboard`.
- **`add-additional`** mode: launched from the switcher, has a "Cancel" affordance back to current company, redirects to `/dashboard` of the **newly-created** company (cookie set to new id), with a toast: "You're now in {new company name}".

### Feature breakdown — Create New Workspace

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Dedicated route for "create new" (e.g. `/onboarding?mode=new`) | **Table Stakes** | Low | Reuses existing `/onboarding` page |
| `createOrUpdateCompany` split into `createCompany` (insert-only) + `updateCompany` (update existing) | **Table Stakes** | Medium | Current SELECT-then-INSERT/UPDATE logic must not branch by user_id anymore — branch by mode |
| Server action creates `companies` row + `company_members(role='owner')` row in single transaction | **Table Stakes** | Medium | Critical: if membership insert fails, company insert must roll back (orphaned company) |
| Cookie flips to new company id automatically on creation success | **Table Stakes** | Low | Same cookie write as switcher |
| Trial clock starts at company creation time | **Table Stakes** | Low | Already correct in current code (`tier_trial_ends_at` only set on INSERT) — preserves this behavior per-company |
| "Cancel" affordance returns to previous active company | **Table Stakes** | Low | Just a "Back" link to `/dashboard` without writing the cookie |
| Blank-slate defaults (no inheritance from current company) | **Table Stakes** | Low | Matches industry standard; matches existing `INITIAL` constant |
| User's language preference carries over | Differentiator | Low | Already stored per-company in `default_estimate_language`; **language is UI-level (LanguageContext)** so it naturally persists |
| Copy logo/branding from current company | Differentiator | Low | Convenient for users who own multiple businesses with same branding — but counter-pattern; defer |
| Template gallery ("Construction starter", "Cleaning starter") | Differentiator | High | Industry-specific defaults; defer to a future "industry presets" milestone |
| Short "Get started" wizard variant (3 fields instead of 10) | Differentiator | Medium | Lower friction for the 2nd/3rd company; defer |
| Modal-based creation (no dedicated route) | Anti-feature | N/A | Conflicts with existing multi-step survey; industry doesn't do this |
| Auto-create a "Personal" workspace alongside main on signup | Anti-feature | N/A | Notion does this for individuals; doesn't fit Xtimator's owner-operator B2B persona |
| Allow "drafts" of half-created companies | Anti-feature | N/A | Adds DB complexity, low value; either commit or don't |

### Dependencies on existing Xtimator surfaces

- **`OnboardingSurvey`** (`components/onboarding/onboarding-survey.tsx`) — add a `mode` prop or route-param read.
- **`createOrUpdateCompany`** (`lib/actions/company.ts`) — split into two actions. Current `SELECT-then-INSERT/UPDATE` logic on user_id becomes obsolete (multiple companies per user_id is now valid).
- **`tier_trial_ends_at` semantics** — already INSERT-only; behavior survives unchanged per-company.
- **Logo upload path** (`${user.id}/logo.${ext}`) — **needs change**: collides across companies of the same user. Switch to `${company.id}/logo.${ext}` or `${user.id}/${company.id}/logo.${ext}`. **Pitfall flag** — covered in PITFALLS.md.

---

## Billing in Multi-Workspace Apps

### Reference patterns

| Product | Subscription scope | Payment method scope | Switcher shows billing? |
|---------|--------------------|-----------------------|--------------------------|
| Slack | Per-workspace | Per-workspace card | No |
| Linear | Per-workspace | Per-workspace card | Plan badge in switcher |
| Notion | Per-workspace | Per-workspace card | Plan badge sometimes |
| Vercel | Per-team | Per-team card | Plan badge in team dropdown |
| Stripe | Per-account | Per-account | No |
| GitHub | Per-org + per-user | Per-billing-entity | Billing context indicator |

**Industry consensus:** Billing follows the workspace, not the user. Each workspace has its own card-on-file, its own subscription, its own invoices. **Consolidated cross-workspace billing dashboards are rare and exclusively a paid Enterprise-tier feature** (e.g., Slack Enterprise Grid, Vercel Enterprise) — never table-stakes.

**Why:** real-world businesses operating multiple workspaces are typically **distinct legal entities** (different LLCs, different P&Ls, different tax IDs). One person's credit card can be on file at multiple companies they own, but the *subscription* belongs to the *company*. This matches Xtimator's locked decision exactly.

### Trial clock per workspace

Slack, Linear, Notion, and Vercel all start the trial clock at **workspace creation**, not at signup. This is critical for Xtimator: a user who creates their second company on day 10 gets a **fresh 14-day trial on that new company**, independent of the first company's tier or trial state. The current code already does this (`tier_trial_ends_at` set on INSERT only) — survives unchanged.

### Stripe Connect vs Stripe subscription billing — Xtimator's existing duality

Xtimator already has **two distinct Stripe surfaces**:
1. **Platform Stripe (Xtimator's account):** charges customers $X/mo for Pro/Business tier. Already per-company (`tier`, `tier_trial_ends_at` on `companies` table).
2. **Stripe Connect (each company's own Stripe):** lets the company accept payments from *their* customers on estimates. Already per-company.

Both are already per-company in v3.0/v3.1. **v4.0 multi-tenancy doesn't change billing semantics at all** — it changes which company id those billing fields are scoped by. The locked decision ("Stripe: 1 subscription per company, not per-user") simply confirms what's already true.

### Feature breakdown — Billing

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Each company has independent tier/trial/Stripe customer id | **Table Stakes** | Low | Already implemented (TIER-01..04) |
| `/settings/billing` shows tier for **active** company only | **Table Stakes** | Low | Already reads from `companies` row of active company — just needs to follow new cookie |
| Trial clock starts at company creation, not signup | **Table Stakes** | Low | Already correct |
| Each company has own Stripe Connect account (estimate payments) | **Table Stakes** | Low | Already implemented (Phase 70) |
| `usage_events` scoped by company_id | **Table Stakes** | Low | Already correct |
| Plan badge in switcher ("Pro", "Trial — 5 days left") | Differentiator | Low-Medium | Linear/Vercel ship this; useful but not table stakes; defer |
| "Billing across all my companies" dashboard | Differentiator (deferred) | High | Industry treats this as Enterprise-tier; defer indefinitely |
| Shared payment method across companies (one card on file for the user) | Differentiator (deferred) | High | Stripe Customer per-company is cleaner; deferring is correct |
| Single invoice spanning multiple companies | Anti-feature | N/A | Breaks legal-entity separation; nobody does this |
| Pro tier on Company A unlocks features on Company B | Anti-feature | N/A | Violates per-company subscription model; explicit footgun |

### Dependencies on existing Xtimator surfaces

- **TIER-01..04, QUOTA-01..06, STRIPE-01..04, BILLING-01..05, TRIAL-01..02** — none change semantically; all just need to read the active company id from cookie instead of from `auth.uid()`.
- **Hourly trial expiry cron + T-3/T-0 emails** — already iterates over `companies` rows; no change needed.
- **Admin force-tier + bonus credits + MRR view** — already operates on `companies.id`; no change.
- **`/settings/payments` (Stripe Connect)** — already per-company; no change.

---

## Edge Cases

### Empty state — user has zero workspaces

**When does this happen for Xtimator?**
- Brand-new signup pre-onboarding (already handled: middleware redirects to `/onboarding`).
- User deletes their only company (current product doesn't support company deletion — **flag for design decision**; if v4.0 enables deletion, must handle this).
- Migration anomaly: existing `companies.user_id` user with no corresponding `company_members` row. **The backfill migration must be idempotent and reconciliation-complete.**

**Industry pattern (Notion, Linear, Vercel):** if a user has zero workspaces, the entire app shell is replaced with a **"Create your first workspace"** screen. No sidebar, no topbar — just the creation flow. Functionally identical to first-time onboarding.

### Stale cookie — points to a deleted/revoked workspace

**When does this happen?**
- User had Company A active in browser tab. In another tab/device, they (or in future, an admin) revoke their membership / delete the company.
- They return to the first tab, click a sidebar link, server action queries by `active_company_id` cookie → returns no rows.

**Industry pattern (Stripe, Vercel):** middleware/server-side code checks membership on every request. If the cookie points to an inaccessible workspace:
1. Clear the cookie.
2. Pick the user's first available workspace as new active (most-recent-active is even better, but optional).
3. Redirect to `/dashboard` of that workspace.
4. Toast: "Your active workspace was no longer accessible. Switched to {new name}."

**If user has no remaining workspaces:** redirect to the empty-state flow above.

### User loses membership mid-session

**Pattern:** treated identically to stale cookie. The middleware/server-action membership check is the single chokepoint that handles both cases.

### User is in 50+ companies (scale)

**Unlikely for Xtimator's persona** (owner-operator of 1–3 small businesses) but worth bounding:
- Switcher should virtualize or paginate at 20+ items.
- Add a search box at 10+ items (currently zero, defer until needed).
- Server-side: cache `getUserCompanies(user_id)` per request with `cache()`.

### Concurrent switches across tabs

**Pattern (industry consensus):** cookies are shared across tabs by browser, so a switch in tab A affects all other tabs. Most products **don't try to fight this** — accept that all tabs follow the cookie. If users want different workspaces in different tabs, they use **incognito** or **different browser profiles** (this is the same advice Slack, Notion, Vercel all give).

Xtimator should not implement per-tab workspace state for v4.0 (would require localStorage shimming + cookie reconciliation, high complexity, low ROI for the persona).

### Feature breakdown — Edge Cases

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Zero-workspaces empty state → forced creation flow | **Table Stakes** | Low | Reuses onboarding route; middleware enforces it |
| Stale cookie validation in middleware + auto-recovery | **Table Stakes** | Medium | Critical path; must run on every authenticated request |
| Backfill migration is idempotent (re-running creates no duplicates) | **Table Stakes** | Medium | Use `ON CONFLICT (user_id, company_id) DO NOTHING` |
| Backfill migration is reconciliation-complete (no orphaned `companies.user_id`) | **Table Stakes** | Medium | Validation query: `SELECT companies WHERE NOT EXISTS (membership)` must return 0 rows |
| Toast on auto-switch ("Your workspace was no longer accessible") | Differentiator | Low | Polishes UX; recommended |
| Most-recent-active fallback ordering | Differentiator | Low | Track `last_active_at` on `company_members`; defer if simple "first by created_at" works |
| Per-tab workspace state | Anti-feature | High | Industry consensus: don't do this |
| Show deleted workspaces in switcher (greyed out) | Anti-feature | N/A | Confusing; deleted = gone |
| Soft-delete with restore window | Differentiator (deferred) | Medium-High | Not in v4.0 scope (deletion itself isn't in scope per locked decisions) |

---

## URL Structure (already covered in Persistence — summary)

**Locked decision in PROJECT.md:** cookie-based, no workspace id in URL path. This research confirms this is the right call for Xtimator given:
1. Cookie SSR infrastructure already in place.
2. Subdomain conflict with existing custom-domain feature.
3. Owner-operator persona doesn't need cross-workspace deep links.
4. ~20 server-action sweep is already the biggest scope item; path refactor would double it.

**Exception:** existing share-link routes (`/estimate/[token]`) **must remain workspace-agnostic** — they're public and identified by share token, never by company. The cookie doesn't apply here. Already correct in current architecture.

---

## Table Stakes vs Differentiators vs Anti-Features (Consolidated)

### Table Stakes (must ship for v4.0 to feel complete)

1. **Switcher lists all user's companies, marks active, switches via server action** (Switcher UX, Low–Medium complexity)
2. **`active_company_id` cookie as authoritative state, server-side validated** (Persistence, Low–High complexity)
3. **Server actions derive company from cookie** — the ~20-action sweep (Persistence, **High complexity, biggest single scope item**)
4. **Middleware validates membership on every request, auto-recovers on stale cookie** (Edge Cases, Medium complexity)
5. **"Add company" entry in switcher launches onboarding in create-new mode** (Create New Workspace, Low complexity)
6. **Onboarding survey gains create-vs-update mode without overwrite risk** (Create New Workspace, Medium complexity)
7. **`createCompany` + `company_members` insert in single transaction** (Create New Workspace, Medium complexity)
8. **Zero-workspaces empty state forces creation flow** (Edge Cases, Low complexity)
9. **Backfill migration: idempotent + reconciliation-complete + zero re-onboarding** (Edge Cases, Medium complexity)
10. **Per-company trial clock starts at company creation** — already correct, just must survive refactor (Billing, Low complexity)
11. **Logo upload path keyed by company id, not user id** (hidden dependency — see PITFALLS.md)
12. **Stale-cookie auto-recovery + toast** (Edge Cases, Low–Medium complexity)

### Differentiators (nice to have, defer to future milestone)

1. **Plan badge in switcher** ("Pro", "Trial — 5 days left") — Linear/Vercel pattern, Low–Medium complexity
2. **Keyboard shortcut to open switcher** (Cmd/Ctrl+K) — Low–Medium complexity
3. **Search box in switcher** — only at 10+ companies, Medium complexity
4. **Most-recent-active sort + `last_active_at` tracking** — Low–Medium complexity
5. **Role badge per company in switcher** ("Owner") — Low complexity, but blocked on roles-other-than-Owner existing (future invites milestone)
6. **Copy branding/logo from current company on creation** — convenience for franchises, Low complexity
7. **Industry-preset templates** ("Construction starter") — High complexity, separate milestone
8. **Short "Get started" wizard variant for 2nd+ company** — Medium complexity
9. **`?company=...` URL param override for support debugging** — Low complexity, defer to admin-tools milestone

### Anti-Features (explicitly do NOT build)

1. **Path-based URLs (`/w/{id}/...`)** — locked deferred; would double v4.0 scope without commensurate ROI for the persona
2. **Subdomain per workspace** — conflicts with existing custom-domain feature
3. **LocalStorage as primary active-workspace store** — breaks SSR
4. **Per-tab workspace state** — industry consensus: don't do this; incognito/profiles are the answer
5. **Consolidated cross-company billing dashboard** — Enterprise-only pattern; doesn't fit owner-operator persona
6. **Pro tier on Company A unlocking features on Company B** — violates per-company subscription model, footgun
7. **Single invoice spanning multiple companies** — breaks legal-entity separation
8. **Modal-based company creation** — industry never does this; the onboarding survey is too long
9. **Auto-create "Personal" + "Work" workspace on signup** (Notion pattern) — doesn't fit B2B service-business persona
10. **Half-finished "draft" companies** — adds DB complexity, low value
11. **Show deleted workspaces in switcher (greyed)** — confusing
12. **Notion-style multi-email account grouping** — irrelevant; Xtimator has one email per user
13. **Drag-to-reorder companies** — Slack-only; UX overhead exceeds value at 2–3 companies

### Out-of-Scope-But-Captured (locked deferred per PROJECT.md)

These aren't anti-features (they're legitimately valuable) but explicitly deferred:
1. **Inviting other users to a company** — future milestone
2. **Role hierarchy (Admin/Member beyond Owner)** — future milestone
3. **Cross-company analytics in admin panel** — future milestone
4. **Per-user "default company" preference** — cookie is sufficient for v4.0

---

## Dependencies Summary (existing Xtimator surfaces affected)

| Existing surface | Change required | Risk |
|------------------|------------------|------|
| `components/app-shell/company-selector.tsx` | Replace single-company prop with list + active id; wire "Add company" click | Low |
| `components/onboarding/onboarding-survey.tsx` | Add `mode` prop; route "create new" flow correctly | Low |
| `lib/actions/company.ts` | Split `createOrUpdateCompany` into `createCompany` + `updateCompany`; remove `user_id` uniqueness assumption | Medium |
| `lib/actions/*.ts` (~20 files) | Replace `auth.uid()`-based scoping with `getActiveCompanyId()` cookie read | **High — largest item** |
| Middleware | Add active-company validation + stale-cookie recovery | Medium |
| RLS policies on all tenant-scoped tables | Rewrite from `user_id = auth.uid()` to membership join | **High** |
| `React cache()` for auth/company | Add invalidation on switch via `revalidatePath('/', 'layout')` | Low–Medium |
| Logo upload path | Change from `${user.id}/logo.ext` to `${company.id}/...` | Low but hidden — see PITFALLS |
| `tier_trial_ends_at`, `usage_events`, all per-company tables | No schema change; just ensure cookie is the source of company id | Low |
| Custom-domain feature (SEED-009) | Already per-company; should survive unchanged | Low |
| Stripe Connect (Phase 70) | Already per-company; should survive unchanged | Low |
| `/settings/billing`, `/settings/payments`, `/settings/whatsapp`, `/settings/company` | Each reads active company id; just needs cookie wired | Low |

---

## Sources

### Primary product documentation (HIGH confidence)
- [Switch between workspaces — Slack](https://slack.com/help/articles/1500002200741-Switch-between-workspaces)
- [Linear Docs: Workspaces](https://linear.app/docs/workspaces)
- [Linear Docs: Concepts](https://linear.app/docs/conceptual-model)
- [Notion: Create, join & leave workspaces](https://www.notion.com/help/create-delete-and-switch-workspaces)
- [Notion: Intro to workspaces](https://www.notion.com/help/intro-to-workspaces)
- [Vercel: Account Management](https://vercel.com/docs/accounts)
- [Vercel: Create a Team (REST API reference)](https://vercel.com/docs/rest-api/teams/create-a-team)
- [Stripe: Multiple separate accounts](https://docs.stripe.com/get-started/account/multiple-accounts)
- [Stripe Support: Create and manage multiple accounts](https://support.stripe.com/questions/create-and-manage-multiple-stripe-accounts)
- [GitHub Docs: Customizing your organization's profile](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/customizing-your-organizations-profile)

### Architecture pattern references (MEDIUM confidence — multi-source verified)
- [SaaS multi-tenant architecture design patterns (2025)](https://zenn.dev/shineos/articles/saas-multi-tenant-architecture-2025?locale=en)
- [WorkOS: Developer's guide to SaaS multi-tenant architecture](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)
- [AWS: Tenant routing strategies for SaaS applications](https://aws.amazon.com/blogs/networking-and-content-delivery/tenant-routing-strategies-for-saas-applications-on-aws/)
- [Clerk: Multi-Tenant vs. Single-Tenant SaaS Architecture](https://clerk.com/blog/multi-tenant-vs-single-tenant)
- [Page Flows: Vercel Creating a team flow](https://pageflows.com/post/desktop-web/creating-a-team/vercel/)

### Local files informing this research
- `C:\Users\User\Desktop\projetos_skale\xtimator\xtimator\.planning\PROJECT.md` — milestone goals, locked decisions, out-of-scope list
- `C:\Users\User\Desktop\projetos_skale\xtimator\xtimator\components\app-shell\company-selector.tsx` — existing UI scaffold to extend
- `C:\Users\User\Desktop\projetos_skale\xtimator\xtimator\components\onboarding\onboarding-survey.tsx` — existing single-company flow to dual-mode
- `C:\Users\User\Desktop\projetos_skale\xtimator\xtimator\lib\actions\company.ts` — existing upsert action to split
