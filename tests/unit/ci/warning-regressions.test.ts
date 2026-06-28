import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const walk = (directory: string): string[] =>
  readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    return entry.isDirectory() ? walk(path) : [path]
  })

describe('warning-free CI contracts', () => {
  it('pins every third-party GitHub Action to an immutable commit SHA', () => {
    const workflows = walk('.github/workflows').filter((file) => /\.ya?ml$/.test(file))
    const unpinned: string[] = []

    for (const workflow of workflows) {
      const lines = read(workflow).split(/\r?\n/)
      lines.forEach((line, index) => {
        const match = line.match(/^\s*uses:\s*(\S+)/)
        if (!match || match[1].startsWith('./')) return
        if (!/@[0-9a-f]{40}(?:\s|$)/i.test(match[1])) {
          unpinned.push(`${workflow}:${index + 1} ${match[1]}`)
        }
      })
    }

    expect(unpinned).toEqual([])
  })

  it('treats Dockerfile checks as errors without secret-name false positives', () => {
    const dockerfile = read('Dockerfile')

    expect(dockerfile).toContain('# syntax=docker/dockerfile:1.10')
    expect(dockerfile).toContain('# check=error=true')
    expect(dockerfile).not.toMatch(/^ARG NEXT_PUBLIC_.*(?:KEY|DSN)/m)
    expect(dockerfile).not.toMatch(/^ENV NEXT_PUBLIC_.*(?:KEY|DSN)/m)
  })

  it('uses current Next.js and Sentry conventions', () => {
    expect(existsSync(join(root, 'middleware.ts'))).toBe(false)
    expect(read('proxy.ts')).toMatch(/export async function proxy\(/)

    const nextConfig = read('next.config.ts')
    expect(nextConfig).not.toContain('disableLogger')
    expect(nextConfig).toContain('removeDebugLogging: true')
  })

  it('contains no deprecated single-argument revalidateTag calls', () => {
    const files = [
      ...walk('app'),
      ...walk('components'),
      ...walk('lib'),
    ].filter((file) => /\.tsx?$/.test(file))
    const deprecated = files.filter((file) => /\brevalidateTag\s*\(/.test(read(file)))

    expect(deprecated).toEqual([])
  })

  it('gives every dialog an accessible description', () => {
    const files = [
      ...walk('app'),
      ...walk('components'),
      ...walk('tests'),
    ].filter((file) => file.endsWith('.tsx') && file !== 'components/ui/dialog.tsx')

    const missing = files.flatMap((file) => {
      const source = read(file)
      const contents = source.match(/<DialogContent(?:\s|>)/g)?.length ?? 0
      const descriptions = source.match(/<DialogDescription(?:\s|>)/g)?.length ?? 0
      return descriptions < contents ? [`${file}: ${contents - descriptions} missing`] : []
    })

    expect(missing).toEqual([])
  })
})
