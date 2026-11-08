import { createHash } from 'node:crypto'

/**
 * Stable UUID derived from a name (RFC 4122 version 5 layout over SHA-1).
 *
 * Use it when a row needs an id that is a pure function of other ids, e.g. a
 * per-photo or per-research cost attempt derived from the generation's attempt
 * id. Columns such as ai_cost_events.attempt_id are UUID NOT NULL, so a
 * composite string ("<attempt>:vision:<photo>") cannot be stored as-is; this
 * maps it to a valid UUID that is identical on every retry.
 *
 * `namespace` must be a UUID; the default is fixed for this app so the same name
 * always yields the same id.
 */
const DEFAULT_NAMESPACE = '6f0f7b3a-2a7e-4b55-9d1c-5b1e0a4c2d10'

export function deterministicUuid(name: string, namespace: string = DEFAULT_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  if (ns.length !== 16) throw new Error('deterministicUuid: namespace must be a UUID')
  const hash = createHash('sha1').update(ns).update(name, 'utf8').digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50 // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
