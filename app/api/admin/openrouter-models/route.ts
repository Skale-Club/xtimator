// Admin-only proxy for the OpenRouter model catalog.
//
// Why a proxy: the OpenRouter API key lives encrypted in platform_integrations
// and must never reach the browser. Admin UIs hit this route instead. Result is
// cached in-memory for 5 minutes so the searchable selector stays snappy and
// we don't hammer OpenRouter on every focus.
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin-context'
import { getIntegrationKey } from '@/lib/platform-config'

export const dynamic = 'force-dynamic'

export type OpenRouterModel = {
  id: string
  name: string
  description?: string | null
  context_length?: number | null
  pricing?: { prompt?: string; completion?: string } | null
}

type CacheEntry = { models: OpenRouterModel[]; fetchedAt: number }
const TTL_MS = 5 * 60_000
let cache: CacheEntry | null = null

export async function GET() {
  try {
    await requireAdmin()
  } catch {
    // requireAdmin already returns 404/redirect on its own; if it ever throws,
    // surface a generic 401 instead of leaking the failure shape.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return NextResponse.json({ models: cache.models, cached: true })
  }

  const apiKey = await getIntegrationKey('openrouter')
  // Note: the /models endpoint is public on OpenRouter — auth is optional.
  // We pass it when available for higher rate limits, but absence is fine.
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const res = await fetch('https://openrouter.ai/api/v1/models', { headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return NextResponse.json(
      { error: `OpenRouter responded ${res.status}: ${body.slice(0, 200)}` },
      { status: 502 }
    )
  }
  const json = (await res.json()) as { data?: OpenRouterModel[] }
  const models = Array.isArray(json.data) ? json.data : []
  cache = { models, fetchedAt: Date.now() }
  return NextResponse.json({ models, cached: false })
}
