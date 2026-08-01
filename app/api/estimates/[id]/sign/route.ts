import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createHash } from 'node:crypto'
import { resolveClientIp } from '@/lib/http/client-ip'
import { requireServiceClient } from '@/lib/supabase/service'
import { demoGuardResponse } from '@/lib/demo/guard'
import { rateLimit } from '@/lib/ratelimit'
import { notifyEstimateResponse } from '@/lib/estimate/notify-response'
import {
  buildSignedContentSnapshot,
  canonicalJsonStringify,
  SIGN_CONSENT_STATEMENT,
  SIGN_CONSENT_KEY,
  type SnapshotSourceEstimate,
  type SnapshotSourceSection,
  type SignedContentSnapshot,
} from '@/lib/estimate/signed-snapshot'

interface SignRequestBody {
  token: string
  signerName: string
  signerEmail?: string
  signatureData: string
}

// TRUST-01: select('*') here (not the old minimal column list) because the
// full row is ALSO the source for the immutable signed_content snapshot
// below — the snapshot must mirror every rendered/editable field.
// updated_at rides along in '*' — it is what closes the torn-snapshot race
// (audit finding b3): captured here, passed to sign_estimate_atomic as
// p_expected_updated_at, and re-checked INSIDE that RPC's row lock.
type SignEstimateRow = SnapshotSourceEstimate & {
  id: string
  company_id: string
  project_id: string
  share_token: string
  client_response: string | null
  updated_at: string
}

interface SignRpcResult {
  project_id: string
  company_id: string
  estimate_number: string | null
  client_name: string | null
}

// Security-hardening S2: sign_estimate_atomic's distinct SQLSTATEs (see
// supabase/migrations/20260729000002_sign_estimate_atomic.sql's header for
// the full P0001-P0008 registry shared across this codebase's atomic RPCs —
// P0001-P0005 belong to OTHER functions; these three are this RPC's alone,
// so matching on rpcError.code here is unambiguous).
const SIGN_RPC_NOT_FOUND = 'P0006'
const SIGN_RPC_CONFLICT = 'P0007'
const SIGN_RPC_ALREADY_RESPONDED = 'P0008'

// Security-hardening S2 (audit finding a — SSRF + unbounded row size):
// signatureData used to be stored as ANY string, including an
// attacker-supplied http(s) URL. That value is later fed to react-pdf's
// <Image src> (components/pdf/shared/pdf-signature-block.tsx), which fetches
// it SERVER-SIDE during PDF rendering — an SSRF primitive reachable from
// anyone holding a share link. Constraining the value to a data: URI whose
// decoded bytes start with the PNG magic number closes the SSRF vector
// entirely (no network fetch is ever made of a value that passes this
// check) and caps the row size (canvas signatures run ~5-30KB; 200KB is
// generous headroom).
const SIGNATURE_DATA_URL_PREFIX = 'data:image/png;base64,'
const MAX_SIGNATURE_BYTES = 200 * 1024
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const BASE64_RE = /^[A-Za-z0-9+/]+=*$/

function validateSignatureData(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(SIGNATURE_DATA_URL_PREFIX)) {
    return 'Signature must be a PNG image data URL'
  }
  const payload = value.slice(SIGNATURE_DATA_URL_PREFIX.length)
  if (payload.length === 0 || !BASE64_RE.test(payload)) {
    return 'Invalid signature data encoding'
  }
  const decoded = Buffer.from(payload, 'base64')
  if (decoded.length === 0) {
    return 'Invalid signature data encoding'
  }
  if (decoded.length > MAX_SIGNATURE_BYTES) {
    return 'Signature image is too large'
  }
  if (!decoded.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return 'Signature data is not a valid PNG image'
  }
  return null
}

const SIGNER_EMAIL_RE = /^\S+@\S+\.\S+$/

