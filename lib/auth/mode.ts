/** Explicit rollout boundary. An enabled owned login never falls back to GoTrue. */
export function ownedAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_MODE === 'owned'
}
