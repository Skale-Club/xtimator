// lib/estimate/content-fingerprint.ts
//
// "The client signs exactly what they saw", enforced on the content itself.
//
// The estimate's content version (estimates.updated_at) only covers the estimate
// and its sections and items. The signed snapshot also freezes the company's
// Terms & Conditions, which live on the companies row and do not move that
// version: the owner could edit them while the client had the page open and the
// client would sign terms they never read.
//
// So the public page is rendered with a fingerprint of everything the snapshot
// will freeze, the client sends it back when signing, and the sign route
// recomputes it from fresh rows. A different value means the document changed
// after the page was rendered: the route answers 409 and the page asks the
// client to reload.
//
// The fingerprint IS the snapshot hash: both sides build the snapshot with
// buildSignableSnapshot and hash its canonical serialization, so the value the
// page showed equals the snapshot_sha256 recorded with the signature.
//
// Server only (node:crypto). Never import this from a client component.
import { createHash } from 'node:crypto'
import {
  buildSignedContentSnapshot,
  canonicalJsonStringify,
  SIGN_CONSENT_KEY,
  SIGN_CONSENT_STATEMENT,
  type SignedContentSnapshot,
  type SnapshotSourceEstimate,
  type SnapshotSourceSection,
} from '@/lib/estimate/signed-snapshot'

/** The company columns the snapshot freezes. */
export interface SignableCompanyTerms {
  estimate_terms_enabled?: boolean | null
  estimate_terms_text?: string | null
}

/**
 * The snapshot a signature would freeze right now. The ONE builder shared by
 * the public page (fingerprint) and the sign route (fingerprint + stored
 * snapshot), so the two can never drift apart.
 */
export function buildSignableSnapshot(
  estimate: SnapshotSourceEstimate,
  sections: SnapshotSourceSection[],
  company: SignableCompanyTerms | null | undefined
): SignedContentSnapshot {
  return buildSignedContentSnapshot(estimate, sections, {
    companyTerms: {
      enabled: !!company?.estimate_terms_enabled,
      text: company?.estimate_terms_text ?? null,
    },
    consent: { statement: SIGN_CONSENT_STATEMENT, key: SIGN_CONSENT_KEY },
  })
}

/** SHA-256 (hex) over the canonical (sorted-key) serialization of a snapshot. */
export function fingerprintSignedContent(snapshot: SignedContentSnapshot): string {
  return createHash('sha256').update(canonicalJsonStringify(snapshot)).digest('hex')
}

/** Fingerprint of the content a signature would freeze right now. */
export function computeContentFingerprint(
  estimate: SnapshotSourceEstimate,
  sections: SnapshotSourceSection[],
  company: SignableCompanyTerms | null | undefined
): string {
  return fingerprintSignedContent(buildSignableSnapshot(estimate, sections, company))
}
