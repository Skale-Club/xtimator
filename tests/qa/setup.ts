import { createQaFixture } from './fixtures/tenant'

/** Fail once on shared prerequisites instead of producing many opaque UI timeouts. */
export default async function setup() {
  const origin = 'http://127.0.0.1:9650'
  const workers = await fetch(origin + '/api/inngest', { signal: AbortSignal.timeout(60_000) })
  const configuration = await workers.json()
  if (!workers.ok || configuration.function_count !== 3 || configuration.mode !== 'dev') {
    throw new Error('QA must expose exactly the three project workers; broad maintenance jobs are forbidden')
  }
  const fixture = createQaFixture(origin)
  try {
    await fixture.seed()
    const cookie = fixture.cookies().map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join('; ')
    const session = await fetch(origin + '/api/auth/session', { headers: { cookie }, signal: AbortSignal.timeout(60_000) })
    if (!session.ok || (await session.json()).user?.id !== fixture.userId) {
      throw new Error('QA owned-session prerequisite failed; no browser journey may be reported as passed')
    }
    const project = await fetch(origin + `/projects/${fixture.projectId}`, {
      headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(90_000),
    })
    if (project.status !== 200 || !(await project.text()).includes(fixture.projectName)) {
      throw new Error('QA authenticated data prerequisite failed; inspect application/server evidence')
    }
    console.log('QA prerequisites verified: isolated workers, owned session and tenant-scoped project rendering.')
  } finally { await fixture.cleanup() }
}
