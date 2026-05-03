import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function BlogContent({ markdown }: { markdown: string }) {
  return (
    <article className="prose prose-invert max-w-none">
      <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
    </article>
  )
}
