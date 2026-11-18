// Pure popup URLs shared by lightweight editor controls and the app shell.

export const NEW_PROJECT_MODAL_PARAM = 'modal'
export const NEW_PROJECT_MODAL_VALUE = 'new-project'
/** Optional: pre-link the new project to a client (used by the client page). */
export const NEW_PROJECT_CLIENT_PARAM = 'clientId'
/** Optional: when set, the popup edits an EXISTING project's estimate (Edit with
 * AI) instead of creating a new project. Same popup, shared between new + edit. */
export const NEW_PROJECT_EDIT_PARAM = 'editProjectId'

/** Build the href that opens the new-project modal from any page. */
export function newProjectHref(currentSearch?: string, clientId?: string): string {
  const params = new URLSearchParams(currentSearch ?? '')
  params.set(NEW_PROJECT_MODAL_PARAM, NEW_PROJECT_MODAL_VALUE)
  if (clientId) params.set(NEW_PROJECT_CLIENT_PARAM, clientId)
  return `?${params.toString()}`
}

/** Optional, edit mode only: text the popup seeds into its text box once on open
 * (read and removed from the URL by the wizard). Used by "Answer with AI". */
export const NEW_PROJECT_PREFILL_PARAM = 'refinePrefill'

/** Build the href that opens the SAME popup in edit mode for an existing project. */
export function editEstimateHref(
  currentSearch: string | undefined,
  projectId: string,
  prefill?: string,
): string {
  const params = new URLSearchParams(currentSearch ?? '')
  params.set(NEW_PROJECT_MODAL_PARAM, NEW_PROJECT_MODAL_VALUE)
  params.set(NEW_PROJECT_EDIT_PARAM, projectId)
  if (prefill) params.set(NEW_PROJECT_PREFILL_PARAM, prefill)
  return `?${params.toString()}`
}
