# Phase 20: Price Book CRUD UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 20-price-book-crud-ui
**Areas discussed:** Page navigation, Category grouping display, Add/Edit interaction, Empty state

---

## Page Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| New tab in SettingsTabs | Adds "Price Book" as 6th tab alongside company/defaults/notifications/appearance/account | |
| Standalone /settings/price-book page | Sub-route following /settings/appearance pattern, linked from settings page | ✓ |
| Sidebar NAV_ITEMS direct link | Adds Price Book to main nav alongside Dashboard/Projects/Clients/Settings | |

**User's choice:** Recommended default — standalone page at `/settings/price-book`
**Notes:** ROADMAP explicitly names the URL. Sub-route pattern already established by `/settings/appearance`. SettingsTabs already has 5 tabs.

---

## Category Grouping Display

| Option | Description | Selected |
|--------|-------------|----------|
| Flat table with Category column | All items in one table, category as a sortable column | |
| Always-expanded sections per category | One header + item list per category, all visible, alphabetically sorted | ✓ |
| Collapsible accordion per category | Categories collapse/expand, compact when many categories exist | |

**User's choice:** Recommended default — always-expanded sections
**Notes:** Categories are free-form and user-defined. Always-expanded is cleaner for a settings page; accordion adds complexity without clear benefit at expected scale (tens of items, not thousands).

---

## Add / Edit Interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Dialog (like ClientSheet) | Modal form with 5 fields, react-hook-form + zod, existing pattern | ✓ |
| Inline row editing | Click cell to edit in place, save on blur/Enter | |
| Sheet (slide-over panel) | Same as Dialog but as a side drawer | |

**User's choice:** Recommended default — Dialog matching ClientSheet pattern
**Notes:** "In-place" in ROADMAP success criteria refers to the list reflecting changes immediately after save, not cell-level editing. Dialog is established, tested, and consistent.

---

## Empty State

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal — just Add button | Only an "Add first item" CTA, no context | |
| Brief explanation + CTA | 2-line explanation of optionality + single "Add first item" button | ✓ |
| Rich onboarding card | Expanded explanation with example items, category suggestions | |

**User's choice:** Recommended default — brief explanation + CTA
**Notes:** PB-06 requires communicating optionality. Two lines suffice; full onboarding card is unnecessary for a settings audience.

---

## Claude's Discretion

- Table rows vs card rows within category sections
- Exact zod schema validations
- Loading skeleton implementation
- Dialog vs Sheet for the add/edit form

## Deferred Ideas

- CSV import (PB-05) — Phase 21
- Bulk operations — out of scope for v1.3
- Direct sidebar link for Price Book — entry via Settings is sufficient
