/**
 * lib/estimate/ingest/multimodal.ts
 *
 * UNIFY-01 — the single, channel-neutral "raw media -> text" ingestion path.
 *
 * Given raw inputs (audio Blobs, base64 photos, free-form texts) this returns
 * { transcripts, photoDescriptions, texts } over the fallback-wrapped primitives
 * `transcribeAudioOR` / `analyzePhotoOR` (which, post-Phase-99, already carry the
 * OpenRouter->Gemini provider fallback). One place owns "raw media -> text", with
 * one fallback + one per-item error policy, reused by refine + WhatsApp + (at the
 * assembly level) web/MCP.
 *
 * Per-item failure policy: a SINGLE failed media item is caught and SKIPPED — the
 * aggregate result still resolves with the remaining items. This mirrors today's
 * refine per-photo try/catch and the WhatsApp processMessage ok:false outcome.
 * The per-item try/catch here is ONLY for skip-not-throw; it is NOT a provider
 * fallback layer (the primitives already carry that — do NOT double-wrap).
 *
 * This module is channel-neutral: it imports NOTHING from lib/whatsapp/*, so it
 * stays safe under the graph-neutrality invariant when consumed by neutral code.
 */

import { transcribeAudioOR, analyzePhotoOR } from '@/lib/ai/openrouter-client'
import { getTranscriptionModel } from '@/lib/platform-config'

export interface MultimodalRawInput {
  /** Audio items as Blobs + their container ext (refine: from FormData; whatsapp: built from buffer). */
  audio?: Array<{ blob: Blob; ext: string }>
  /** Photos already in base64 + mime (refine: base64 from arrayBuffer; whatsapp: buffer.toString('base64')). */
  photos?: Array<{ base64: string; mimeType: string }>
  /** Free-form text (instruction text, whatsapp text body). */
  texts?: string[]
}

export interface MultimodalIngestResult {
  transcripts: string[]
  photoDescriptions: string[]
  texts: string[]
}

/**
 * Channel-neutral raw-media -> text. NEVER throws on a single-item failure — a
 * failed item is skipped; the aggregate result still returns. Uses the
 * fallback-wrapped primitives so OpenRouter->Gemini fallback applies uniformly
 * (Phase 99). Does NOT add a second fallback layer.
 */
export async function ingestMultimodal(
  input: MultimodalRawInput
): Promise<MultimodalIngestResult> {
  const transcripts: string[] = []
  const sttModel = (input.audio?.length ?? 0) > 0 ? await getTranscriptionModel() : undefined
  for (const a of input.audio ?? []) {
    try {
      const t = await transcribeAudioOR(a.blob, a.ext, sttModel)
      if (t) transcripts.push(t)
    } catch (e) {
      console.error('[ingest] transcription failed:', e)
    }
  }

  const photoDescriptions: string[] = []
  for (const p of input.photos ?? []) {
    try {
      const d = await analyzePhotoOR(p.base64, p.mimeType)
      if (d) photoDescriptions.push(d)
    } catch (e) {
      console.error('[ingest] vision failed:', e)
    }
  }

  const texts = (input.texts ?? []).map((t) => t.trim()).filter(Boolean)

  return { transcripts, photoDescriptions, texts }
}
