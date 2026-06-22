# Phase 102 — UI Design Contract: Needs-Details Recourse Banner

**Scope:** ONE small surface — a recourse banner shown when a project is stuck in `awaiting_details` (a vague estimate that survived the auto-refine cap). Reuses existing components and design tokens. **No editor/workspace redesign** (REQUIREMENTS Out-of-Scope).

## Where
- **Host component:** `components/workspace/overview-tab.tsx` (the project overview where `project` is in scope and the no-/empty-estimate state renders).
- **Detection:** `project.status === 'awaiting_details'` — already a server prop (`ProjectDetail`, read in `project-header.tsx:29`); written by the web adapter (`lib/estimate/adapters/default.ts`). No new query, no hook change.

## Component
- **Reuse `components/ui/alert.tsx`** — a `warning`/`default` variant alert (match existing alert usage in the workspace; do NOT invent a new style). Dark-mode-first via existing tokens.
- Icon: existing lucide icon already used for warnings/info in the app (e.g. `AlertCircle` / `Info`) — match current convention.

## States
| State | Condition | Render |
|-------|-----------|--------|
| Hidden | `project.status !== 'awaiting_details'` | nothing (banner not in DOM) |
| Visible | `project.status === 'awaiting_details'` | Alert with title + body copy + primary CTA |
| Regenerating | CTA pressed → generation dispatched | CTA shows pending/disabled state via the existing generate trigger's loading UX (reuse `use-job-status` pending) |

## Copy (i18n — add keys to existing en/pt/es bundles)
- **Title:** "We need a bit more detail" / (PT) "Precisamos de mais alguns detalhes" / (ES) "Necesitamos algunos detalles más"
- **Body:** "The estimate came out too vague. Add more about the job — materials, measurements, scope — and we'll rebuild it." (translate PT/ES)
- **CTA label:** "Add details & regenerate" / "Adicionar detalhes e gerar de novo" / "Agregar detalles y regenerar"

## CTA behavior
- Routes back into the existing capture/describe entry on the project (reuse `CaptureModePicker` / `AIInputGroup` → `POST /api/generate-estimate`) — the SAME trigger the normal generate flow uses. Do NOT build a new generation path.
- After dispatch, reuse the existing job-status polling UX. On success the project leaves `awaiting_details` and the banner naturally disappears (status changes).

## Accessibility / responsive
- Alert is keyboard-focusable; CTA is a real `<button>`/`Button`. Banner is full-width within the overview column, stacks above the (empty) estimate area. Reuse existing responsive spacing tokens.

## Out of scope
- No dismiss-and-persist preference, no new modal, no editor changes, no animation beyond what `alert.tsx` already provides.
