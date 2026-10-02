import { isIP } from 'node:net'
import { clientIpFromHeaders } from '@/lib/security/bot-defense'

/**
 * Resolves the caller's IP from request headers.
 *
 * Trust model: requests reach us through Traefik/Coolify, which APPENDS its
 * peer to `x-forwarded-for`; entries further LEFT were written by the client
 * and are never trusted. That peer is the visitor for hosts served directly,
 * but a Cloudflare edge for hosts proxied by Cloudflare — the old "last hop
 * wins" rule returned the edge there, putting every visitor behind one PoP in
 * the same rate-limit bucket. So the chain is walked right-to-left through
 * our own internal hops, and `cf-connecting-ip` is honoured ONLY when the peer
 * is a real Cloudflare edge (see lib/security/bot-defense.ts). Custom domains
 * are not guaranteed to be on Cloudflare, so neither case can be assumed.
 *
 * `x-real-ip` is deliberately never read: it is exactly as client-forgeable as
 * any other request header unless the edge strips it. `isIP()` validates the
 * result, so a garbage/absent header degrades to `null` rather than a raw
 * string ever reaching a Postgres `inet`-typed column.
 */
export function resolveClientIp(headers: Headers): string | null {
  const ip = clientIpFromHeaders(headers)
  return ip && isIP(ip) !== 0 ? ip : null
}
