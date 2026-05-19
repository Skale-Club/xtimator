// app/api/estimates/[id]/refine/photo/route.ts
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
import Anthropic from '@anthropic-ai/sdk'

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

function getMimeType(storagePath: string): ImageMediaType {
  const ext = storagePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg'
  }
}

async function analyzePhotoWithVision(
  anthropic: Anthropic,
  fileData: Blob,
  mimeType: ImageMediaType
): Promise<string> {
  // Convert Blob to base64
  const arrayBuffer = await fileData.arrayBuffer()
  const base64Data = Buffer.from(arrayBuffer).toString('base64')

  // Call Claude Vision API
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: base64Data,
            },
          },
          {
            type: 'text',
            text: "Describe this photo from a contractor's perspective. Note materials, conditions, measurements if visible, damage, and areas needing work. Be specific and concise. Focus on what work needs to be done and any relevant details for creating an estimate.",
          },
        ],
      },
    ],
  })

  const description =
    response.content[0].type === 'text' ? response.content[0].text : ''

  return description
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

    // Parse photos from FormData
    const formData = await request.formData()
    const photosField = formData.getAll('photos')

    if (photosField.length === 0) {
      return NextResponse.json(
        { error: 'At least one photo is required' },
        { status: 400 }
      )
    }

    if (photosField.length > 5) {
      return NextResponse.json(
        { error: 'Maximum 5 photos allowed' },
        { status: 400 }
      )
    }

    // Validate each photo
    const photos: Blob[] = []
    for (const photo of photosField) {
      if (!(photo instanceof Blob)) {
        return NextResponse.json(
          { error: 'Invalid photo file' },
          { status: 400 }
        )
      }
      if (!photo.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'Invalid file type. Only images are allowed.' },
          { status: 400 }
        )
      }
      if (photo.size === 0) {
        return NextResponse.json(
          { error: 'One or more photos are empty' },
          { status: 400 }
        )
      }
      photos.push(photo)
    }

    // Load Anthropic key for Vision
    const anthropicKey = await getIntegrationKey('anthropic')
    if (!anthropicKey) {
      return NextResponse.json(
        { error: "AI photo analysis isn't available right now. Contact your platform administrator." },
        { status: 503 }
      )
    }
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    // Upload photos to Supabase Storage and analyze with Claude Vision
    const serviceClient = requireServiceClient()
    const storage = createStorage(serviceClient)
    const timestamp = Date.now()
    const photoDescriptions: string[] = []

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]
      const storagePath = `${companyId}/refine-photos/${estimateId}-${timestamp}-${i}.jpg`
      const mimeType = getMimeType(storagePath)

      // Upload to storage
      try {
        await storage.upload('photos', storagePath, photo, {
          contentType: mimeType,
          upsert: false,
        })
      } catch (err) {
        console.error('Photo upload error:', err)
        return NextResponse.json(
          { error: 'Failed to upload photo' },
          { status: 500 }
        )
      }

      // Download for Claude Vision analysis
      let fileData: Blob
      try {
        fileData = await storage.download('photos', storagePath)
      } catch (err) {
        // Clean up uploaded file (non-blocking) before returning
        const cleanupPromise = storage.delete('photos', storagePath)
        cleanupPromise.catch(() => {})
        console.error('Photo download error:', err)
        return NextResponse.json(
          { error: 'Failed to read photo for analysis' },
          { status: 500 }
        )
      }

      // Clean up uploaded file (non-blocking)
      const cleanupPromise = storage.delete('photos', storagePath)
      cleanupPromise.catch(() => {})

      // Analyze with Claude Vision
      const description = await analyzePhotoWithVision(anthropic, fileData, mimeType)
      if (description.trim()) {
        photoDescriptions.push(description.trim())
      }
    }

    if (photoDescriptions.length === 0) {
      return NextResponse.json(
        { error: "We couldn't analyze any of the photos. Please try again with clearer images." },
        { status: 422 }
      )
    }

    // Build instruction from photo descriptions
    const instruction = `Based on the uploaded photos: ${photoDescriptions.join('; ')}`

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
      instruction,
      priceBookItems: priceBookItems.map(item => ({
        category: item.category,
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
      metadata: { version: nextVersion, instruction, source: 'photo', photoDescriptions },
    })

    // Revalidate paths
    revalidatePath(`/projects/${estimate.project_id}`)
    revalidatePath('/', 'layout')

    return NextResponse.json({
      success: true,
      newVersion: nextVersion,
      estimateId: newEstimateId,
      photoDescriptions,
    })
  } catch (error) {
    console.error('Photo estimate refinement failed:', error)
    return NextResponse.json(
      { error: 'Photo refinement failed. Please try again.' },
      { status: 500 }
    )
  }
}