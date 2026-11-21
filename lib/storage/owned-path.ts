/**
 * True when `storagePath` is a plain object key under the company's own
 * folder. A bare `startsWith(`${companyId}/`)` also accepted keys such as
 * `<company>/../<other company>/x`, `<company>//x`, backslash variants and
 * NUL-injected keys, which some storage layers normalise onto another tenant's
 * folder. Zero imports; safe in server actions and tests.
 */
export function isOwnedStoragePath(storagePath: unknown, companyId: string): boolean {
  if (typeof storagePath !== 'string' || !companyId) return false
  const prefix = `${companyId}/`
  if (!storagePath.startsWith(prefix)) return false
  const rest = storagePath.slice(prefix.length)
  if (rest.length === 0) return false
  if (rest.startsWith('/')) return false
  if (storagePath.includes('\0') || storagePath.includes('\\')) return false
  return !storagePath.split('/').some((segment) => segment === '..')
}
