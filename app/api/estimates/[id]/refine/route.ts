// app/api/estimates/[id]/refine/route.ts
//
// SEED-028 Phase C → Phase 101 (HARD-01, UNIFY-03): refine THROUGH the canonical graph.
//
// Accepts FormData with optional `instruction` (text), `audio` (file), and
// `photos[]` (image files), OR JSON `{ instruction }` (text-only back-compat).
// Audio + image + text are ingested via the SHARED `ingestMultimodal` module
// (one transcription/vision implementation with Phase-99 fallbacks), assembled
// into a single instruction, then handed to `buildRefineGraph` invoked INLINE
// (passthrough StepRunner). Refine thereby inherits the Phase-99 provider
// fallback + Phase-100 zod validation/retry + guardrails for free.
//
// This endpoint never writes the estimate to the database — refine is a PREVIEW.
// The caller dispatches the refined state into the editor (mark dirty) and
// persists later via saveEstimate. The response contract `{ success, refined,
// instruction }` + status codes (400/422/429/demo-guard) are byte-stable.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEstimateById } from '@/lib/queries/estimate'
import type { EstimateOutput, EstimateSectionOutput } from '@/lib/ai/types'
import { ingestMultimodal } from '@/lib/estimate/ingest/multimodal'
import { buildRefineGraph } from '@/lib/estimate/graph/refine-graph'
import { makeRefineAdapter } from '@/lib/estimate/adapters/refine'
import { rateLimit } from '@/lib/ratelimit'
import { demoGuardResponse } from '@/lib/demo/guard'
import { asResponse, XtimatorError, throwIfNotFound, throwIfForbidden } from '@/lib/errors'

const MAX_PHOTOS = 5

function getImageMimeType(file: Blob): string {
  switch (file.type) {
    case 'image/png':  return 'image/png'
    case 'image/webp': return 'image/webp'
    case 'image/gif':  return 'image/gif'
    default:           return 'image/jpeg'
  }
}

