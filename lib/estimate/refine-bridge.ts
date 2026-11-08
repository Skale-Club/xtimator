// lib/estimate/refine-bridge.ts
//
// Client-side bridge between the "Edit with AI" popup (mounted once in the
// app-shell layout, components/projects/new-project-dialog.tsx) and the
// estimate editor (mounted by the project page). They are siblings in the React
// tree with no shared parent that is cheap to thread props through, but they
// live in the same browser JS context, so a module-level registry is the
// smallest thing that works:
//
//   - the editor REGISTERS a handle while it is mounted (flush unsaved edits,
//     read the live content, apply a refinement);
//   - the popup LOOKS UP the handle for the estimate it is refining and calls
//     it directly (typed, awaitable, no event/ack protocol to get wrong).
//
// When no editor is mounted (popup opened from another page) the popup hands
// the reviewed payload over through sessionStorage and navigates to the
// project's estimate tab; the editor consumes the handoff on mount and applies
// it through the exact same code path.

import type { RefinementPayload } from '@/components/workspace/estimate/use-estimate-reducer'
import type { MergeCurrentContent } from '@/lib/estimate/refine-merge'

export type RefineFlushResult = { ok: true } | { ok: false; error: string }

/** saved: applied and persisted. unsaved: applied in the editor, save failed
 *  (the editor keeps the edits and surfaces its own error). blocked: the
 *  editor is read-only (locked / superseded), nothing was applied. */
export type RefineApplyResult = 'saved' | 'unsaved' | 'blocked'

export interface RefineEditorHandle {
  /** Id of the estimate version the editor is currently showing. */
  estimateId(): string
  /** Live editor content, including unsaved edits (feeds the review diff). */
  getContent(): MergeCurrentContent
  /** Currency used to format the review's prices. */
  currencyCode(): string
  /** Persist unsaved edits. Resolves ok when there is nothing to save. */
  flush(): Promise<RefineFlushResult>
  /** Dispatch APPLY_REFINEMENT with exactly `refined`, then save. */
  apply(refined: RefinementPayload): Promise<RefineApplyResult>
}

let activeEditor: RefineEditorHandle | null = null

/** Register the mounted editor. Returns the unregister function (effect cleanup). */
export function registerRefineEditor(handle: RefineEditorHandle): () => void {
  activeEditor = handle
  return () => {
    if (activeEditor === handle) activeEditor = null
  }
}

/** The mounted editor, only when it is showing `estimateId`. */
export function getRefineEditor(estimateId: string): RefineEditorHandle | null {
  if (!activeEditor) return null
  return activeEditor.estimateId() === estimateId ? activeEditor : null
}

// ---------------------------------------------------------------------------
// sessionStorage handoff (no editor mounted when the user applies)
// ---------------------------------------------------------------------------

const HANDOFF_KEY = 'xtimator:pending-refinement'
/** A handoff older than this is stale (the user never landed on the editor). */
const HANDOFF_MAX_AGE_MS = 10 * 60 * 1000

interface PendingRefinement {
  estimateId: string
  refined: RefinementPayload
  createdAt: number
}

export function storePendingRefinement(estimateId: string, refined: RefinementPayload): boolean {
  try {
    const value: PendingRefinement = { estimateId, refined, createdAt: Date.now() }
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** Read-and-remove the handoff for `estimateId`; null when absent, stale or for another estimate. */
export function consumePendingRefinement(estimateId: string, now = Date.now()): RefinementPayload | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingRefinement
    if (parsed.estimateId !== estimateId) return null
    sessionStorage.removeItem(HANDOFF_KEY)
    if (now - parsed.createdAt > HANDOFF_MAX_AGE_MS) return null
    return parsed.refined
  } catch {
    return null
  }
}