/** Returns the trimmed email (or null when absent/blank), or `undefined` to signal "invalid — 400". */
function validateSignerEmail(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > 320 || !SIGNER_EMAIL_RE.test(trimmed)) return undefined
  return trimmed
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Fix-pack F1 (finding #4 — rate limit sat AFTER body parse + estimate
    // lookup): IP resolution + rate limiting now run FIRST, before
    // request.json() and before ANY DB query (including the estimate lookup
    // and the demo guard below). This is an unauthenticated, share-token-gated
    // public endpoint that writes a signature + PII row — the old ordering let
    // an attacker enumerate ids/tokens and materialize arbitrarily large
    // request bodies entirely unthrottled, since both the JSON parse and the
    // estimates SELECT ran before the limiter ever got a chance to deny.
    const headersList = await headers()
    // Security-hardening S2 (audit finding d) / fix-pack F1 (finding #5 —
    // x-real-ip reopens IP spoofing): IP resolution mechanics (last
    // forwarded-for hop wins, x-real-ip never trusted, isIP() validation) now
    // live in the shared lib/http/client-ip.ts helper — see its doc comment
    // for the full rationale. A forged/garbage value previously flowed
    // straight into sign_estimate_atomic's `inet`-typed parameter, so the
    // helper's null-on-invalid behavior is what keeps that cast safe.
    const ipAddress = resolveClientIp(headersList)
    const userAgent = headersList.get('user-agent') ?? null

    // Security-hardening S2 (audit finding c) / fix-pack F1 (finding #4):
    // keyed by the resolved client IP. The share token is NOT a usable
    // fallback key here anymore — it hasn't been parsed out of the (not yet
    // read) request body at this point in the flow — so 'no-ip' is a single
    // shared bucket for the rare case of a request with no forwarded-for
    // header at all (e.g. local dev with no proxy in front). That's an
    // acceptable degrade: an unauthenticated public write endpoint must be
    // throttled before ANYTHING else runs, even when it can't yet identify
    // the specific caller.
    const rl = await rateLimit('signPerMinute', ipAddress ?? 'no-ip')
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many signing attempts', code: 'rate_limit:sign' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      )
    }

    let body: SignRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { token, signerName, signerEmail, signatureData } = body

    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    // Field validation — all before any DB query.
    const trimmedName = typeof signerName === 'string' ? signerName.trim() : ''
    if (trimmedName.length < 1 || trimmedName.length > 200) {
      return NextResponse.json(
        { error: 'Signer name must be between 1 and 200 characters' },
        { status: 400 }
      )
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

    // Verify estimate by share_token + id match
    const { data: estimateData } = await supabase
      .from('estimates')
      .select('*')
      .eq('id', id)
      .eq('share_token', token)
      .single()

    if (!estimateData) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    const estimate = estimateData as unknown as SignEstimateRow

    // Demo guard: unchanged in relative position — still runs before the
    // company check and every downstream write below (fix-pack F1 only moved
    // the RATE LIMIT ahead of it, per finding #4's rationale above; the demo
    // guard itself still precedes every WRITE this route can perform).
    const blocked = await demoGuardResponse({ companyId: estimate.company_id })
    if (blocked) return blocked

    // Verify company has digital_signature_enabled. Also fetch the Terms &
    // Conditions fields here (not a separate query) — security-hardening S1:
    // the snapshot must freeze company terms AS OF signing, so they're read
    // from this SAME row buildSignedContentSnapshot's extras use below.
    const { data: company } = await supabase
      .from('companies')
      .select('digital_signature_enabled, estimate_terms_enabled, estimate_terms_text')
      .eq('id', estimate.company_id)
      .single()

    if (!company?.digital_signature_enabled) {
      return NextResponse.json({ error: 'Digital signature not enabled' }, { status: 403 })
    }

    // Captured outside the attemptSign closure below: TS narrowing of a
    // captured outer `const` does not survive into a nested function
    // (the closure could in principle run after further reassignment), so
    // `company` itself would still type as possibly-null inside attemptSign
    // even though the guard above already proved it non-null here.
    const companyTerms = {
      enabled: !!company.estimate_terms_enabled,
      text: company.estimate_terms_text ?? null,
    }

    type AttemptOutcome =
      | { kind: 'success'; result: SignRpcResult }
      | { kind: 'rpc_error'; code: string | undefined }
      | { kind: 'load_error' }
      | { kind: 'snapshot_error' }

    // TRUST-01: load the full render content (sections + items, ordered by
    // sort_order) and build the immutable snapshot from it, THEN call the
    // atomic RPC. Failure posture is FAIL CLOSED — a signature we cannot
    // evidence is the exact bug this phase kills, so a content-load or
    // serialization failure aborts the signing request entirely rather than
    // inserting a signature without a snapshot. Wrapped in a function so the
    // estimate_conflict retry path (below) can re-run the WHOLE
    // read+build+RPC sequence against a freshly re-read row.
    async function attemptSign(estimateRow: SignEstimateRow): Promise<AttemptOutcome> {
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('estimate_sections')
        .select('*, items:estimate_items(*)')
        .eq('estimate_id', estimateRow.id)
        .order('sort_order', { ascending: true })
        .order('sort_order', { foreignTable: 'estimate_items', ascending: true })

      if (sectionsError || !sectionsData) {
        console.error('Signature snapshot content load error:', sectionsError)
        return { kind: 'load_error' }
      }

      let signedContent: SignedContentSnapshot
      try {
        signedContent = buildSignedContentSnapshot(
          estimateRow,
          sectionsData as unknown as SnapshotSourceSection[],
          {
            companyTerms,
            consent: { statement: SIGN_CONSENT_STATEMENT, key: SIGN_CONSENT_KEY },
          }
        )
      } catch (snapshotError) {
        console.error('Signature snapshot build error:', snapshotError)
        return { kind: 'snapshot_error' }
      }

      // Security-hardening S2 (audit finding f — tamper-evidence) / fix-pack F1
      // (finding #3 — hash not reproducible from stored jsonb): SHA-256 over
      // the CANONICAL (sorted-key) serialization of signedContent, recorded in
      // the estimate_signed activity row (see the migration) as evidence the
      // signature's snapshot has not been altered since signing.
      //
      // `p_signed_content` below is persisted into a **jsonb** column, which
      // normalizes/discards object key-insertion order on write — so hashing
      // plain JSON.stringify(signedContent) (as this used to do) captured only
      // THIS process's insertion order; re-reading the row back and hashing it
      // with plain JSON.stringify again could walk the keys in a different
      // order and produce a DIFFERENT digest for byte-identical content, which
      // means a verifier could never reproduce the hash — defeating the point
      // of a tamper-evidence hash entirely. canonicalJsonStringify sorts object
      // keys deterministically (see its doc comment in signed-snapshot.ts), so
      // the hash instead covers a serialization a verifier CAN always
      // reproduce: read `estimate_signatures.signed_content` back, pass it
      // through canonicalJsonStringify the same way, and compare.
      const snapshotSha256 = createHash('sha256')
        .update(canonicalJsonStringify(signedContent))
        .digest('hex')

      const { data: rpcData, error: rpcError } = await supabase.rpc('sign_estimate_atomic', {
        p_estimate_id: estimateRow.id,
        p_share_token: token,
        p_expected_updated_at: estimateRow.updated_at,
        p_signer_name: trimmedName,
        p_signer_email: signerEmailValue,
        p_signature_data: signatureData,
        p_ip_address: ipAddress,
        p_user_agent: userAgent,
        p_signed_content: signedContent,
        p_signed_total: estimateRow.total,
        p_snapshot_sha256: snapshotSha256,
      })

      if (rpcError) {
        return { kind: 'rpc_error', code: (rpcError as { code?: string }).code }
      }

      return { kind: 'success', result: rpcData as SignRpcResult }
    }

    let outcome = await attemptSign(estimate)

    if (outcome.kind === 'rpc_error' && outcome.code === SIGN_RPC_CONFLICT) {
      // Security-hardening S2 (audit finding b3 — torn snapshot): the RPC's
      // compare-and-set tripped, meaning the estimate changed between our
      // read above and the RPC call. Re-read the row fresh (id + share_token
      // must still match) and rebuild the ENTIRE snapshot from scratch
      // before retrying ONCE. A second conflict means the estimate is being
      // edited fast enough that we give up rather than retry forever.
      const { data: freshEstimateData } = await supabase
        .from('estimates')
        .select('*')
        .eq('id', id)
        .eq('share_token', token)
        .single()

      if (!freshEstimateData) {
        return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
      }

      outcome = await attemptSign(freshEstimateData as unknown as SignEstimateRow)
    }

    if (outcome.kind === 'load_error') {
      return NextResponse.json(
        { error: 'Failed to load estimate content for signing' },
        { status: 500 }
      )
    }
    if (outcome.kind === 'snapshot_error') {
      return NextResponse.json({ error: 'Failed to build signature snapshot' }, { status: 500 })
    }
    if (outcome.kind === 'rpc_error') {
      if (outcome.code === SIGN_RPC_NOT_FOUND) {
        return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
      }
      if (outcome.code === SIGN_RPC_ALREADY_RESPONDED) {
        return NextResponse.json({ error: 'Estimate already responded to' }, { status: 409 })
      }
      if (outcome.code === SIGN_RPC_CONFLICT) {
        return NextResponse.json(
          {
            error:
              'This estimate was changed elsewhere while you were signing. Please reload and try again.',
          },
          { status: 409 }
        )
      }
      console.error('Sign RPC error:', outcome.code)
      return NextResponse.json({ error: 'Failed to save signature' }, { status: 500 })
    }

    // A signature IS acceptance — fire the same post-acceptance
    // notification/email path the public "Accept" button uses
    // (lib/estimate/notify-response.ts), best-effort: the signature + the
    // client_response/project-status flip already committed atomically
    // inside sign_estimate_atomic above, so a notification failure here must
    // never surface as a failure of the sign request itself.
    try {
      await notifyEstimateResponse(
        {
          id,
          project_id: outcome.result.project_id,
          company_id: outcome.result.company_id,
          estimate_number: outcome.result.estimate_number,
          client_name: outcome.result.client_name,
        },
        'accepted'
      )
    } catch (notifyError) {
      console.warn('[sign] notifyEstimateResponse failed:', notifyError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Sign endpoint error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
