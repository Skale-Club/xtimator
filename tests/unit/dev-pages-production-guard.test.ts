import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

function pages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return pages(p)
    return e.name === 'page.tsx' ? [p] : []
  })
}

describe('app/dev pages', () => {
  const root = path.resolve(__dirname, '../..')
  for (const file of pages(path.join(root, 'app/dev'))) {
    it(`${path.relative(root, file)} 404s in production`, () => {
      const src = fs.readFileSync(file, 'utf8')
      expect(src).toMatch(/process\.env\.NODE_ENV\s*(===|!==)\s*'(production|development)'\)\s*notFound\(\)/)
    })
  }
})
