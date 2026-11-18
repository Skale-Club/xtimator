type ClientMatch = { id: string; name: string }

function normalizeClientName(name: string): string {
  return name.toLowerCase().replace(/[.,]/g, '').trim().replace(/\s+/g, ' ')
}

/** A detected name identifies an existing client only when exactly one normalized name matches. */
export function findUniqueClientMatch(
  detectedName: string,
  clients: readonly ClientMatch[],
): ClientMatch | null {
  const normalizedName = normalizeClientName(detectedName)
  if (!normalizedName) return null

  let match: ClientMatch | null = null
  for (const client of clients) {
    if (normalizeClientName(client.name) !== normalizedName) continue
    if (match) return null
    match = client
  }
  return match
}
