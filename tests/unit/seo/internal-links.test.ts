import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const footer = readFileSync(resolve(root, 'components/landing/landing-footer.tsx'), 'utf8')
const blog = readFileSync(resolve(root, 'app/blog/page.tsx'), 'utf8')
const industryPage = readFileSync(resolve(root, 'app/industries/[slug]/page.tsx'), 'utf8')

describe('public internal links and semantics', () => {
  it('has no placeholder footer links and exposes content hubs', () => {
    expect(footer).not.toContain('href="#"')
    expect(footer).toContain('href="/blog"')
    expect(footer).toContain('href="/industries"')
  })

  it('gives blog images alt text and machine-readable dates', () => {
    expect(blog).toContain('alt={`Cover for ${post.title}`}')
    expect(blog).toContain('dateTime={post.published_at}')
  })

  it('links industry pages to conversion and the hub', () => {
    expect(industryPage).toContain('href="/?auth=signup"')
    expect(industryPage).toContain('href="/industries"')
  })
})
