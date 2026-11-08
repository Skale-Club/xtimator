import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { cleanLine, parseNotionMarkdown, wordCountOfNodes } from '@/lib/academy/notion-markdown'
import { LessonBody } from '@/components/academy/lesson-body'
import { createFixtureSource, FIXTURE_LESSON_IDS } from '@/lib/academy/fixture-source'

describe('parseNotionMarkdown', () => {
  it('returns plain markdown as one node', () => {
    expect(parseNotionMarkdown('# Title\n\nSome **text**.')).toEqual([
      { type: 'markdown', text: '# Title\n\nSome **text**.' },
    ])
  })

  it('maps a callout with tab-indented children', () => {
    const nodes = parseNotionMarkdown('Before\n<callout icon="💡" color="gray_bg">\n\tA **tip**\n</callout>\nAfter')
    expect(nodes).toHaveLength(3)
    expect(nodes[1]).toEqual({
      type: 'callout',
      icon: '💡',
      children: [{ type: 'markdown', text: 'A **tip**' }],
    })
  })

  it('maps <details>/<summary> to a toggle', () => {
    const nodes = parseNotionMarkdown('<details>\n<summary>More</summary>\n\tHidden text\n</details>')
    expect(nodes).toEqual([
      {
        type: 'toggle',
        summary: 'More',
        headingLevel: null,
        children: [{ type: 'markdown', text: 'Hidden text' }],
      },
    ])
  })

  it('maps toggle headings with indented children', () => {
    const nodes = parseNotionMarkdown('## Advanced {toggle="true"}\n\tInside\n\nOutside')
    expect(nodes[0]).toMatchObject({ type: 'toggle', summary: 'Advanced', headingLevel: 2 })
    expect(nodes[0]).toMatchObject({ children: [{ type: 'markdown', text: 'Inside' }] })
    expect(nodes[1]).toEqual({ type: 'markdown', text: 'Outside' })
  })

  it('maps a table with a header row', () => {
    const nodes = parseNotionMarkdown(
      '<table header-row="true">\n<tr>\n<td>A</td>\n<td>B</td>\n</tr>\n<tr>\n<td>1</td>\n<td>**2**</td>\n</tr>\n</table>',
    )
    expect(nodes).toEqual([
      { type: 'table', header: true, rows: [['A', 'B'], ['1', '**2**']] },
    ])
  })

  it('handles nested callouts and toggles inside callouts', () => {
    const nodes = parseNotionMarkdown(
      '<callout icon="x">\n\t<details>\n\t<summary>S</summary>\n\t\tdeep\n\t</details>\n</callout>',
    )
    expect(nodes[0]).toMatchObject({
      type: 'callout',
      children: [{ type: 'toggle', summary: 'S', children: [{ type: 'markdown', text: 'deep' }] }],
    })
  })

  it('drops <unknown/> and other bare tag lines', () => {
    const nodes = parseNotionMarkdown('Hello\n<unknown url="https://notion.so/x" alt="synced_block"/>\n<page url="https://notion.so/y">Sub</page>\nWorld')
    const text = nodes.map((n) => (n.type === 'markdown' ? n.text : '')).join('')
    expect(text).toContain('Hello')
    expect(text).toContain('World')
    expect(text).not.toContain('unknown')
    expect(nodes.every((n) => n.type === 'markdown')).toBe(true)
  })

  it('maps <video> and <embed/>', () => {
    const nodes = parseNotionMarkdown('<video src="https://example.com/a.mp4">Caption</video>\n<embed source="https://example.com/x"/>')
    expect(nodes).toEqual([
      { type: 'video', src: 'https://example.com/a.mp4', caption: 'Caption' },
      { type: 'embed', src: 'https://example.com/x' },
    ])
  })

  it('leaves tags inside code fences untouched', () => {
    const md = '```html\n<callout icon="x">\n\tnot a callout\n</callout>\n```'
    const nodes = parseNotionMarkdown(md)
    expect(nodes).toEqual([{ type: 'markdown', text: md }])
  })

  it('strips Notion color/attribute decorations and color spans', () => {
    expect(cleanLine('A paragraph {color="red"}')).toBe('A paragraph')
    expect(cleanLine('Some <span color="blue">blue</span> text')).toBe('Some blue text')
    expect(cleanLine('Ping <mention-user url="x">@Ana</mention-user>')).toBe('Ping @Ana')
  })

  it('counts words across nested nodes', () => {
    const nodes = parseNotionMarkdown('one two\n<callout>\n\tthree four five\n</callout>')
    expect(wordCountOfNodes(nodes)).toBe(5)
  })
})

describe('LessonBody rendering (Notion tags -> app components)', () => {
  it('renders the fixture text lesson with callout, toggle, list, table and image', async () => {
    const md = await createFixtureSource().getLessonMarkdown(FIXTURE_LESSON_IDS.text)
    const html = renderToStaticMarkup(createElement(LessonBody, { markdown: md }))

    expect(html).toContain('role="alert"') // callout -> app Alert
    expect(html).toContain('<details') // toggle
    expect(html).toContain('<summary')
    expect(html).toContain('<ul') // list
    expect(html).toContain('<ol')
    expect(html).toContain('<table') // table with app table styles
    expect(html).toContain('<th')
    expect(html).toContain('<img') // image
    expect(html).not.toContain('&lt;callout') // Notion tags never leak as text
  })

  it('never renders raw HTML or script tags from content', () => {
    const html = renderToStaticMarkup(
      createElement(LessonBody, {
        markdown: 'Hi <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))',
      }),
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
  })

  it('renders nothing for an empty body', () => {
    expect(renderToStaticMarkup(createElement(LessonBody, { markdown: '' }))).toBe('')
  })
})
