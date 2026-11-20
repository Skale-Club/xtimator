/**
 * SEED-055 Phase D: operations the credit pre-gate can price. Client-safe (no
 * server-only import) so the admin form and the server config share one list.
 */
export type EstimatedCreditOp =
  | 'estimate'
  // Credit recalibration 2026-11-19: an AI edit of an existing estimate.
  | 'refine'
  | 'photo_batch'
  | 'audio_minutes'
  | 'price_research'
  | 'chat'

export const ESTIMATED_CREDIT_OPS: readonly EstimatedCreditOp[] = [
  'estimate',
  'refine',
  'photo_batch',
  'audio_minutes',
  'price_research',
  'chat',
]
