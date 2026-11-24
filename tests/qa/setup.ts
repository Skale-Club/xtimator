import { request } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { QA_APP_ORIGIN } from './fixtures/development'
import { createQaFixture } from './fixtures/tenant'
import { inspectWorkerRegistry } from './fixtures/worker-registry'

/** Fail once on shared prerequisites instead of producing many opaque UI timeouts. */
export default async function setup() {
  const local = await request.newContext({ baseURL: QA_APP_ORIGIN, ignoreHTTPSErrors: true, maxRedirects: 0 })
  try {
    const workers = await local.get('/api/inngest', { timeout: 60_000 })
    const configuration = await workers.json()
    console.log(JSON.stringify({ prerequisite: 'worker-registration', status: workers.status(),
      configurations: configuration.function_count, mode: configuration.mode }))
    // Inngest registers an additional failure-handler configuration for each
    // of the three logical project workers. No maintenance worker is served.
    if (!workers.ok() || configuration.function_count !== 6 || configuration.mode !== 'dev') {
      throw new Error('QA must expose three project workers plus their three failure handlers; maintenance jobs are forbidden')
    }
    let registration = inspectWorkerRegistry(null)
    const registryDeadline = Date.now() + 60_000
    while (Date.now() < registryDeadline) {
      try {
        const response = await local.post('http://127.0.0.1:8288/v0/gql', {
          data: { query: 'query QaLocalRegistry { apps { externalID url error functions { slug } } }' }, timeout: 5_000,
        })
        if (response.ok()) registration = inspectWorkerRegistry(await response.json())
      } catch { /* The keyless local server may still be starting. */ }
      if (registration.ready) break
      await delay(500)
    }
    await mkdir('qa-results', { recursive: true })
    await writeFile('qa-results/worker-registration.json', JSON.stringify(registration))
    console.log(JSON.stringify({ prerequisite: 'local-executor-registration', ...registration }))
    if (!registration.ready) throw new Error('The local executor must register exactly the isolated QA workers before browser journeys')
    const fixture = createQaFixture(QA_APP_ORIGIN)
    try {
      await fixture.seed()
      const cookie = fixture.cookies().map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join('; ')
      const session = await local.get('/api/auth/session', { headers: { cookie }, timeout: 60_000 })
      if (!session.ok() || (await session.json()).user?.id !== fixture.userId) {
        throw new Error('QA owned-session prerequisite failed; no browser journey may be reported as passed')
      }
      const project = await local.get(`/projects/${fixture.projectId}`, { headers: { cookie }, timeout: 90_000 })
      if (project.status() !== 200 || !(await project.text()).includes(fixture.projectName)) {
        throw new Error('QA authenticated data prerequisite failed; inspect application/server evidence')
      }
      console.log('QA prerequisites verified: isolated workers, owned session and tenant-scoped project rendering.')
    } finally { await fixture.cleanup() }
  } finally { await local.dispose() }
}
