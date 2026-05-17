import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getBlogPost } from '@/lib/queries/blog'
import { BlogContent } from '@/components/blog/blog-content'
import { Card } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getBlogPost(slug)
  if (!post) return { title: 'Post Not Found' }
  return {
    title: post.meta_title ?? post.title,
    description: post.meta_description ?? post.excerpt ?? undefined,
    openGraph: {
      type: 'article',
      publishedTime: post.published_at ?? undefined,
      images: post.cover_image_url ? [post.cover_image_url] : [],
    },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getBlogPost(slug)
  if (!post) notFound()
  return (
    <div className="relative isolate min-h-screen">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] gradient-hero" />
      <main className="mx-auto max-w-3xl px-6 py-[clamp(48px,10vw,96px)]">
        <article>
          <header className="mb-10">
            <h1 className="text-[clamp(40px,7vw,64px)] font-semibold leading-[1.05] tracking-[-0.025em] mb-4">
              {post.title}
            </h1>
            {post.published_at && (
              <time className="text-sm text-muted-foreground">
                {new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </time>
            )}
          </header>
          {post.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.cover_image_url} alt="" className="rounded-2xl w-full mb-10 object-cover max-h-80 border border-[var(--glass-border)] shadow-glass" />
          )}
          <Card variant="glass" className="p-8 sm:p-10">
            <BlogContent markdown={post.content} />
          </Card>
        </article>
      </main>
    </div>
  )
}
