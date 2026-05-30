/** Build the public, shareable estimate URL from its share token. */
export function buildShareLink(shareToken: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/estimate/${shareToken}`
}
