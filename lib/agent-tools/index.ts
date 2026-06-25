/**
 * lib/agent-tools/ — channel-neutral domain capability functions.
 *
 * Barrel re-exporting the neutral capability functions consumed by every
 * channel (WhatsApp adapters today; AI-SDK chat + MCP from Phase 124). This
 * module tree is channel-neutral by invariant (ENGINE-01 / NEUT-05) — it imports
 * NOTHING from any single channel (enforced by the static neutrality gate).
 */
export {
  findClientByName,
  getLatestEstimateForClient,
  getProjectStatus,
  listRecentEstimates,
  listServices,
  findServiceByName,
} from './query-company-data'

export {
  normalizeInput,
  type NormalizeKind,
  type NormalizeResult,
  type NormalizeInput,
} from './normalize-input'
