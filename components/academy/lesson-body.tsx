import type { ComponentProps, ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronRight, ExternalLink, Lightbulb } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { parseNotionMarkdown, type NotionNode } from '@/lib/academy/notion-markdown'

/**
 * Renders Notion markdown with the app's own typography. Notion's look
 * (colors, fonts) is ignored on purpose. Raw HTML is never rendered: the known
 * Notion tags were already turned into nodes by `parseNotionMarkdown`, and
 * react-markdown runs with `skipHtml` for everything else.
 *
 * No hooks - works as a server component and inside client trees alike.
 */

const REMARK_PLUGINS = [remarkGfm]

function isSafeHref(href: string | undefined): href is string {
  return !!href && /^(https?:|mailto:|tel:|\/|#)/i.test(href)
}

const markdownComponents: Components = {
  h1: (props) => <h2 className="mt-8 mb-3 text-2xl font-semibold tracking-tight first:mt-0" {...strip(props)} />,
  h2: (props) => <h2 className="mt-8 mb-3 text-xl font-semibold tracking-tight first:mt-0" {...strip(props)} />,
  h3: (props) => <h3 className="mt-6 mb-2 text-lg font-semibold first:mt-0" {...strip(props)} />,
  h4: (props) => <h4 className="mt-5 mb-2 text-base font-semibold first:mt-0" {...strip(props)} />,
  p: (props) => <p className="my-3 leading-7 text-foreground/90" {...strip(props)} />,
  ul: (props) => <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-muted-foreground" {...strip(props)} />,
  ol: (props) => <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:text-muted-foreground" {...strip(props)} />,
  li: (props) => <li className="leading-7 text-foreground/90" {...strip(props)} />,
  strong: (props) => <strong className="font-semibold text-foreground" {...strip(props)} />,
  hr: () => <hr className="my-8 border-border" />,
  blockquote: (props) => (
    <blockquote className="my-4 border-l-2 border-primary/60 pl-4 text-muted-foreground" {...strip(props)} />
  ),
  code: ({ className, children }) => (
    <code className={cn('rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]', className)}>{children}</code>
  ),
  pre: (props) => (
    <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-muted/50 p-4 text-sm [&_code]:bg-transparent [&_code]:p-0" {...strip(props)} />
  ),
  a: ({ href, children }) =>
    isSafeHref(href) ? (
      <a
        href={href}
        target={href.startsWith('/') || href.startsWith('#') ? undefined : '_blank'}
        rel="noopener noreferrer"
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ src, alt }) =>
    typeof src === 'string' ? (
      // eslint-disable-next-line @next/next/no-img-element -- Notion images are pre-signed external URLs; next/image would need per-host config.
      <img
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        className="my-5 h-auto max-w-full rounded-lg border border-border"
      />
    ) : null,
  table: (props) => (
    <div className="my-5 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" {...strip(props)} />
    </div>
  ),
  thead: (props) => <thead className="bg-muted/50" {...strip(props)} />,
  th: (props) => <th className="border-b border-border px-3 py-2 text-left font-semibold" {...strip(props)} />,
  td: (props) => <td className="border-b border-border px-3 py-2 align-top last:border-0" {...strip(props)} />,
}

/** react-markdown passes `node`; never forward it to the DOM. */
function strip<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const rest = { ...props }
  delete rest.node
  return rest
}

function Markdown({ text, inline = false }: { text: string; inline?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      skipHtml
      components={
        inline
          ? { ...markdownComponents, p: ({ children }: ComponentProps<'p'>) => <>{children}</> }
          : markdownComponents
      }
    >
      {text}
    </ReactMarkdown>
  )
}

function Nodes({ nodes }: { nodes: NotionNode[] }): ReactNode {
  return (
    <>
      {nodes.map((node, i) => (
        <NodeView key={i} node={node} />
      ))}
    </>
  )
}

function NodeView({ node }: { node: NotionNode }): ReactNode {
  switch (node.type) {
    case 'markdown':
      return <Markdown text={node.text} />

    case 'callout':
      return (
        <Alert className="my-5">
          {node.icon && node.icon.length <= 8 ? (
            <span aria-hidden className="text-base leading-none">
              {node.icon}
            </span>
          ) : (
            <Lightbulb aria-hidden />
          )}
          <AlertDescription className="text-foreground/90">
            <Nodes nodes={node.children} />
          </AlertDescription>
        </Alert>
      )

    case 'toggle': {
      const headingClass =
        node.headingLevel === 1
          ? 'text-2xl font-semibold tracking-tight'
          : node.headingLevel === 2
            ? 'text-xl font-semibold tracking-tight'
            : node.headingLevel === 3
              ? 'text-lg font-semibold'
              : 'text-base font-medium'
      return (
        <details className="group my-4 rounded-lg border border-border bg-card/40 px-4 py-1 open:pb-3">
          <summary
            className={cn(
              'flex cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden',
              headingClass,
            )}
          >
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
            />
            <span className="min-w-0">
              <Markdown text={node.summary} inline />
            </span>
          </summary>
          <div className="pl-6">
            <Nodes nodes={node.children} />
          </div>
        </details>
      )
    }

    case 'table': {
      const head = node.header ? (node.rows[0] ?? null) : null
      const body = node.header ? node.rows.slice(1) : node.rows
      return (
        <div className="my-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            {head && (
              <thead className="bg-muted/50">
                <tr>
                  {head.map((cell, c) => (
                    <th key={c} className="border-b border-border px-3 py-2 text-left font-semibold">
                      <Markdown text={cell} inline />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border-b border-border px-3 py-2 align-top last:border-b-0">
                      <Markdown text={cell} inline />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'video':
      return /^https:\/\//i.test(node.src) ? (
        <figure className="my-5">
          <video
            src={node.src}
            controls
            playsInline
            preload="metadata"
            className="h-auto max-w-full rounded-lg border border-border"
          />
          {node.caption && (
            <figcaption className="mt-2 text-sm text-muted-foreground">{node.caption}</figcaption>
          )}
        </figure>
      ) : null

    case 'embed':
      return /^https:\/\//i.test(node.src) ? (
        <p className="my-3">
          <a
            href={node.src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
          >
            {node.src}
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </p>
      ) : null
  }
}

export function LessonBody({ markdown, className }: { markdown: string; className?: string }) {
  const nodes = parseNotionMarkdown(markdown)
  if (nodes.length === 0) return null
  return (
    <div data-academy-body className={cn('text-base', className)}>
      <Nodes nodes={nodes} />
    </div>
  )
}
