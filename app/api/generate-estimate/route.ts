import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { PLACEHOLDER_PREFIX } from '@/lib/constants/project'
import { getAIProvider, type EstimateInput } from '@/lib/ai'
import { getPriceBookItems } from '@/lib/queries/price-book'

function normalizeClientNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
}

export async function POST(request: Request) {
  try {
    // Auth
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: companyRow } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', claims.sub)
      .single()

    if (!companyRow) {
      return NextResponse.json({ error: 'No company found' }, { status: 401 })
    }
    const companyId = companyRow.id as string

    // Parse body
    const body = await request.json().catch(() => null)
    if (!body?.projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      )
    }
    const projectId = body.projectId as string

    // Step 1: Gather context data in parallel
    const [projectResult, recordings, photos, companyResult] =
      await Promise.all([
        supabase
          .from('projects')
          .select(
            '*, client:clients(name, email, phone, address, city, state, zip)'
          )
          .eq('id', projectId)
          .single(),
        getProjectRecordings(supabase, projectId),
        getProjectPhotos(supabase, projectId),
        supabase
          .from('companies')
          .select(
            'industry, default_tax_rate, default_payment_terms, default_warranty_terms, name'
          )
          .eq('id', companyId)
          .single(),
      ])

    const project = projectResult.data
    const company = companyResult.data

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Load price book — 0 items means skip injection in prompt (D-10, AIPRICE-02)
    const priceBookItems = await getPriceBookItems(supabase, companyId)

    // Prerequisite check: need at least one transcript or photo
    const hasTranscripts = recordings.some(
      (r) => r.transcript && r.transcript.trim().length > 0
    )
    // Accept photos without AI descriptions — allow photos-only path (Phase 28-01)
    const hasPhotos = photos.length > 0
    if (!hasTranscripts && !hasPhotos) {
      return NextResponse.json(
        {
          error: 'At least one audio transcript or photo is required',
        },
        { status: 400 }
      )
    }

    // Steps 2-4: Build input and call AI provider (D-09)
    const client = project.client as {
      name: string
      email: string | null
      phone: string | null
      address: string | null
      city: string | null
      state: string | null
      zip: string | null
    } | null

    const clientAddress = client
      ? [client.address, client.city, client.state, client.zip]
          .filter(Boolean)
          .join(', ')
      : null

    const transcripts = recordings
      .filter((r) => r.transcript && r.transcript.trim().length > 0)
      .map((r) => r.transcript!)

    const photoDescriptions = photos
      .filter((p) => p.ai_description && p.ai_description.trim().length > 0)
      .map((p, i) => `Photo ${i + 1}: ${p.ai_description}`)

    const estimateInput: EstimateInput = {
      industry: company.industry,
      projectName: project.name,
      projectType: project.project_type,
      targetBudget: project.target_budget ? Number(project.target_budget) : null,
      clientName: client?.name ?? null,
      clientAddress,
      transcripts,
      photoDescriptions,
      priceBookItems,   // empty array = no injection (D-10)
      defaultPaymentTerms: company.default_payment_terms ?? null,
      defaultWarrantyTerms: company.default_warranty_terms ?? null,
    }

    const provider = await getAIProvider()
    const aiEstimate = await provider.generateEstimate(estimateInput)

    let clientSuggestion: {
      detectedName: string
      matchedClientId: string | null
      matchedClientName: string | null
    } | null = null

    const detectedClientName = aiEstimate.suggested_client_name?.trim()
    if (!client && detectedClientName) {
      const { data: existingClients } = await supabase
        .from('clients')
        .select('id, name')
        .eq('company_id', companyId)

      const normalizedDetectedName = normalizeClientNameForMatch(detectedClientName)
      const matchedClient = (existingClients ?? []).find(
        (existingClient) =>
          normalizeClientNameForMatch(existingClient.name as string) ===
          normalizedDetectedName
      )

      clientSuggestion = {
        detectedName: detectedClientName,
        matchedClientId: (matchedClient?.id as string | undefined) ?? null,
        matchedClientName: (matchedClient?.name as string | undefined) ?? null,
      }
    }

    // D-05: patch project name only if it's still the eager-create placeholder
    if (aiEstimate.suggested_project_name?.trim()) {
      const { data: currentProject } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single()
      if (
        currentProject?.name &&
        currentProject.name.startsWith(PLACEHOLDER_PREFIX)
      ) {
        await supabase
          .from('projects')
          .update({ name: aiEstimate.suggested_project_name.trim() })
          .eq('id', projectId)
      }
    }

    // Step 4: Server-side math validation
    const taxRate = Number(company.default_tax_rate) || 0

    const calculatedSections = aiEstimate.sections.map((section) => {
      const items = section.items.map((item) => ({
        ...item,
        total:
          Math.round(item.quantity * item.unit_price * 100) / 100,
      }))
      const sectionSubtotal = items.reduce(
        (sum, item) => sum + item.total,
        0
      )
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

    // Step 5: Version management
    await supabase
      .from('estimates')
      .update({ is_current: false })
      .eq('project_id', projectId)

    const { data: existingEstimates } = await supabase
      .from('estimates')
      .select('version')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)

    const nextVersion = (existingEstimates?.[0]?.version ?? 0) + 1

    // Step 6: Persist to DB
    const { data: estimate, error: estimateError } = await supabase
      .from('estimates')
      .insert({
        project_id: projectId,
        company_id: companyId,
        version: nextVersion,
        is_current: true,
        status: 'draft',
        summary: aiEstimate.summary,
        notes: aiEstimate.notes ?? null,
        timeline: aiEstimate.timeline ?? null,
        payment_terms:
          aiEstimate.payment_terms ??
          company.default_payment_terms ??
          null,
        warranty_terms:
          aiEstimate.warranty_terms ??
          company.default_warranty_terms ??
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

    if (estimateError || !estimate) {
      return NextResponse.json(
        { error: 'Failed to save estimate' },
        { status: 500 }
      )
    }

    const estimateId = estimate.id as string

    // Insert sections and items
    for (let sIdx = 0; sIdx < calculatedSections.length; sIdx++) {
      const section = calculatedSections[sIdx]

      const { data: sectionRow, error: sectionError } = await supabase
        .from('estimate_sections')
        .insert({
          estimate_id: estimateId,
          company_id: companyId,
          title: section.title,
          sort_order: sIdx,
          subtotal: section.subtotal,
        })
        .select('id')
        .single()

      if (sectionError || !sectionRow) {
        return NextResponse.json(
          { error: 'Failed to save estimate section' },
          { status: 500 }
        )
      }

      const sectionId = sectionRow.id as string

      // Insert items for this section
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
          price_source: item.price_source,  // D-16: persists 'price_book' or 'ai_estimate' from adapter
        }))

        const { error: itemsError } = await supabase
          .from('estimate_items')
          .insert(itemRows)

        if (itemsError) {
          return NextResponse.json(
            { error: 'Failed to save estimate items' },
            { status: 500 }
          )
        }
      }
    }

    // Step 7: Update project
    await supabase
      .from('projects')
      .update({ status: 'estimate_ready', total: grandTotal })
      .eq('id', projectId)

    // Log activity
    await supabase.from('estimate_activity').insert({
      project_id: projectId,
      company_id: companyId,
      estimate_id: estimateId,
      event_type: 'estimate_generated',
      metadata: { version: nextVersion },
    })

    // Step 8: Revalidate paths so workspace tabs and sidebar see new estimate + project name
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/', 'layout')

    // Step 9: Return response
    return NextResponse.json({ estimateId, version: nextVersion, clientSuggestion })
  } catch (error) {
    console.error('Estimate generation failed:', error)
    return NextResponse.json(
      { error: 'Estimate generation failed. Please try again.' },
      { status: 500 }
    )
  }
}
