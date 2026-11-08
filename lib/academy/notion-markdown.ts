/**
 * Notion-flavored markdown -> a small node tree our own components render.
 *
 * Notion's `GET /v1/pages/:id/markdown` returns CommonMark plus a few custom
 * block tags (`<callout>`, `<details>`/`<summary>`, `<table>`, `<video>`,
 * `<embed/>`, `<unknown/>`) whose children are tab-indented. Feeding that to a
 * markdown renderer with raw HTML enabled would be both unsafe and wrong
 * (markdown inside an HTML block is not parsed), so we handle exactly the known
 * tags here and hand everything else to react-markdown with HTML disabled.
 *
 * Pure and dependency-free so it is unit-testable.
 */
export type NotionNode =
  | { type: 'markdown'; text: string }
  | { type: 'callout'; icon: string | null; children: NotionNode[] }
  | { type: 'toggle'; summary: string; headingLevel: 1 | 2 | 3 | null; children: NotionNode[] }
  | { type: 'table'; header: boolean; rows: string[][] }
  | { type: 'video'; src: string; caption: string }
  | { type: 'embed'; src: string }

type BlockTag = 'callout' | 'details' | 'table'

const BLOCK_OPEN_RE = /^<(callout|details|table)(\s[^>]*)?>(.*)$/
const FENCE_RE = /^\s*(```+|~~~+)/
const TOGGLE_HEADING_RE = /^(#{1,3})\s+(.*?)\s*\{[^}]*\btoggle="true"[^}]*\}\s*$/
const TRAILING_ATTRS_RE = /\s*\{(?:[a-z_-]+="[^"]*"\s*)+\}\s*$/
const SINGLE_TAG_LINE_RE = /^<\/?[A-Za-z][\w-]*(\s[^>]*)?\/?>$/

function attr(attrs: string | undefined, name: string): string | null {
  if (!attrs) return null
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)
  return m ? m[1] : null
}

function dedent(lines: string[]): string[] {
  return lines.map((l) => l.replace(/^(?:\t| {4})/, ''))
}

/** Per-line clean-up of Notion decorations that have no meaning in our design. */
export function cleanLine(line: string): string {
  return line
    .replace(TRAILING_ATTRS_RE, '')
    .replace(/<span\b[^>]*>([\s\S]*?)<\/span>/g, '$1')
    .replace(/<mention-[a-z-]+\b[^>]*\/>/g, '')
    .replace(/<mention-[a-z-]+\b[^>]*>([\s\S]*?)<\/mention-[a-z-]+>/g, '$1')
    .replace(/<br\s*\/?>/gi, '  \n')
}

function countMatches(line: string, re: RegExp): number {
  return (line.match(re) ?? []).length
}

/** Index of the line that closes the block opened at `start`, or -1. */
function findBlockEnd(lines: string[], start: number, tag: BlockTag): number {
  const openRe = new RegExp(`<${tag}(\\s[^>]*)?>`, 'g')
  const closeRe = new RegExp(`</${tag}>`, 'g')
  let depth = 0
  for (let k = start; k < lines.length; k++) {
    depth += countMatches(lines[k], openRe)
    depth -= countMatches(lines[k], closeRe)
    if (depth <= 0) return k
  }
  return -1
}

function parseTable(inner: string, attrs: string | undefined): NotionNode {
  const rows: string[][] = []
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g
  for (const row of inner.matchAll(rowRe)) {
    const cells: string[] = []
    for (const cell of row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)) {
      cells.push(
        cleanLine(cell[1])
          .split('\n')
          .map((l) => l.trim())
          .join('\n')
          .trim(),
      )
    }
    rows.push(cells)
  }
  return { type: 'table', header: attr(attrs, 'header-row') === 'true', rows }
}

function parseLines(lines: string[]): NotionNode[] {
  const nodes: NotionNode[] = []
  let buf: string[] = []
  let fence: string | null = null

  const flush = () => {
    // Collapse blank runs and trim leading/trailing blank LINES (not indentation).
    const text = buf
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^(?:[ \t]*\n)+/, '')
      .replace(/(?:\n[ \t]*)+$/, '')
    buf = []
    if (text.trim()) nodes.push({ type: 'markdown', text })
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Code fences are opaque: no tag or attribute handling inside them.
    const fenceMatch = FENCE_RE.exec(line)
    if (fence) {
      buf.push(line)
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null
      }
      i++
      continue
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      buf.push(line)
      i++
      continue
    }

    const trimmed = line.trim()

    // Known block tags with children.
    const open = BLOCK_OPEN_RE.exec(trimmed)
    if (open) {
      const tag = open[1] as BlockTag
      const end = findBlockEnd(lines, i, tag)
      if (end !== -1) {
        flush()
        const block = lines.slice(i, end + 1).join('\n')
        const inner = block
          .replace(new RegExp(`^\\s*<${tag}(\\s[^>]*)?>`), '')
          .replace(new RegExp(`</${tag}>\\s*$`), '')

        if (tag === 'callout') {
          nodes.push({
            type: 'callout',
            icon: attr(open[2], 'icon'),
            children: parseLines(dedent(inner.split('\n'))),
          })
        } else if (tag === 'details') {
          const summaryMatch = /^\s*<summary>([\s\S]*?)<\/summary>/.exec(inner)
          const rest = summaryMatch ? inner.slice(summaryMatch[0].length) : inner
          nodes.push({
            type: 'toggle',
            summary: cleanLine(summaryMatch ? summaryMatch[1].trim() : ''),
            headingLevel: null,
            children: parseLines(dedent(rest.split('\n'))),
          })
        } else {
          nodes.push(parseTable(inner, open[2]))
        }
        i = end + 1
        continue
      }
    }

    // Toggle headings: `## Title {toggle="true"}` with tab-indented children.
    const toggleHeading = TOGGLE_HEADING_RE.exec(line)
    if (toggleHeading) {
      flush()
      const children: string[] = []
      let j = i + 1
      while (j < lines.length) {
        if (/^(?:\t| {4})/.test(lines[j])) {
          children.push(lines[j])
          j++
        } else if (lines[j].trim() === '') {
          // A blank line belongs to the toggle only if indented content follows.
          let k = j
          while (k < lines.length && lines[k].trim() === '') k++
          if (k < lines.length && /^(?:\t| {4})/.test(lines[k])) {
            children.push('')
            j++
          } else break
        } else break
      }
      nodes.push({
        type: 'toggle',
        summary: cleanLine(toggleHeading[2]),
        headingLevel: toggleHeading[1].length as 1 | 2 | 3,
        children: parseLines(dedent(children)),
      })
      i = j
      continue
    }

    // Single-line media tags.
    const video = /^<video\b[^>]*\bsrc="([^"]+)"[^>]*>([\s\S]*?)<\/video>$/.exec(trimmed)
    if (video) {
      flush()
      nodes.push({ type: 'video', src: video[1], caption: cleanLine(video[2]).trim() })
      i++
      continue
    }
    const embed = /^<embed\b[^>]*\b(?:source|src|url)="([^"]+)"[^>]*\/?>$/.exec(trimmed)
    if (embed) {
      flush()
      nodes.push({ type: 'embed', src: embed[1] })
      i++
      continue
    }

    // Everything else that is a bare tag line (<unknown/>, <page/>, <database/>,
    // stray closers...) is dropped.
    if (SINGLE_TAG_LINE_RE.test(trimmed) || /^<unknown\b/.test(trimmed)) {
      i++
      continue
    }

    buf.push(cleanLine(line))
    i++
  }

  flush()
  return nodes
}

export function parseNotionMarkdown(source: string): NotionNode[] {
  if (!source) return []
  return parseLines(source.replace(/\r\n?/g, '\n').split('\n'))
}

/** Plain-text word count of a node tree (for the expected-time estimate). */
export function wordCountOfNodes(nodes: NotionNode[]): number {
  let total = 0
  const countText = (text: string) => {
    const t = text.replace(/[#*_`>|\-[\]()!]/g, ' ').trim()
    return t ? t.split(/\s+/).length : 0
  }
  for (const node of nodes) {
    switch (node.type) {
      case 'markdown':
        total += countText(node.text)
        break
      case 'callout':
        total += wordCountOfNodes(node.children)
        break
      case 'toggle':
        total += countText(node.summary) + wordCountOfNodes(node.children)
        break
      case 'table':
        total += node.rows.reduce((sum, row) => sum + row.reduce((s, c) => s + countText(c), 0), 0)
        break
      default:
        break
    }
  }
  return total
}
