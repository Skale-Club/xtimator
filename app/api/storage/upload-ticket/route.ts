import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { demoGuardResponse } from '@/lib/demo/guard'
import {
  UPLOAD_TICKET_BUCKETS,
  normalizeUploadContentType,
  mintUploadTicket,
  type UploadTicketBucket,
} from '@/lib/storage/upload-ticket'

/**
 * Phase 189 Plan 02 — UPLOAD-02: `POST /api/storage/upload-ticket`.
 *
 * Proves the CALLER before Plan 01's `mintUploadTicket` ever runs. Plan 01
 * made the *key* tenant-confined (a client-supplied key is validated, never
 * repaired); this route makes sure the caller is who they say they are, and
 * that `projectId` actually belongs to their active company, before a
 * single-key write authority is ever handed out.
 *
 * `companyId` comes from `getActiveCompanyId()` and from NOWHERE else. The
 * request body may carry `bucket`, `projectId`, `contentType`, and an
 * optional prior `key` — none of those fields' values are trusted for
 * tenant identity, even if the body also includes a `companyId` field (it is
 * read by nobody in this file).
 *
 * Handler order below is deliberate — do not reorder. Mirrors the same-origin
 * asset proxy's documented ordering (app/storage/[bucket]/[...key]/route.ts):
 * each gate is cheaper and stricter than the next, and every refusal happens
 * BEFORE any storage call. THIS LIST IS THE CONTRACT, NOT A SUGGESTION:
 *
 *   1. body parse + shape   (cheapest — no auth, no I/O)              -> 400
 *   2. auth (claims + active company)                                 -> 401
 *   3. demo guard           (before any DB read, before minting)      -> 403
 *   4. project ownership    (DB, RLS-bound client)                    -> 404
 *   5. mint                 (only after 1-4 pass)                     -> 500 on throw
 *
 * Gate 4 returns 404, not 403, for a project outside the caller's company —
 * the response must not confirm the project exists at all, same reasoning as
 * `lib/storage/proxy-auth.ts`'s 404-not-403 posture for private-bucket reads.
 *
 * Every response — success AND every refusal — carries
 * `Cache-Control: private, no-store`. A cached upload ticket is a reusable
 * write authority; nothing about this endpoint may ever be shared-cached.
 *
 * Never echo an internal error: `mintUploadTicket` can throw with a message
 * naming the S3 endpoint or a missing env var. Log it server-side, return
 * a fixed string to the caller.
 *
 * Deliberately NO rate limiting and NO quota check here. A ticket costs one
 * signature and no third-party call; the write it authorizes is bounded to
 * exactly the one key it names. Coupling this route to the billing/quota
 * ledger for that would add complexity with no corresponding protection —
 * noted here so the absence reads as a decision, not an oversight.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const

function jsonNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

/**
 * Mirrors `lib/storage/proxy-auth.ts`'s `COMPANY_ID_RE` /
 * `lib/storage/upload-ticket.ts`'s `UUID_RE`. Duplicated deliberately —
 * those modules are out of scope for this plan. Keep all three identical if
 * any ever changes.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUploadTicketBucket(value: unknown): value is UploadTicketBucket {
  return (
    typeof value === 'string' &&
    (UPLOAD_TICKET_BUCKETS as readonly string[]).includes(value)
  )
}

export async function POST(request: Request) {
  // Gate 1: body parse + shape. No auth work done yet.
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return jsonNoStore({ error: 'Invalid request body' }, 400)
  }

  const { bucket, projectId, contentType, key } = body as {
    bucket?: unknown
    projectId?: unknown
    contentType?: unknown
    key?: unknown
  }

  if (!isUploadTicketBucket(bucket)) {
    return jsonNoStore({ error: 'bucket not allowed' }, 400)
  }
  if (typeof projectId !== 'string' || !UUID_RE.test(projectId)) {
    return jsonNoStore({ error: 'projectId must be a UUID' }, 400)
  }
  if (typeof contentType !== 'string') {
    return jsonNoStore({ error: 'contentType is required' }, 400)
  }
  const normalizedContentType = normalizeUploadContentType(contentType)
  if (!normalizedContentType) {
    return jsonNoStore({ error: 'contentType not allowed' }, 400)
  }
  // `key` is retry-only. Type-checked here, but NOT pre-sanitized —
  // lib/storage/upload-ticket.ts's assertKeyInTenant owns validating it
  // (reject-never-repair), so it is passed through unchanged.
  if (key !== undefined && typeof key !== 'string') {
    return jsonNoStore({ error: 'key must be a string' }, 400)
  }

  // Gate 2: auth.
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) {
    return jsonNoStore({ error: 'Not authenticated' }, 401)
  }
  const companyId = await getActiveCompanyId()
  if (!companyId) {
    return jsonNoStore({ error: 'No company found' }, 401)
  }

  // Gate 3: demo guard. Must run before any DB read and before minting.
  const blocked = await demoGuardResponse()
  if (blocked) {
    blocked.headers.set('Cache-Control', 'private, no-store')
    return blocked
  }

  // Gate 4: project ownership. No row -> 404, not 403 — the response must
  // not confirm the project exists at all.
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!project) {
    return jsonNoStore({ error: 'Not found' }, 404)
  }

  // Gate 5: mint. Only after every gate above has passed.
  try {
    const ticket = await mintUploadTicket({
      bucket,
      projectId,
      contentType: normalizedContentType,
      companyId,
      supabase,
      key,
    })
    return jsonNoStore(ticket, 200)
  } catch (error) {
    console.error('[upload-ticket] mintUploadTicket failed:', error)
    return jsonNoStore({ error: 'Could not issue upload ticket' }, 500)
  }
}
