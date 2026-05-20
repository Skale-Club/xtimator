// app/api/estimates/[id]/refine/voice/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { createStorage } from '@/lib/storage'
import { revalidatePath } from 'next/cache'
import { getEstimateById } from '@/lib/queries/estimate'
import { getPriceBookItems } from '@/lib/queries/price-book'
import { getAIProvider, type RefineEstimateInput } from '@/lib/ai'
import type { EstimateOutput } from '@/lib/ai/types'
import type { EstimateSectionOutput } from '@/lib/ai/types'
import { getIntegrationKey } from '@/lib/platform-config'

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
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: companyRow } = await supabase
      .from('companies')
      .select('id, default_tax_rate, default_payment_terms, default_warranty_terms')
      .eq('user_id', claims.sub)
      .single()

    if (!companyRow) {
      return NextResponse.json({ error: 'No company found' }, { status: 401 })
    }
    const companyId = companyRow.id as string

    // Fetch current estimate
    const estimate = await getEstimateById(supabase, estimateId)
    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }
    if (estimate.company_id !== companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    if (!estimate.is_current) {
      return NextResponse.json(
        { error: 'Cannot refine an old version. Switch to the current version first.' },
        { status: 400 }
      )
    }

    // Parse audio from FormData
    const formData = await request.formData()
    const audioFile = formData.get('audio')

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: 'audio file is required' },
        { status: 400 }
      )
    }

    if (audioFile.size === 0) {
      return NextResponse.json(
        { error: 'audio file is empty' },
        { status: 400 }
      )
    }

    if (!audioFile.type.startsWith('audio/')) {
      return NextResponse.json(
        { error: 'invalid audio file type' },
        { status: 400 }
      )
    }

    // Upload audio to Supabase Storage for Whisper transcription
    const serviceClient = requireServiceClient()
    const storage = createStorage(serviceClient)
    const timestamp = Date.now()
    const storagePath = `${companyId}/refine-voice/${estimateId}-${timestamp}.webm`

    try {
      await storage.upload('audio', storagePath, audioFile, {
        contentType: audioFile.type || 'audio/webm',
        upsert: false,
      })
    } catch {
      return NextResponse.json(
        { error: 'Failed to upload audio file for transcription' },
        { status: 500 }
      )
    }

    // Transcribe via Whisper API
    const openaiKey = await getIntegrationKey('openai')
    if (!openaiKey) {
      // Cleanup: delete the uploaded file
      await storage.delete('audio', storagePath).catch(() => {})
      return NextResponse.json(
        { error: "Audio transcription isn't available right now. Contact your platform administrator." },
        { status: 503 }
      )
    }

    // Download audio for transcription (Whisper needs the raw file)
    let fileData: Blob
    try {
      fileData = await storage.download('audio', storagePath)
    } catch {
      await storage.delete('audio', storagePath).catch(() => {})
      return NextResponse.json(
        { error: 'Failed to read audio file for transcription' },
        { status: 500 }
      )
    }

    // Send to Whisper API
    const whisperFormData = new FormData()
    whisperFormData.append('file', fileData, 'voice-refine.webm')
    whisperFormData.append('model', 'whisper-1')
    whisperFormData.append('response_format', 'text')

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: whisperFormData,
    })

    // Always cleanup the storage file after transcription attempt
    const cleanupPromise = storage.delete('audio', storagePath)
    cleanupPromise.catch(() => {}) // non-blocking

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text().catch(() => 'Unknown error')
      return NextResponse.json(
        { error: `Transcription failed: ${errorText}` },
        { status: 500 }
      )
    }

    const transcript = await whisperResponse.text()
    if (!transcript.trim()) {
      return NextResponse.json(
        { error: "We couldn't catch any speech — please try again or type your instruction." },
        { status: 422 }
      )
    }

    // Load price book
    const priceBookItems = await getPriceBookItems(supabase, companyId)

    // Convert DB estimate to EstimateOutput format
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

    // Call AI provider for refinement
    const provider = await getAIProvider(companyId)
    const refineInput: RefineEstimateInput = {
      existingEstimate,
      instruction: transcript.trim(),
      priceBookItems: priceBookItems.map(item => ({
        folder_name: item.folder_name,
        name: item.name,
        unit: item.unit,
        unit_price: item.unit_price,
      })),
    }
    const aiEstimate = await provider.refineEstimate(refineInput)

    // Server-side math validation
    const taxRate = Number(companyRow.default_tax_rate) || 0

    const calculatedSections = aiEstimate.sections.map((section) => {
      const items = section.items.map((item) => ({
        ...item,
        total: Math.round(item.quantity * item.unit_price * 100) / 100,
      }))
      const sectionSubtotal = items.reduce((sum, item) => sum + item.total, 0)
      return {
        title: section.title,
        items,
        subtotal: Math.round(sectionSubtotal * 100) / 100,
      }
    })

    const subtotal = Math.round(
      calculatedSections.reduce((sum, s) => sum + s.subtotal, 0) * 100
    ) / 100
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100
    const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100

    // Version management: mark old as not current
    await supabase
      .from('estimates')
      .update({ is_current: false })
      .eq('project_id', estimate.project_id)

    // Get next version number
    const { data: existingEstimates } = await supabase
      .from('estimates')
      .select('version')
      .eq('project_id', estimate.project_id)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = (existingEstimates?.[0]?.version ?? 0) + 1

    // Persist new estimate version
    const { data: newEstimate, error: estimateError } = await supabase
      .from('estimates')
      .insert({
        project_id: estimate.project_id,
        company_id: companyId,
        version: nextVersion,
        is_current: true,
        status: 'draft',
        workflow_status: 'draft',
        summary: aiEstimate.summary,
        notes: aiEstimate.notes ?? null,
        timeline: aiEstimate.timeline ?? null,
        payment_terms:
          aiEstimate.payment_terms ??
          (companyRow.default_payment_terms as string | null) ??
          null,
        warranty_terms:
          aiEstimate.warranty_terms ??
          (companyRow.default_warranty_terms as string | null) ??
          null,
        subtotal,
        discount_type: null,
        discount_value: 0,
        discount_amount: 0,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total: grandTotal,
      })
      .select('id')
      .single()

    if (estimateError || !newEstimate) {
      return NextResponse.json({ error: 'Failed to save refined estimate' }, { status: 500 })
    }

    const newEstimateId = newEstimate.id as string

    // Insert sections and items
    for (let sIdx = 0; sIdx < calculatedSections.length; sIdx++) {
      const section = calculatedSections[sIdx]

      const { data: sectionRow, error: sectionError } = await supabase
        .from('estimate_sections')
        .insert({
          estimate_id: newEstimateId,
          company_id: companyId,
          title: section.title,
          sort_order: sIdx,
          subtotal: section.subtotal,
        })
        .select('id')
        .single()

      if (sectionError || !sectionRow) {
        return NextResponse.json({ error: 'Failed to save refined section' }, { status: 500 })
      }

      const sectionId = sectionRow.id as string

      if (section.items.length > 0) {
        const itemRows = section.items.map((item, iIdx) => ({
          section_id: sectionId,
          company_id: companyId,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit ?? null,
          unit_price: item.unit_price,
          total: item.total,
          sort_order: iIdx,
          price_source: item.price_source,
        }))

        const { error: itemsError } = await supabase
          .from('estimate_items')
          .insert(itemRows)

        if (itemsError) {
          return NextResponse.json({ error: 'Failed to save refined items' }, { status: 500 })
        }
      }
    }

    // Update project total
    await supabase
      .from('projects')
      .update({ total: grandTotal })
      .eq('id', estimate.project_id)

    // Log activity
    await supabase.from('estimate_activity').insert({
      project_id: estimate.project_id,
      company_id: companyId,
      estimate_id: newEstimateId,
      event_type: 'estimate_refined',
      metadata: { version: nextVersion, instruction: transcript.trim(), source: 'voice' },
    })

    // Revalidate paths
    revalidatePath(`/projects/${estimate.project_id}`)
    revalidatePath('/', 'layout')

    return NextResponse.json({
      success: true,
      newVersion: nextVersion,
      estimateId: newEstimateId,
      transcript: transcript.trim(),
    })
  } catch (error) {
    console.error('Voice estimate refinement failed:', error)
    return NextResponse.json(
      { error: 'Voice refinement failed. Please try again.' },
      { status: 500 }
    )
  }
}
