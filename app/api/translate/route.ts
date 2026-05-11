import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
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

  // 4. AI translate missing strings
  if (missing.length > 0) {
    const key = await getIntegrationKey('anthropic')
    if (!key) {
      // Return cached hits even if AI unavailable; missing strings fall back to source text
      if (found.size === 0) {
        return NextResponse.json({ error: 'AI unavailable' }, { status: 503 })
      }
    } else {
      const anthropic = new Anthropic({ apiKey: key })
      const langLabel = targetLanguage === 'pt' ? 'Brazilian Portuguese (PT-BR)' : 'Latin American Spanish (ES)'

      try {
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `Translate these UI strings from English to ${langLabel}. Return ONLY a raw JSON object (no markdown, no code blocks) mapping each source string exactly to its translation. Keep proper nouns and brand names unchanged. Preserve casing style. Source strings:\n${JSON.stringify(missing)}`,
          }],
        })

        const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}'
        // Strip markdown fences if model wraps response (Pitfall 6)
        const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
        const aiMap = JSON.parse(clean) as Record<string, string>

        // 5. Save to DB with onConflict do nothing (Pitfall 5 — unique index protection)
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
          // ignoreDuplicates: true maps to ON CONFLICT DO NOTHING — silent ignore on duplicate
        }

        missing.forEach(src => {
          if (typeof aiMap[src] === 'string') found.set(src, aiMap[src])
        })
      } catch {
        // Translation error: fall back to source text for missing strings (silent, per UI-SPEC)
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
