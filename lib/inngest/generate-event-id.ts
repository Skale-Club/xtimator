/** Stable across retries of the same estimate-generation request. */
export function buildGenerateEventId(projectId: string, requestId: string) {
  return `estimate-${projectId}-${requestId}`
}
