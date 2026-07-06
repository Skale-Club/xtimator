import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { translateTextsOR } from '@/lib/ai/openrouter-client'
import { rateLimit } from '@/lib/ratelimit'

export async function POST(request: Request) {
  // 1. Auth check + rate limit
  let userId: string
  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    if (!claimsData?.claims) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    userId = claimsData.claims.sub
  } catch {
    return NextResponse.json({ error: 'Auth check failed' }, { status: 401 })
  }

  const rl = await rateLimit('translatePerMinute', userId)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many translation requests', code: 'rate_limit:translate' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
    )
  }

  // 2. Parse and validate body
  const body = await request.json().catch(() => null)
  if (!body?.texts || !Array.isArray(body.texts) || body.texts.length === 0) {
    return NextResponse.json({ error: 'texts (non-empty array) required' }, { status: 400 })
  }
  // Pre-launch audit fix: this endpoint had no cap on payload size — inside
  // the per-minute rate limit window, a single request could still carry an
  // arbitrarily large `texts` array (or arbitrarily long strings), amplifying
  // AI translation cost far beyond what the rate limit alone bounds.
  if (body.texts.length > 200 || body.texts.some((t: unknown) => typeof t !== 'string' || t.length > 2000)) {
    return NextResponse.json(
      { error: 'texts must be at most 200 strings, each at most 2000 characters' },
      { status: 400 }
    )
  }
  if (!body?.targetLanguage || !['pt', 'es'].includes(body.targetLanguage)) {
    return NextResponse.json({ error: 'targetLanguage must be "pt" or "es"' }, { status: 400 })
  }

  const { texts, targetLanguage } = body as { texts: string[]; targetLanguage: 'pt' | 'es' }
  const svc = requireServiceClient()

  // 3. Check DB cache in one query
  const { data: cached } = await svc
    .from('translations')
    .select('source_text, translated_text')
    .in('source_text', texts)
    .eq('source_language', 'en')
    .eq('target_language', targetLanguage)

  const found = new Map<string, string>(
    (cached ?? []).map((r: { source_text: string; translated_text: string }) => [r.source_text, r.translated_text])
  )
  const missing = texts.filter(t => !found.has(t))

  // 4. AI translate missing strings via OpenRouter
  if (missing.length > 0) {
    try {
      const aiMap = await translateTextsOR(missing, targetLanguage)

      // 5. Save to DB (ON CONFLICT DO NOTHING via ignoreDuplicates)
      const rows = missing
        .filter(src => typeof aiMap[src] === 'string' && aiMap[src].length > 0)
        .map(src => ({
          source_text: src,
          source_language: 'en',
          target_language: targetLanguage,
          translated_text: aiMap[src],
        }))

      if (rows.length > 0) {
        await svc
          .from('translations')
          .upsert(rows, {
            onConflict: 'source_text,source_language,target_language',
            ignoreDuplicates: true,
          })
      }

      missing.forEach(src => {
        if (typeof aiMap[src] === 'string') found.set(src, aiMap[src])
      })
    } catch {
      // Translation error: fall back to source text for missing strings (silent, per UI-SPEC)
      if (found.size === 0) {
        return NextResponse.json({ error: 'AI unavailable' }, { status: 503 })
      }
    }
  }

  // 6. Return all translations (missing strings fall back to source text)
  return NextResponse.json({
    translations: Object.fromEntries(
      texts.map(src => [src, found.get(src) ?? src])
    )
  })
}
