/**
 * SEED-055 Phase D: operations the credit pre-gate can price. Client-safe (no
 * server-only import) so the admin form and the server config share one list.
 */
export type EstimatedCreditOp =
  | 'estimate'
  | 'photo_batch'
  | 'audio_minutes'
  | 'price_research'
  | 'chat'

export const ESTIMATED_CREDIT_OPS: readonly EstimatedCreditOp[] = [
  'estimate',
  'photo_batch',
  'audio_minutes',
  'price_research',
  'chat',
]
