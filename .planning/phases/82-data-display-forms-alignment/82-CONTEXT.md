# Phase 82: Data Display & Forms Alignment — Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Update tables, loading skeletons, empty states, Sonner toasts, and form page layouts to use the new token vocabulary. Final pass that ensures every page in the app — not just the shell and core components — feels visually consistent with Xphere.

**Out of scope:** New features, new pages, auth/marketing pages. Shell (Phase 80). Core components (Phase 81).

</domain>

<decisions>
## Implementation Decisions

### Tables (TanStack Table)

- **D-01:** Table container: `bg-[--bg-secondary] border border-[--border] rounded-lg overflow-hidden`.
- **D-02:** Header row: `bg-[--bg-tertiary] border-b border-[--border]`. Header cells: `text-[--text-secondary] text-xs font-medium uppercase tracking-wider px-4 py-3`.
- **D-03:** Body rows: `bg-[--bg-secondary] hover:bg-[--bg-tertiary] border-b border-[--border-subtle] transition-colors duration-[--motion-fast]`.
- **D-04:** Last row: no bottom border.
- **D-05:** Selected row: `bg-[--accent-muted]`.

### Loading Skeletons

- **D-06:** Skeleton base: `bg-[--bg-tertiary] animate-pulse rounded` — no old shimmer gradient animation.
- **D-07:** Apply skeletons consistently on all async list views (clients, projects, estimates, price book, admin pages).
- **D-08:** Skeleton shapes match the actual content they replace (line, card, row).

### Empty States

- **D-09:** Standard pattern: vertically centered in container, icon `text-[--text-tertiary] w-12 h-12 mb-4`, title `text-[--text-primary] text-base font-semibold`, description `text-[--text-secondary] text-sm mt-1`, optional CTA button below.
- **D-10:** Apply to: clients list, projects list, estimates list, price book, admin lists, any other list view that currently has a custom empty state.

### Sonner Toasts

- **D-11:** Default toast: `bg-[--bg-elevated] border border-[--border] text-[--text-primary] shadow-[--shadow-md]`.
- **D-12:** Success toast: left accent border `border-l-4 border-l-[--success]`.
- **D-13:** Error toast: left accent border `border-l-4 border-l-[--danger]`.
- **D-14:** No glass, no gradient backgrounds on toasts.

### Form Page Layouts

- **D-15:** Settings page sections: `space-y-6` between sections, section header `text-[--text-primary] text-sm font-semibold`, section separator `border-t border-[--border-subtle] my-6`.
- **D-16:** Field groups within a section: `space-y-4`.
- **D-17:** Field labels: `text-[--text-secondary] text-sm font-medium mb-1.5` (handled by Label component from Phase 81).
- **D-18:** Helper/description text below fields: `text-[--text-tertiary] text-xs mt-1`.
- **D-19:** Error text below fields: `text-[--danger] text-xs mt-1`.

### Scrollbars

- **D-20:** Custom webkit scrollbars: `10px width`, `bg-[--bg-tertiary]` track, `bg-[--border-strong]` thumb, `hover:bg-[--text-tertiary]` thumb hover. Match Xphere's scrollbar pattern.

### Claude's Discretion

- Whether pagination components (if any) need updates — apply same table token treatment.
- Whether DataTable wrapper components used across pages need centralized updates or per-page updates — prefer centralized reusable wrapper.

</decisions>

<canonical_refs>
## Canonical References

### Xphere Reference Files
- `C:\Users\Vanildo\Dev\xphere\src\app\globals.css` — scrollbar utilities, animation utilities
- `C:\Users\Vanildo\Dev\xphere\src\components\ui\` — any table/skeleton/empty-state patterns

### Xtimator Files to Edit
- `components/ui/skeleton.tsx` — update animation approach
- Any `*-table.tsx` or `*-data-table.tsx` components — update row/header styling
- `components/ui/sonner.tsx` (or Toaster config) — re-skin with new tokens
- Settings form components: `components/settings/*.tsx` — update section/field layout
- Empty state components or inline empty state JSX across list pages

### Depends On
- Phase 79 (tokens) and Phase 81 (components) must be complete

</canonical_refs>

<code_context>
## Existing Code Insights

### Tables
- Multiple data tables exist across clients, projects, estimates, price book, admin pages
- TanStack Table is configured via wrapper components — updating wrappers propagates to all tables

### Skeleton
- `components/ui/skeleton.tsx` likely uses Tailwind `animate-pulse` or a custom shimmer — normalize to `bg-[--bg-tertiary] animate-pulse`

### Sonner
- `components/ui/sonner.tsx` wraps the Toaster — this is where theme overrides go
- Custom CSS in globals.css may also style `.sonner-toast` selectors

### Form Pages
- Settings pages at `app/(app)/settings/` use various form layouts
- Admin pages at `app/admin/` have their own form patterns

</code_context>

<specifics>
## Specific Ideas

This phase is the "polish pass" — after 79/80/81, the bones are right. Phase 82 ensures the details that users see most (tables, forms, notifications) also match. No bold design moves here, just systematic token application.

</specifics>

<deferred>
## Deferred Ideas

- **Command palette cmdk styling** — nice-to-have but not blocking sibling status.
- **Recharts / data visualization alignment** — chart colors use semantic tokens and will auto-update; custom chart theming is a separate effort.
- **Marketing landing page** (`/`) and auth pages — these have their own scoped themes and are not part of the dashboard alignment scope.

</deferred>

---

*Phase: 82-data-display-forms-alignment*
*Context gathered: 2026-05-22*
