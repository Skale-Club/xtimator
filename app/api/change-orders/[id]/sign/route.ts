import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { resolveClientIp } from '@/lib/http/client-ip'
import { requireServiceClient } from '@/lib/supabase/service'
import { demoGuardResponse } from '@/lib/demo/guard'
import { rateLimit } from '@/lib/ratelimit'
import { notifyChangeOrderResponse } from '@/lib/change-orders/notify'
import {
  buildChangeOrderSnapshot,
  hashChangeOrderSnapshot,
  type ChangeOrderSnapshotSource,
  type ChangeOrderSnapshotSourceItem,
} from '@/lib/change-orders/snapshot'
import {
  sameInstant,
  validateSignatureData,
  validateSignerEmail,
} from '@/lib/change-orders/sign-validation'

/**
 * Public online signature of a change order. Mirrors
 * app/api/estimates/[id]/sign/route.ts: rate limit first, then body + field
 * validation, then the share-token lookup, demo guard, online-approval check,
 * the content-version check and the atomic RPC. NO retry on a version conflict:
 * re-reading and re-signing would sign content the client never saw; the client
 * page reloads instead.
 *
 * SQLSTATEs from sign_change_order_atomic (20261117000001_change_orders.sql):
 * P0012 stale content version, P0013 not found, P0014 parent estimate no longer
 * the current accepted one, P0015 already responded.
 */

interface SignRequestBody {
  token: string
  signerName: string
  signerEmail?: string
  signatureData: string
  /** The change order's `updated_at` exactly as the public page rendered it. */
  contentVersion?: unknown
}

type SignChangeOrderRow = ChangeOrderSnapshotSource & {
  id: string
  company_id: string
  share_token: string
  client_response: string | null
  total: number
  updated_at: string
}

interface SignRpcResult {
  project_id: string
  company_id: string
  estimate_number: string | null
  client_name: string | null
  number: number
  title: string | null
}

const SIGN_RPC_CONFLICT = 'P0012'
const SIGN_RPC_NOT_FOUND = 'P0013'
const SIGN_RPC_CONTRACT_NOT_ACCEPTED = 'P0014'
const SIGN_RPC_ALREADY_RESPONDED = 'P0015'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Throttle FIRST: unauthenticated, token-gated public write endpoint.
    const headersList = await headers()
    const ipAddress = resolveClientIp(headersList)
    const userAgent = headersList.get('user-agent') ?? null

    const rl = await rateLimit('signPerMinute', ipAddress ?? 'no-ip')
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many signing attempts', code: 'rate_limit:sign' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      )
    }

    let body: SignRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { token, signerName, signerEmail, signatureData, contentVersion } = body

    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const trimmedName = typeof signerName === 'string' ? signerName.trim() : ''
    if (trimmedName.length < 1 || trimmedName.length > 200) {
      return NextResponse.json({ error: 'Signer name must be between 1 and 200 characters' }, { status: 400 })
    }

    const signerEmailValue = validateSignerEmail(signerEmail)
    if (signerEmailValue === undefined) {
      return NextResponse.json({ error: 'Invalid signer email' }, { status: 400 })
    }

    const signatureError = validateSignatureData(signatureData)
    if (signatureError) {
      return NextResponse.json({ error: signatureError }, { status: 400 })
    }

    const supabase = requireServiceClient()

    const { data: changeOrderData } = await supabase
      .from('change_orders')
      .select('*')
      .eq('id', id)
      .eq('share_token', token)
      .single()

    if (!changeOrderData) {
      return NextResponse.json({ error: 'Change order not found' }, { status: 404 })
    }
    const changeOrder = changeOrderData as unknown as SignChangeOrderRow

    const blocked = await demoGuardResponse({ companyId: changeOrder.company_id })
    if (blocked) return blocked

    const { data: company } = await supabase
      .from('companies')
      .select('digital_signature_enabled')
      .eq('id', changeOrder.company_id)
      .single()

    if (!company?.digital_signature_enabled) {
      return NextResponse.json({ error: 'Digital signature not enabled' }, { status: 403 })
    }

    // Answered already (a second tap, or the owner recorded it): say so before
    // the version check, which would otherwise report a restamped updated_at.
    if (changeOrder.client_response) {
      return NextResponse.json({ error: 'already_responded' }, { status: 409 })
    }

    // The client must sign exactly the content they saw.
    if (!sameInstant(contentVersion, changeOrder.updated_at)) {
      return NextResponse.json({ error: 'change_order_updated' }, { status: 409 })
    }
    const expectedUpdatedAt = contentVersion as string

    const { data: itemsData, error: itemsError } = await supabase
      .from('change_order_items')
      .select('*')
      .eq('change_order_id', changeOrder.id)
      .order('sort_order', { ascending: true })

    if (itemsError || !itemsData) {
      console.error('Change order snapshot content load error:', itemsError)
      return NextResponse.json({ error: 'Failed to load change order content for signing' }, { status: 500 })
    }

    let snapshotSha256: string
    let signedContent: ReturnType<typeof buildChangeOrderSnapshot>
    try {
      signedContent = buildChangeOrderSnapshot(changeOrder, itemsData as unknown as ChangeOrderSnapshotSourceItem[])
      snapshotSha256 = hashChangeOrderSnapshot(signedContent)
    } catch (snapshotError) {
      console.error('Change order snapshot build error:', snapshotError)
      return NextResponse.json({ error: 'Failed to build signature snapshot' }, { status: 500 })
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('sign_change_order_atomic', {
      p_change_order_id: changeOrder.id,
      p_share_token: token,
      p_expected_updated_at: expectedUpdatedAt,
      p_signer_name: trimmedName,
      p_signer_email: signerEmailValue,
      p_signature_data: signatureData,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_signed_content: signedContent,
      p_signed_total: changeOrder.total,
      p_snapshot_sha256: snapshotSha256,
    })

    if (rpcError) {
      const code = (rpcError as { code?: string }).code
      if (code === SIGN_RPC_NOT_FOUND) {
        return NextResponse.json({ error: 'Change order not found' }, { status: 404 })
      }
      if (code === SIGN_RPC_ALREADY_RESPONDED) {
        return NextResponse.json({ error: 'already_responded' }, { status: 409 })
      }
      if (code === SIGN_RPC_CONFLICT) {
        return NextResponse.json({ error: 'change_order_updated' }, { status: 409 })
      }
      if (code === SIGN_RPC_CONTRACT_NOT_ACCEPTED) {
        return NextResponse.json({ error: 'contract_not_accepted' }, { status: 409 })
      }
      console.error('Change order sign RPC error:', code)
      return NextResponse.json({ error: 'Failed to save signature' }, { status: 500 })
    }

    // A signature IS approval: notify the owner, best-effort (the signature and
    // the project total already committed atomically inside the RPC).
    try {
      const result = rpcData as SignRpcResult
      await notifyChangeOrderResponse(
        {
          id: changeOrder.id,
          number: result.number,
          title: result.title,
          project_id: result.project_id,
          company_id: result.company_id,
          estimate_number: result.estimate_number,
          client_name: result.client_name,
        },
        'accepted',
      )
    } catch (notifyError) {
      console.warn('[change-order sign] notifyChangeOrderResponse failed:', notifyError)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Change order sign endpoint error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
