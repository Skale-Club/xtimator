/** Metadata-only verification; never accepts an unlimited or resetting eval key. */
export function verifyEvalBudget(value: unknown, approvedUsd = 5) {
  const data = value as Record<string, unknown> | null
  if (!data || !Number.isFinite(approvedUsd) || approvedUsd <= 0) {
    throw new Error('Invalid evaluation budget metadata')
  }
  const limit = data.limit
  const remaining = data.limit_remaining
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0 || limit > approvedUsd) {
    throw new Error('Evaluation key must have a finite total limit within the approved budget')
  }
  if (!Object.hasOwn(data, 'limit_reset') || data.limit_reset !== null) {
    throw new Error('Evaluation key must not reset its spending limit')
  }
  if (typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining <= 0 || remaining > limit) {
    throw new Error('Evaluation key has no verifiable remaining budget')
  }
  if (data.is_management_key !== false) {
    throw new Error('Evaluation requires a generation key, not a management key')
  }
  return { limitUsd: limit, remainingUsd: remaining, resets: false as const }
}
