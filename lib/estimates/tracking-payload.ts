import { z } from 'zod'
import { requireServiceClient } from '@/lib/supabase/service'
import { isShareLinkExpired } from '@/lib/estimates/share-link'

const MAX_EVENTS_PER_BATCH = 25
// Server-emitted-only event types (unlock_ok/unlock_fail, written directly by
// the password-unlock server action in a later plan) are deliberately NOT in
// this list — a public caller must never be able to forge them.
const CLIENT_EVENT_TYPES = ['view', 'click', 'scroll_depth', 'section_view', 'heartbeat'] as const

/** Coerces to a finite number and clamps into [min, max] rather than rejecting — a
 *  slightly-out-of-range value from a real browser (e.g. a fractional viewport
 *  width) should still be recorded, just bounded. */
function clampedNumber(min: number, max: number) {
  return z
    .number()
    .finite()
    .transform((n) => Math.min(max, Math.max(min, n)))
}

const TrackEventSchema = z.object({
  event_type: z.enum(CLIENT_EVENT_TYPES),
  target: z.string().trim().min(1).max(200).optional(),
  x_pct: clampedNumber(0, 100).optional(),
  y_px: clampedNumber(0, 500_000).optional(),
  doc_h: clampedNumber(0, 500_000).optional(),
  viewport_w: clampedNumber(0, 20_000).optional(),
  device: z.enum(['mobile', 'desktop']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const TrackBodySchema = z.object({
  token: z.string().trim().min(1).max(200),
  visitor_id: z.string().trim().min(1).max(100),
  session_id: z.string().trim().min(1).max(100),
  events: z.array(TrackEventSchema).min(1),
})

export type TrackEvent = z.infer<typeof TrackEventSchema>
export type TrackBody = z.infer<typeof TrackBodySchema>

/**
 * Validates + normalizes the raw beacon payload. Never throws — returns null
 * for anything malformed so the caller can drop silently (no 400s to a
 * fire-and-forget beacon). Batches over MAX_EVENTS_PER_BATCH are TRUNCATED,
 * not rejected outright — a chatty tab still gets some of its events
 * recorded rather than none. Exported for unit testing only (not an HTTP
 * handler — the mutation-boundary sweep only inspects GET/POST/etc exports).
 */
export function parseTrackBody(raw: unknown): TrackBody | null {
  const parsed = TrackBodySchema.safeParse(raw)
  if (!parsed.success) return null
  return {
    ...parsed.data,
    events: parsed.data.events.slice(0, MAX_EVENTS_PER_BATCH),
  }
}

type ResolvedEstimate = { id: string; company_id: string }

/** Exact-match token resolution — share_token first, then public_slug_token
 *  (PUBURL-01 friendly-URL sibling). Expired links resolve to null exactly
 *  like unknown ones (no oracle — see lib/queries/share.ts's identical
 *  discipline). Exported for unit testing only. */
export async function resolveEstimateByToken(
  supabase: ReturnType<typeof requireServiceClient>,
  token: string
): Promise<ResolvedEstimate | null> {
  const { data: byShareToken } = await supabase
    .from('estimates')
    .select('id, company_id, share_expires_at')
    .eq('share_token', token)
    .maybeSingle()

  const row =
    byShareToken ??
    (
      await supabase
        .from('estimates')
        .select('id, company_id, share_expires_at')
        .eq('public_slug_token', token)
        .maybeSingle()
    ).data

  if (!row) return null

  const typedRow = row as { id: string; company_id: string; share_expires_at: string | null }
  if (isShareLinkExpired(typedRow.share_expires_at)) return null

  return { id: typedRow.id, company_id: typedRow.company_id }
}