/** Map an audio MIME type to the container ext `transcribeAudioOR` expects. */
function extFromMime(type: string): string {
  switch (type) {
    case 'audio/mp4':  return 'mp4'
    case 'audio/mpeg': return 'mp3'
    case 'audio/webm': return 'webm'
    default:           return 'webm'
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: estimateId } = await params

    // Auth
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      throw new XtimatorError('unauthorized', 'estimates', 'Not authenticated')
    }

    // Read-only demo: refine runs paid AI (Whisper + Vision + Claude). Block it.
    const blocked = await demoGuardResponse()
    if (blocked) return blocked

    // Security Review S05 — rate limit: refine runs Whisper + Vision + Claude
    // in a single request, so it is the most cost-amplifying endpoint.
    const rl = await rateLimit('refinePerMinute', claims.sub)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many refine requests', code: 'rate_limit:refine' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      )
    }

    const { data: companyRow } = await supabase
      .from('companies')
      .select('id, default_tax_rate, default_payment_terms, default_warranty_terms')
      .eq('user_id', claims.sub)
      .single()

    if (!companyRow) {
      throw new XtimatorError('unauthorized', 'estimates', 'No company found')
    }
    const companyId = companyRow.id as string

    // Fetch current estimate
    const estimate = await getEstimateById(supabase, estimateId)
    throwIfNotFound(estimate, 'estimates', 'Estimate not found')
    throwIfForbidden(estimate.company_id === companyId, 'estimates', 'Unauthorized')
    if (!estimate.is_current) {
      throw new XtimatorError(
        'bad_request',
        'estimates',
        'Cannot refine an old version. Switch to the current version first.'
      )
    }

    // -------------------------------------------------------------------------
    // Parse multimodal input. Supports either FormData (multipart) or JSON.
    // -------------------------------------------------------------------------
    let instructionText = ''
    let audioFile: Blob | null = null
    const photoFiles: Blob[] = []
    // Tracks whether ANY raw input was supplied (even whitespace-only text). Drives
    // the 400 (nothing provided) vs 422 (provided but unusable after assembly) split.
    let hasRawInput = false

    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const text = form.get('instruction')
      if (typeof text === 'string') {
        instructionText = text.trim()
        if (text.length > 0) hasRawInput = true
      }

      const audio = form.get('audio')
      if (audio instanceof Blob && audio.size > 0) {
        if (!audio.type.startsWith('audio/')) {
          return NextResponse.json({ error: 'Invalid audio file type' }, { status: 400 })
        }
        audioFile = audio
      }

      const photos = form.getAll('photos')
      for (const photo of photos) {
        if (!(photo instanceof Blob)) continue
        if (photo.size === 0) continue
        if (!photo.type.startsWith('image/')) {
          return NextResponse.json({ error: 'Invalid photo file type' }, { status: 400 })
        }
        photoFiles.push(photo)
        if (photoFiles.length >= MAX_PHOTOS) break
      }
    } else {
      const body = await request.json().catch(() => null)
      if (typeof body?.instruction === 'string' && body.instruction.length > 0) {
        instructionText = body.instruction.trim()
        hasRawInput = true
      }
    }

    if (audioFile || photoFiles.length > 0) hasRawInput = true

    if (!hasRawInput) {
      return NextResponse.json(
        { error: 'Provide an instruction, audio, or at least one photo.' },
        { status: 400 }
      )
    }

    // -------------------------------------------------------------------------
    // SHARED multimodal ingestion (UNIFY-03): audio + photos + text flow through
    // the one transcription/vision implementation with Phase-99 fallbacks. No
    // storage round-trip — `transcribeAudioOR` accepts the Blob directly (the old
    // upload→download→delete dance had no retention purpose).
    // -------------------------------------------------------------------------
    const ingest = await ingestMultimodal({
      audio: audioFile ? [{ blob: audioFile, ext: extFromMime(audioFile.type) }] : [],
      photos: await Promise.all(
        photoFiles.map(async (f) => ({
          base64: Buffer.from(await f.arrayBuffer()).toString('base64'),
          mimeType: getImageMimeType(f),
        }))
      ),
      texts: instructionText ? [instructionText] : [],
    })

    // Assemble the single instruction string the refine node consumes — matching
    // today's "Voice note:" / "From new photo(s):" joins so the prompt content is
    // equivalent to the pre-Phase-101 inline assembly.
    const parts: string[] = []
    if (ingest.texts.length) parts.push(ingest.texts.join('\n\n'))
    if (ingest.transcripts.length) parts.push('Voice note: ' + ingest.transcripts.join('\n'))
    if (ingest.photoDescriptions.length)
      parts.push(
        'From new photo(s):\n' +
          ingest.photoDescriptions.map((d, i) => `Photo ${i + 1}: ${d}`).join('\n')
      )
    const instruction = parts.join('\n\n').trim()

    if (!instruction) {
      return NextResponse.json(
        { error: 'No usable instruction could be extracted from the input.' },
        { status: 422 }
      )
    }

    // -------------------------------------------------------------------------
    // Map the existing estimate (preview input) from the DB row. Currency, price
    // book, language + industry are resolved inside the refine node by companyId
    // (mirroring generate) — the route only supplies the existing structure.
    // -------------------------------------------------------------------------
    const existingEstimate: EstimateOutput = {
      suggested_project_name: estimate.summary ?? 'Estimate',
      suggested_client_name: null,
      summary: estimate.summary ?? '',
      notes: estimate.notes ?? undefined,
      timeline: estimate.timeline ?? undefined,
      payment_terms: estimate.payment_terms ?? undefined,
      warranty_terms: estimate.warranty_terms ?? undefined,
      sections: estimate.sections.map((section) => ({
        title: section.title,
        items: section.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit ?? undefined,
          unit_price: item.unit_price,
          price_source: (item.price_source ?? 'ai_estimate') as 'price_book' | 'ai_estimate',
        })),
      })) as EstimateSectionOutput[],
    }

    // -------------------------------------------------------------------------
    // Invoke the canonical refine sub-graph INLINE (passthrough runner default →
    // synchronous; NO Inngest, NO checkpointer). A failure routes through the
    // adapter's onError which re-throws a typed XtimatorError → caught by the
    // outer try/catch → asResponse maps it to { error, code } with the right status.
    // -------------------------------------------------------------------------
    const adapter = makeRefineAdapter({ companyId, supabase })
    const graph = buildRefineGraph(adapter)
    const result = await graph.invoke({
      companyId,
      projectId: estimate.project_id,
      channel: 'web',
      existingEstimate,
      instruction,
    })

    // Activity log — refinement requested. Persistence (if any) happens via the
    // editor when the user clicks Save Draft.
    await supabase.from('estimate_activity').insert({
      project_id: estimate.project_id,
      company_id: companyId,
      estimate_id: estimateId,
      event_type: 'estimate_refine_proposed',
      metadata: {
        instruction,
        has_audio: !!audioFile,
        photo_count: photoFiles.length,
      },
    })

    return NextResponse.json({
      success: true,
      refined: result.refined,
      instruction,
    })
  } catch (err) {
    // Every error path returns the consistent typed JSON envelope { error, code }
    // via asResponse — no opaque/bespoke 500. (HARD-04)
    return asResponse(err)
  }
}
