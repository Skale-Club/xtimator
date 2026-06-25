/**
 * lib/agent-tools/normalize-input.ts
 *
 * NEUT-03 — channel-neutral "raw input -> text" normalization (ENGINE-01).
 *
 * Wraps the single neutral ingest primitive (ingestMultimodal) so audio becomes
 * a transcript and a photo becomes a vision analysis, returning the SAME
 * { text, kind, ok, reason? } shape the WhatsApp normalizer returns today. It
 * takes a channel-neutral discriminated input — the codec/ext derivation and any
 * media download live in the per-channel ADAPTER, NOT here. This module imports
 * NOTHING from any single channel (enforced by the static neutrality gate).
 *
 * One fallback policy only: ingestMultimodal already carries the provider
 * fallback + per-item skip-not-throw (Phase 99/UNIFY-01) — do NOT re-add a
 * second transcribe/analyze path. NEVER throws.
 */
import { ingestMultimodal } from '@/lib/estimate/ingest/multimodal'

export type NormalizeKind = 'text' | 'audio' | 'photo' | 'unknown'

export interface NormalizeResult {
  text: string
  kind: NormalizeKind
  ok: boolean
  reason?: string
}

export type NormalizeInput =
  | { kind: 'text'; body: string }
  | { kind: 'audio'; blob: Blob; ext: string }
  | { kind: 'photo'; base64: string; mimeType: string; caption?: string }

export async function normalizeInput(input: NormalizeInput): Promise<NormalizeResult> {
  // --- text ---------------------------------------------------------------
  if (input.kind === 'text') {
    return { text: input.body, kind: 'text', ok: true }
  }

  // --- audio --------------------------------------------------------------
  if (input.kind === 'audio') {
    try {
      const { transcripts } = await ingestMultimodal({
        audio: [{ blob: input.blob, ext: input.ext }],
      })
      const text = transcripts[0]
      if (!text) return { text: '', kind: 'audio', ok: false, reason: 'empty_transcript' }
      return { text, kind: 'audio', ok: true }
    } catch (err) {
      // Belt-and-suspenders: ingestMultimodal already swallows per-item
      // failures, so this should be unreachable — but normalizeInput NEVER throws.
      console.error('[normalize] audio transcription failed:', err)
      return { text: '', kind: 'audio', ok: false, reason: 'transcription_failed' }
    }
  }

  // --- photo --------------------------------------------------------------
  try {
    const { photoDescriptions } = await ingestMultimodal({
      photos: [{ base64: input.base64, mimeType: input.mimeType }],
    })
    const description = photoDescriptions[0] ?? ''
    const caption = input.caption?.trim()
    const text = caption ? `${caption}\n\n${description}` : description
    if (!text) return { text: '', kind: 'photo', ok: false, reason: 'empty_analysis' }
    return { text, kind: 'photo', ok: true }
  } catch (err) {
    console.error('[normalize] image analysis failed:', err)
    return { text: '', kind: 'photo', ok: false, reason: 'analysis_failed' }
  }
}
