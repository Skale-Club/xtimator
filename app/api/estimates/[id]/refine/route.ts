// app/api/estimates/[id]/refine/route.ts
//
// SEED-028 Phase C: stateless multimodal refinement.
//
// Accepts FormData with optional `instruction` (text), `audio` (file), and
// `photos[]` (image files). Transcribes audio via Whisper, analyzes photos
// via Claude Vision, composes a unified instruction, runs the Claude refine
// pipeline, and returns the refined estimate JSON.
//
// This endpoint never writes to the database. The caller is expected to:
//   - dispatch the refined state into the editor (mark dirty), OR
//   - persist by calling saveEstimate.
//
// For text-only callers, JSON `{ instruction }` is still accepted as a
// back-compat path.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { createStorage } from '@/lib/storage'
import { getEstimateById } from '@/lib/queries/estimate'
import { getPriceBookItems } from '@/lib/queries/price-book'
import { getAIProvider, type RefineEstimateInput } from '@/lib/ai'
import type { EstimateOutput, EstimateSectionOutput } from '@/lib/ai/types'
import { transcribeAudioOR, analyzePhotoOR } from '@/lib/ai/openrouter-client'
import { normalizeCurrencyCode } from '@/lib/money/currency'
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

/** Upload audio to storage, hand to OpenRouter Whisper, then clean up. */
async function transcribeRefineAudio(
  file: Blob,
  companyId: string,
  estimateId: string
): Promise<string> {
  const serviceClient = requireServiceClient()
  const storage = createStorage(serviceClient)
  const path = `${companyId}/refine-voice/${estimateId}-${Date.now()}.webm`

  await storage.upload('audio', path, file, {
    contentType: file.type || 'audio/webm',
    upsert: false,
  }).catch(() => { throw new Error('Failed to upload audio for transcription') })

  let downloaded: Blob
  try {
    downloaded = await storage.download('audio', path)
  } catch {
    storage.delete('audio', path).catch(() => {})
    throw new Error('Failed to read audio for transcription')
  }

  storage.delete('audio', path).catch(() => {})
  return transcribeAudioOR(downloaded, 'webm')
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
    if (estimate.workflow_status === 'consolidated') {
      throw new XtimatorError(
        'conflict',
        'estimates',
        'This estimate is consolidated. Create a new version to refine it.'
      )
    }

    // -------------------------------------------------------------------------
    // Parse multimodal input. Supports either FormData (multipart) or JSON.
    // -------------------------------------------------------------------------
    let instructionText = ''
    let audioFile: Blob | null = null
    const photoFiles: Blob[] = []

    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const text = form.get('instruction')
      if (typeof text === 'string') instructionText = text.trim()

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
      if (body?.instruction && typeof body.instruction === 'string') {
        instructionText = body.instruction.trim()
      }
    }

    if (!instructionText && !audioFile && photoFiles.length === 0) {
      return NextResponse.json(
        { error: 'Provide an instruction, audio, or at least one photo.' },
        { status: 400 }
      )
    }

    // -------------------------------------------------------------------------
    // Transcribe audio (if any) and append to instruction
    // -------------------------------------------------------------------------
    if (audioFile) {
      // A transcription failure now propagates to the outer catch -> asResponse,
      // yielding the typed JSON envelope instead of a bespoke opaque 500 (HARD-04).
      const transcript = await transcribeRefineAudio(audioFile, companyId, estimateId)
      if (transcript) {
        instructionText = instructionText
          ? `${instructionText}\n\nVoice note: ${transcript}`
          : transcript
      }
    }

    // -------------------------------------------------------------------------
    // Analyze photos (if any) and append findings to instruction
    // -------------------------------------------------------------------------
    if (photoFiles.length > 0) {
      const descriptions: string[] = []
      for (let i = 0; i < photoFiles.length; i++) {
        try {
          const mimeType = getImageMimeType(photoFiles[i])
          const base64 = Buffer.from(await photoFiles[i].arrayBuffer()).toString('base64')
          const desc = await analyzePhotoOR(base64, mimeType)
          if (desc) descriptions.push(`Photo ${i + 1}: ${desc}`)
        } catch (err) {
          console.error('[refine] photo analysis failed:', err)
        }
      }
      if (descriptions.length > 0) {
        const block = descriptions.join('\n')
        instructionText = instructionText
          ? `${instructionText}\n\nFrom new photo(s):\n${block}`
          : `From new photo(s):\n${block}`
      }
    }

    if (!instructionText) {
      return NextResponse.json(
        { error: 'No usable instruction could be extracted from the input.' },
        { status: 422 }
      )
    }

    // -------------------------------------------------------------------------
    // Call Claude refine with the unified instruction
    // -------------------------------------------------------------------------
    const currencyCode = normalizeCurrencyCode(estimate.currency_code)
    const priceBookItems = (await getPriceBookItems(supabase, companyId)).filter(
      (item) => normalizeCurrencyCode(item.currency_code) === currencyCode
    )

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

    const provider = await getAIProvider(companyId)
    const refineInput: RefineEstimateInput = {
      existingEstimate,
      instruction: instructionText,
      currencyCode,
      priceBookItems: priceBookItems.map((item) => ({
        folder_name: item.folder_name,
        name: item.name,
        unit: item.unit,
        unit_price: item.unit_price,
        currency_code: item.currency_code,
      })),
    }
    const refined = await provider.refineEstimate(refineInput)

    // Activity log — refinement requested. Persistence (if any) happens via the
    // editor when the user clicks Save Draft / Consolidate.
    await supabase.from('estimate_activity').insert({
      project_id: estimate.project_id,
      company_id: companyId,
      estimate_id: estimateId,
      event_type: 'estimate_refine_proposed',
      metadata: {
        instruction: instructionText,
        has_audio: !!audioFile,
        photo_count: photoFiles.length,
      },
    })

    return NextResponse.json({
      success: true,
      refined,
      instruction: instructionText,
    })
  } catch (err) {
    // Every error path now returns the consistent typed JSON envelope { error, code }
    // via asResponse — no opaque/bespoke 500. (HARD-04)
    return asResponse(err)
  }
}
