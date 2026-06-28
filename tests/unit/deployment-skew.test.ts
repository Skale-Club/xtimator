import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..', '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('self-hosted deployment skew protection', () => {
  it('threads the immutable Git SHA into the Next.js deploymentId', () => {
    expect(read('next.config.ts')).toContain(
      'deploymentId: deploymentId || undefined',
    )
    expect(read('Dockerfile')).toContain('ARG DEPLOYMENT_VERSION')
    expect(read('.github/workflows/build-deploy.yml')).toContain(
      'DEPLOYMENT_VERSION=${{ github.sha }}',
    )
  })

  it('opts out of browser DOM translation because Xtimator owns i18n', () => {
    const layout = read('app/layout.tsx')
    expect(layout).toContain('translate="no"')
    expect(layout).toContain('<meta name="google" content="notranslate" />')
  })
})
