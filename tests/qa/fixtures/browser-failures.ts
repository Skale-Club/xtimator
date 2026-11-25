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
  // WebKit reports a fetch cancelled by navigation as a pageerror; whether it is benign is only known once the
  // matching request is seen cancelled (either event order), so those are resolved in summary(). URLs never leave here.
  const cancelledRequests = new Set<string>()
  // WebKit can also report a same-origin fetch whose request answered (the app caught the rejection) when a
  // navigation tears the page down; a same-origin request cannot fail a CORS check, so an answered URL is benign too.
  const answeredRequests = new Set<string>()
  const pendingAccessControl: Array<string | null> = []

  function record(input: Omit<Observation, 'count'>) {
    const key = `${input.source}:${input.classification}:${input.resourceType ?? ''}`
    const existing = observations.get(key)
    if (existing) existing.count++
    else observations.set(key, { ...input, count: 1 })
  }

  function sameOriginKey(raw: string): string | null {
    try {
      const url = new URL(raw)
      return url.origin === origin ? `${url.origin}${url.pathname}${url.search}` : null
    } catch { return null }
  }

  function accessControlUrl(text: string): string | null | undefined {
    // WebKit splits the text at the scheme's colon: the Error name becomes
    // "Fetch API cannot load https" and the message starts at "/host:port/path".
    const match = /^(?:TypeError:\s*)?(?:Fetch API cannot load\s+)?((?:https?:)?\/\S+)\s+due to access control checks\.?$/i.exec(text.trim())
    if (!match) return undefined
    const raw = match[1]
    const absolute = raw.startsWith('//') ? `${new URL(origin).protocol}${raw}`
      : raw.startsWith('/') ? `${new URL(origin).protocol}/${raw}` : raw
    return sameOriginKey(absolute)
  }

  function firstPartyAsset(url: string, resourceType: string): AssetType | null {
    if (resourceType !== 'script' && resourceType !== 'stylesheet') return null
    return new URL(url).origin === origin ? resourceType : null
  }

  return {
    pageError(text: string) {
      const accessControl = accessControlUrl(text)
      if (accessControl !== undefined) { pendingAccessControl.push(accessControl); return }
      const fetchRejected = /^(?:TypeError:\s*)?(?:Load failed|Failed to fetch|NetworkError when attempting to fetch resource\.)$/i.test(text.trim())
      record({ source: 'pageerror', classification: classifyReactFailure(text) ?? (fetchRejected ? 'fetch-rejection' : 'unhandled-exception'), fatal: true })
    },
    consoleError(text: string) {
      const classification = classifyReactFailure(text)
      if (classification) record({ source: 'console.error', classification, fatal: true })
    },
    assetResponse(url: string, resourceType: string, status: number) {
      if ((resourceType === 'fetch' || resourceType === 'xhr') && status < 400) {
        const key = sameOriginKey(url)
        if (key) answeredRequests.add(key)
      }
      const asset = firstPartyAsset(url, resourceType)
      if (asset && status >= 400) record({ source: 'asset-response', resourceType: asset,
        classification: status >= 500 ? 'http-5xx' : 'http-4xx', fatal: true })
    },
    assetRequestFailed(url: string, resourceType: string, errorText: string | undefined) {
      const code = errorText?.trim()
      const wasCancelled = code === 'net::ERR_ABORTED' || code === 'NS_BINDING_ABORTED' || code === 'cancelled'
      if (wasCancelled) {
        const key = sameOriginKey(url)
        if (key) cancelledRequests.add(key)
      }
      const asset = firstPartyAsset(url, resourceType)
      if (!asset) return
      const classification = wasCancelled ? 'cancelled'
        : code === 'net::ERR_TOO_MANY_RETRIES' ? 'connection-retry-limit'
        : code === 'Load failed' ? 'load-failed' : 'request-failed'
      record({ source: 'asset-requestfailed', resourceType: asset, classification, fatal: classification !== 'cancelled' })
    },
    summary() {
      const resolved = new Map<string, Observation>(Array.from(observations, ([key, event]) => [key, { ...event }]))
      for (const key of pendingAccessControl) {
        const cancelled = key !== null && (cancelledRequests.has(key) || answeredRequests.has(key))
        const classification = cancelled ? 'cancelled' : 'unhandled-exception'
        const mapKey = `pageerror:${classification}:`
        const existing = resolved.get(mapKey)
        if (existing) existing.count++
        else resolved.set(mapKey, { source: 'pageerror', classification, fatal: !cancelled, count: 1 })
      }
      const events = Array.from(resolved.values())
      const fatalCount = events.reduce((total, event) => total + (event.fatal ? event.count : 0), 0)
      return { fatalCount, events }
    },
  }
}
