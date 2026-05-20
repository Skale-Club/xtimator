/**
 * Phase 77 plan 07 (NOTIF-09) — Web Push subscription persistence.
 *
 * POST   { subscription } → upsert notification_preferences.push_subscription
 * DELETE                  → clear notification_preferences.push_subscription
 *
 * Phase 1: stores subscription only. Phase 2 will iterate stored subscriptions
 * + dispatch via web-push library + VAPID server private key.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthClaims } from '@/lib/queries/auth'
import { upsertUserPreferences } from '@/lib/notifications/preferences'

const PostSchema = z.object({
  subscription: z.unknown().nullable().optional(),
})

export async function POST(req: Request) {
  try {
    const claims = await getAuthClaims()
    if (!claims?.sub) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const json = await req.json().catch(() => ({}))
    const parsed = PostSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
    }
    await upsertUserPreferences(claims.sub as string, {
      push_subscription: parsed.data.subscription ?? {},
    })
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write_failed' },
      { status: 500 },
    )
  }
}

export async function DELETE() {
  try {
    const claims = await getAuthClaims()
    if (!claims?.sub) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    await upsertUserPreferences(claims.sub as string, {
      push_subscription: null,
    })
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write_failed' },
      { status: 500 },
    )
  }
}
