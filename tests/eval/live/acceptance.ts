interface LiveOutcome {
  id: string
  ok: boolean
  error?: string
  rubric: { score: number } | null
}

export function selectLiveCases<Case extends { id: string }>(
  goldenCases: readonly Case[],
  requestedCases: string | undefined,
  maxCases: string | undefined,
): { cases: Case[]; errors: string[] } {
  const errors: string[] = []
  const configuredCap = maxCases?.trim() || '18'
  const cap = Number(configuredCap)
  const validCap = /^\d+$/.test(configuredCap) && Number.isSafeInteger(cap) && cap > 0
  if (!validCap) errors.push('EVAL_LIVE_MAX_CASES must be a positive integer')

  const configuredCases = requestedCases?.trim()
  const wanted = configuredCases ? configuredCases.split(',').map((id) => id.trim()) : []
  if (wanted.includes('')) errors.push('EVAL_LIVE_CASES contains an empty case ID')

  const knownIds = new Set(goldenCases.map((c) => c.id))
  const unknown = [...new Set(wanted.filter((id) => id && !knownIds.has(id)))].sort()
  if (unknown.length) errors.push(`Unknown golden case IDs: ${unknown.join(', ')}`)

  const pool = wanted.length ? goldenCases.filter((c) => wanted.includes(c.id)) : goldenCases
  const cases = validCap ? pool.slice(0, cap) : []
  if (!cases.length) errors.push('No golden cases were selected')
  return { cases, errors }
}

export function inspectLiveResults(selectedCount: number, results: readonly LiveOutcome[]) {
  const failedCases: Array<{ id: string; reason: string }> = []
  for (const result of results) {
    // runLiveCase sets ok=false when the production normalizer rejects the model output.
    if (!result.ok) {
      const reason = result.error?.startsWith('schema:') ? 'schema validation failed' : 'case failed'
      failedCases.push({ id: result.id, reason })
    } else if (!result.rubric || !Number.isFinite(result.rubric.score) || result.rubric.score < 0 || result.rubric.score > 100) {
      failedCases.push({ id: result.id, reason: 'rubric score is missing or invalid' })
    }
  }

  const errors = failedCases.map(({ id, reason }) => `${id}: ${reason}`)
  if (!selectedCount) errors.push('No golden cases were selected')
  if (results.length !== selectedCount) errors.push(`Expected ${selectedCount} case outcomes, got ${results.length}`)
  return { failedCases, errors }
}
