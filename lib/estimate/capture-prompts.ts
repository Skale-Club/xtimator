// lib/estimate/capture-prompts.ts
//
// Notices review stage 1, part 2 (2026-11-20): the project page's "Almost
// there" empty state hands the AI's clarifying questions to the New Xtimate
// recorder it opens, so the owner sees what to talk about while recording.
// Same shape as refine-bridge.ts: the popup and the project page are siblings
// in one browser JS context, so a module-level slot is the smallest thing that
// works. Reading does not clear (React may mount the recorder twice in
// development); the project page clears it once the project stops waiting.

let pending: { projectId: string; questions: string[] } | null = null

export function setCapturePrompts(projectId: string, questions: readonly string[]): void {
  const list = questions.map((q) => q.trim()).filter(Boolean)
  pending = list.length > 0 ? { projectId, questions: list } : null
}

/** The questions handed over for `projectId` (empty when none). */
export function readCapturePrompts(projectId: string): string[] {
  return pending && pending.projectId === projectId ? pending.questions : []
}

export function clearCapturePrompts(projectId: string): void {
  if (pending?.projectId === projectId) pending = null
}
