// lib/capture/refine-client.ts
//
// Browser-side caller for POST /api/estimates/[id]/refine (a PREVIEW: the route
// never writes the estimate). Kept free of React so it is trivially testable.

import type { RefinementPayload } from '@/components/workspace/estimate/use-estimate-reducer'

export interface RefineInput {
  /** Typed instruction (may be empty when audio/photos are supplied). */
  instruction: string
  audio?: Blob | null
  photos?: Blob[]
}

export type RefineResult =
  | { ok: true; refined: RefinementPayload; instruction: string }
  | {
      ok: false
      error: string
      /** Server error code, e.g. 'estimate_locked'. */
      code?: string
      /** 402 credit gate: the billing state to feed showBillingBlockToast. */
      billing?: 'paywalled' | 'out_of_credits'
    }

export const REFINE_MAX_PHOTOS = 5

export async function requestRefine(
  estimateId: string,
  input: RefineInput,
  signal?: AbortSignal,
): Promise<RefineResult> {
  const form = new FormData()
  if (input.instruction.trim()) form.set('instruction', input.instruction.trim())
  if (input.audio && input.audio.size > 0) {
    const ext = input.audio.type.includes('mp4') ? 'mp4' : 'webm'
    form.set('audio', input.audio, `voice.${ext}`)
  }
  for (const photo of (input.photos ?? []).slice(0, REFINE_MAX_PHOTOS)) {
    form.append('photos', photo, 'photo.jpg')
  }

  let res: Response
  try {
    res = await fetch(`/api/estimates/${estimateId}/refine`, { method: 'POST', body: form, signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return { ok: false, error: 'Network error. Check your connection and try again.' }
  }

  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean
    refined?: RefinementPayload
    instruction?: string
    error?: string
    code?: string
    reason?: string
    state?: string
  }

  if (res.ok && body.success && body.refined) {
    return { ok: true, refined: body.refined, instruction: body.instruction ?? input.instruction }
  }
  if (res.status === 402) {
    const billing = body.state === 'paywalled' || body.state === 'out_of_credits' ? body.state : 'out_of_credits'
    return { ok: false, error: body.error ?? 'Not enough credits', code: body.reason ?? body.code, billing }
  }
  return { ok: false, error: body.error ?? 'Could not refine the estimate', code: body.code }
}
