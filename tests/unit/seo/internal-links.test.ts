import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const footer = readFileSync(resolve(root, 'components/landing/landing-footer.tsx'), 'utf8')
// A marcação do cartão de um post vive no componente partilhado desde que o
// índice, as etiquetas, os autores e os arquivos passaram a servi-la — quatro
// cópias seriam quatro sítios onde o alt ou a data podem desaparecer sem
// ninguém reparar. O invariante é o mesmo; o ficheiro é que mudou.
const blogCard = readFileSync(resolve(root, 'components/blog/post-list.tsx'), 'utf8')
const industryPage = readFileSync(resolve(root, 'app/industries/[slug]/page.tsx'), 'utf8')

describe('public internal links and semantics', () => {
  it('has no placeholder footer links and exposes content hubs', () => {
    expect(footer).not.toContain('href="#"')
    expect(footer).toContain('href="/blog"')
    expect(footer).toContain('href="/industries"')
  })

  it('gives blog images alt text and machine-readable dates', () => {
    expect(blogCard).toContain('alt={`Cover for ${post.title}`}')
    expect(blogCard).toContain('dateTime={post.published_at ?? undefined}')
  })

  it('links industry pages to conversion and the hub', () => {
    expect(industryPage).toContain('href="/?auth=signup"')
    expect(industryPage).toContain('href="/industries"')
  })
})
