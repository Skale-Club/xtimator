type FatalReactFailure = 'hook-order' | 'hydration' | 'rsc-serialization'
type AssetType = 'script' | 'stylesheet'
type Observation = {
  source: 'pageerror' | 'console.error' | 'asset-response' | 'asset-requestfailed'
  classification: FatalReactFailure | 'unhandled-exception' | 'http-4xx' | 'http-5xx'
    | 'connection-retry-limit' | 'load-failed' | 'fetch-rejection' | 'request-failed' | 'cancelled'
  resourceType?: AssetType
  fatal: boolean
  count: number
}

function classifyReactFailure(text: string): FatalReactFailure | null {
  if (/rendered (?:more|fewer) hooks|(?:minified react error|react\.dev\/errors\/)\s*#?(?:300|310)\b/i.test(text)) return 'hook-order'
  if (/hydration failed|error (?:occurred )?while hydrating|text content (?:does not|did not) match server-rendered html|(?:minified react error|react\.dev\/errors\/)\s*#?(?:418|423)\b/i.test(text)) return 'hydration'
  if (/functions cannot be passed directly to client components|event handlers cannot be passed to client component props|only plain objects[^\n]*can be passed to client components from server components/i.test(text)) return 'rsc-serialization'
  return null
}

export function createBrowserFailureTracker(baseURL: string) {
  const origin = new URL(baseURL).origin
  const observations = new Map<string, Observation>()

  function record(input: Omit<Observation, 'count'>) {
    const key = `${input.source}:${input.classification}:${input.resourceType ?? ''}`
    const existing = observations.get(key)
    if (existing) existing.count++
    else observations.set(key, { ...input, count: 1 })
  }

  function firstPartyAsset(url: string, resourceType: string): AssetType | null {
    if (resourceType !== 'script' && resourceType !== 'stylesheet') return null
    return new URL(url).origin === origin ? resourceType : null
  }

  return {
    pageError(text: string) {
      const fetchRejected = /^(?:TypeError:\s*)?(?:Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.)$/i.test(text.trim())
      record({ source: 'pageerror', classification: classifyReactFailure(text) ?? (fetchRejected ? 'fetch-rejection' : 'unhandled-exception'), fatal: true })
    },
    consoleError(text: string) {
      const classification = classifyReactFailure(text)
      if (classification) record({ source: 'console.error', classification, fatal: true })
    },
    assetResponse(url: string, resourceType: string, status: number) {
      const asset = firstPartyAsset(url, resourceType)
      if (asset && status >= 400) record({ source: 'asset-response', resourceType: asset,
        classification: status >= 500 ? 'http-5xx' : 'http-4xx', fatal: true })
    },
    assetRequestFailed(url: string, resourceType: string, errorText: string | undefined) {
      const asset = firstPartyAsset(url, resourceType)
      if (!asset) return
      const code = errorText?.trim()
      const classification = code === 'net::ERR_ABORTED' || code === 'NS_BINDING_ABORTED' || code === 'cancelled' ? 'cancelled'
        : code === 'net::ERR_TOO_MANY_RETRIES' ? 'connection-retry-limit'
        : code === 'Load failed' ? 'load-failed' : 'request-failed'
      record({ source: 'asset-requestfailed', resourceType: asset, classification, fatal: classification !== 'cancelled' })
    },
    summary() {
      const events = Array.from(observations.values(), event => ({ ...event }))
      const fatalCount = events.reduce((total, event) => total + (event.fatal ? event.count : 0), 0)
      return { fatalCount, events }
    },
  }
}
