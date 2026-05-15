import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { createStorage } from '@/lib/storage'
import { getIntegrationKey } from '@/lib/platform-config'
import { rateLimit } from '@/lib/ratelimit'
import type { Photo } from '@/lib/queries/photo'
import { checkQuota, recordUsage } from '@/lib/quota'

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

async function analyzePhoto(
  serviceClient: ReturnType<typeof requireServiceClient>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  photo: Photo,
  anthropic: Anthropic
): Promise<string> {
  // Download photo from Supabase Storage using service role client
  let fileData: Blob
  try {
    fileData = await createStorage(serviceClient).download('photos', photo.storage_path)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No data'
    throw new Error(`Failed to download photo: ${message}`)
  }

  // Convert Blob to base64
  const arrayBuffer = await fileData.arrayBuffer()
  const base64Data = Buffer.from(arrayBuffer).toString('base64')
  const mimeType = getMimeType(photo.storage_path)

  // Call Claude Vision API
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
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
            text: "Describe this photo from a contractor's perspective. Note materials, conditions, measurements if visible, damage, and areas needing work. Be specific and concise.",
          },
        ],
      },
    ],
  })

  const description =
    response.content[0].type === 'text' ? response.content[0].text : ''

  // Update photo row with AI description (uses authenticated client for RLS)
  const { error: updateError } = await supabase
    .from('photos')
    .update({ ai_description: description })
    .eq('id', photo.id)

  if (updateError) {
    throw new Error(`Failed to update photo: ${updateError.message}`)
  }

  return description
}

export async function POST(request: Request) {
  try {
    const requestId = crypto.randomUUID()

    // Parse body
    const body = await request.json().catch(() => null)
    if (!body?.projectId || typeof body.projectId !== 'string') {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      )
    }
    const { projectId } = body

    // Auth check
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Rate limit (Vision is expensive)
    const rl = await rateLimit('photoAnalysisPerMinute', claims.sub)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many photo analysis requests', code: 'rate_limit:photos' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      )
    }

    // Verify user has a company
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', claims.sub)
      .single()

    if (!company) {
      return NextResponse.json(
        { error: 'No company found' },
        { status: 401 }
      )
    }
    const companyId = company.id as string

    // QUOTA-04: Check photo_batch quota before any Claude Vision call
    const { allowed } = await checkQuota(supabase, companyId, 'photo_batch')
    if (!allowed) {
      return NextResponse.json(
        { error: 'plan_limit_reached', upgradeUrl: '/settings/billing' },
        { status: 402 }
      )
    }

    // Fetch photos for this project
    const { data: photos } = await supabase
      .from('photos')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order')

    if (!photos || photos.length === 0) {
      return NextResponse.json(
        { error: 'No photos found for this project' },
        { status: 400 }
      )
    }

    // Load Anthropic key from DB-backed loader (ADMIN-06)
    const anthropicKey = await getIntegrationKey('anthropic')
    if (!anthropicKey) {
      return NextResponse.json(
        { error: "AI estimate generation isn't available right now. Contact your platform administrator." },
        { status: 503 }
      )
    }
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    const typedPhotos = photos as Photo[]
    const serviceClient = requireServiceClient()

    // Analyze all photos in parallel with Promise.allSettled
    const results = await Promise.allSettled(
      typedPhotos.map((photo) =>
        analyzePhoto(serviceClient, supabase, photo, anthropic)
      )
    )

    // QUOTA-04: Record usage after AI calls complete (photo count = photos submitted)
    await recordUsage(supabase, companyId, 'photo_analyzed', typedPhotos.length, requestId)

    // Build response
    const response = {
      results: typedPhotos.map((photo, i) => {
        const result = results[i]
        return {
          photoId: photo.id,
          status: result.status,
          description:
            result.status === 'fulfilled' ? result.value : null,
          error:
            result.status === 'rejected'
              ? (result.reason as Error)?.message ?? 'Unknown error'
              : null,
        }
      }),
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('analyze-photos error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
