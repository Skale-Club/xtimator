// lib/estimate/signature-evidence.ts
//
// The evidence behind an online signature, as the owner sees it (editor
// "Signature details") and as the signed PDF prints it (certificate page).
//
// Integrity: the signature row stores signed_content (the frozen snapshot) and
// snapshot_sha256 (its SHA-256 at signing time, 20261121140000). Recomputing the
// canonical hash of signed_content and comparing proves the snapshot was not
// altered since signing. Server only (node:crypto via content-fingerprint).
import 'server-only'
import { fingerprintSignedContent } from '@/lib/estimate/content-fingerprint'
import type { SignedContentSnapshot } from '@/lib/estimate/signed-snapshot'

export type SignatureIntegrity = 'verified' | 'mismatch' | 'unavailable'

/** Everything a viewer of the evidence needs; plain JSON, safe to hand to a client component of the owner. */
export interface SignatureEvidence {
  signerName: string
  signerEmail: string | null
  /** ISO timestamp of the signature. */
  signedAt: string
  ipAddress: string | null
  /** Short human description of the signer's device, e.g. "Safari on iPhone". */
  device: string | null
  userAgent: string | null
  signedTotal: number | null
  currencyCode: string
  /** SHA-256 hex recorded at signing time; null for signatures older than the hash. */
  sha256: string | null
  integrity: SignatureIntegrity
  /** The consent statement shown to the signer, when the snapshot recorded it. */
  consentStatement: string | null
  /** Signature image (data:image/png). */
  signatureDataUrl: string
}

/** The estimate_signatures columns the evidence is built from. */
export interface SignatureEvidenceRow {
  signer_name: string
  signer_email: string | null
  signed_at: string
  ip_address: string | null
  user_agent: string | null
  signature_data: string
  signed_content: SignedContentSnapshot | null
  signed_total: number | string | null
  snapshot_sha256: string | null
}

export const SIGNATURE_EVIDENCE_COLUMNS =
  'signer_name, signer_email, signed_at, ip_address, user_agent, signature_data, signed_content, signed_total, snapshot_sha256'

/** Compares the stored hash with one recomputed from the stored snapshot. */
export function verifySignatureIntegrity(
  signedContent: SignedContentSnapshot | null | undefined,
  storedSha256: string | null | undefined
): SignatureIntegrity {
  if (!signedContent || !storedSha256) return 'unavailable'
  try {
    return fingerprintSignedContent(signedContent) === storedSha256.toLowerCase() ? 'verified' : 'mismatch'
  } catch {
    return 'mismatch'
  }
}

const BROWSERS: Array<[RegExp, string]> = [
  [/EdgA?\/|Edg\//, 'Edge'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/CriOS\/|Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]

const SYSTEMS: Array<[RegExp, string]> = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/CrOS/, 'Chromebook'],
  [/Linux/, 'Linux'],
]

/** "Safari on iPhone", "Chrome on Windows", or null when the user agent says nothing useful. */
export function describeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1] ?? null
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1] ?? null
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? null
}

export function buildSignatureEvidence(row: SignatureEvidenceRow): SignatureEvidence {
  const total = row.signed_total == null ? null : Number(row.signed_total)
  return {
    signerName: row.signer_name,
    signerEmail: row.signer_email ?? null,
    signedAt: row.signed_at,
    ipAddress: row.ip_address ?? null,
    device: describeUserAgent(row.user_agent),
    userAgent: row.user_agent ?? null,
    signedTotal: total != null && Number.isFinite(total) ? total : null,
    currencyCode: row.signed_content?.currency_code ?? 'USD',
    sha256: row.snapshot_sha256 ?? null,
    integrity: verifySignatureIntegrity(row.signed_content, row.snapshot_sha256),
    consentStatement: row.signed_content?.consent?.statement ?? null,
    signatureDataUrl: row.signature_data,
  }
}
