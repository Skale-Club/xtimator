import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getIntegrationKey } from '@/lib/platform-config'

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

    // Prerequisite check (AI-01): need at least one transcript or analyzed photo
    const hasTranscripts = recordings.some(
      (r) => r.transcript && r.transcript.trim().length > 0
    )
    const hasPhotoDescriptions = photos.some(
      (p) => p.ai_description && p.ai_description.trim().length > 0
    )
    if (!hasTranscripts && !hasPhotoDescriptions) {
      return NextResponse.json(
        {
          error:
            'At least one transcript or analyzed photo is required',
        },
        { status: 400 }
      )
    }

    // Step 2: Build prompt
    const systemPrompt = `You are a professional estimator for a ${company.industry ?? 'general services'} business. Create a detailed, itemized estimate based on the job site information provided. Be thorough but realistic with pricing for the US market. Break the work into logical sections (e.g., Materials, Labor, Equipment). Each line item needs a clear description, quantity, unit (e.g., sq ft, hours, each, linear ft), and unit price.`

    const parts: string[] = []

    // Project info
    const client = project.client as {
      name: string
      email: string | null
      phone: string | null
      address: string | null
      city: string | null
      state: string | null
      zip: string | null
    } | null

    let projectInfo = `## Project Information\nName: ${project.name}\nType: ${project.project_type ?? 'General'}`
    if (project.target_budget) {
      projectInfo += `\nTarget Budget: $${project.target_budget}`
    }
    if (client) {
      projectInfo += `\nClient: ${client.name}`
      if (client.address) {
        projectInfo += `\nAddress: ${client.address}`
        if (client.city) projectInfo += `, ${client.city}`
        if (client.state) projectInfo += `, ${client.state}`
        if (client.zip) projectInfo += ` ${client.zip}`
      }
    }
    parts.push(projectInfo)

    // Audio transcripts
    const transcripts = recordings
      .filter((r) => r.transcript && r.transcript.trim().length > 0)
      .map((r) => r.transcript!)
    if (transcripts.length > 0) {
      parts.push('## Audio Transcripts\n' + transcripts.join('\n---\n'))
    }

    // Photo descriptions
    const descriptions = photos
      .filter(
        (p) => p.ai_description && p.ai_description.trim().length > 0
      )
      .map((p, i) => `Photo ${i + 1}: ${p.ai_description}`)
    if (descriptions.length > 0) {
      parts.push('## Photo Descriptions\n' + descriptions.join('\n'))
    }

    const userContent = parts.join('\n\n')

    // Step 3: Call Claude with tool_use
    // Load Anthropic key from DB-backed loader (ADMIN-06)
    const anthropicKey = await getIntegrationKey('anthropic')
    if (!anthropicKey) {
      return NextResponse.json(
        { error: "AI estimate generation isn't available right now. Contact your platform administrator." },
        { status: 503 }
      )
    }
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      tools: [
        {
          name: 'create_estimate',
          description:
            'Create a structured estimate with sections and line items',
          input_schema: {
            type: 'object' as const,
            required: ['summary', 'sections'],
            properties: {
              summary: {
                type: 'string',
                description: 'Brief summary of the work scope',
              },
              notes: {
                type: 'string',
                description: 'Additional notes or assumptions',
              },
              timeline: {
                type: 'string',
                description: 'Estimated timeline for completion',
              },
              payment_terms: {
                type: 'string',
                description: 'Payment terms',
              },
              warranty_terms: {
                type: 'string',
                description: 'Warranty information',
              },
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['title', 'items'],
                  properties: {
                    title: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: [
                          'description',
                          'quantity',
                          'unit_price',
                        ],
                        properties: {
                          description: { type: 'string' },
                          quantity: { type: 'number' },
                          unit: { type: 'string' },
                          unit_price: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'create_estimate' },
    })

    // Extract tool use result
    const toolBlock = response.content.find(
      (b: { type: string }) => b.type === 'tool_use'
    )
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return NextResponse.json(
        { error: 'AI failed to generate structured estimate' },
        { status: 500 }
      )
    }

    const aiEstimate = toolBlock.input as {
      summary: string
      notes?: string
      timeline?: string
      payment_terms?: string
      warranty_terms?: string
      sections: {
        title: string
        items: {
          description: string
          quantity: number
          unit?: string
          unit_price: number
        }[]
      }[]
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

    // Step 8: Return response
    return NextResponse.json({ estimateId, version: nextVersion })
  } catch (error) {
    console.error('Estimate generation failed:', error)
    return NextResponse.json(
      { error: 'Estimate generation failed. Please try again.' },
      { status: 500 }
    )
  }
}
