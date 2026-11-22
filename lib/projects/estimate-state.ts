// lib/projects/estimate-state.ts
//
// ONE estimate vocabulary for project lists and badges (decision
// XTM-D-20261121-no-draft-state): Not opened yet / Viewed / Accepted / Declined,
// derived from what the client did. It reads the state already computed by
// lib/queries/estimate-list-status.ts (same rule as the editor's status chip).

import type { EstimateListState, EstimateListStatus } from '@/lib/queries/estimate-list-status'

/** The status-tab values that filter by estimate state (everything else filters by project status). */
export const ESTIMATE_STATE_TABS: ReadonlyArray<EstimateListState> = ['unopened', 'viewed', 'accepted', 'declined']

export interface EstimateStateCarrier {
  status: string
  estimate_status?: Pick<EstimateListStatus, 'state'> | null
}

/** The estimate state a project row shows, or null when it has no estimate yet / is paused for credits. */
export function projectEstimateState(project: EstimateStateCarrier): EstimateListState | null {
  if (project.status === 'awaiting_credits') return null
  return project.estimate_status?.state ?? null
}

/** Status-tab filter: an estimate-state tab matches on the derived state, any other value on project.status. */
export function matchesStatusTab(tabValue: string, project: EstimateStateCarrier): boolean {
  if ((ESTIMATE_STATE_TABS as ReadonlyArray<string>).includes(tabValue)) {
    return projectEstimateState(project) === tabValue
  }
  return project.status === tabValue
}
