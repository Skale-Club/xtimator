import { isIP } from 'node:net'

/**
 * Resolves the caller's IP from request headers under this deployment's
 * trust model: the app sits behind exactly ONE trusted edge proxy
 * (Traefik/Coolify), which APPENDS the real client IP as the LAST
 * `x-forwarded-for` entry — any EARLIER entries are attacker-supplied via a
 * crafted request header. `x-real-ip` is deliberately never read: it is
 * exactly as client-forgeable as any other request header unless the edge
 * strips it, and nothing in this repo proves Traefik/Coolify does.
 * `isIP()` (node:net) validates the resolved candidate — it returns 0 for
 * anything that isn't a well-formed IPv4/IPv6 literal — so a garbage/absent
 * header degrades to `null` rather than a raw string ever reaching a
 * Postgres `inet`-typed column.
 *
 * If a CDN (e.g. Cloudflare) is ever put in front of the edge proxy, this
 * "last hop wins" rule must be revisited — a CDN would append its own edge
 * IP after Traefik's, no longer the client's.
 */
export function resolveClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get('x-forwarded-for')
  if (!forwardedFor) return null

  const lastEntry = forwardedFor
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .pop()

  if (!lastEntry) return null

  return isIP(lastEntry) !== 0 ? lastEntry : null
}
