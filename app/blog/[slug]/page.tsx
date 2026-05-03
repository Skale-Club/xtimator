import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getBlogPost } from '@/lib/queries/blog'
import { BlogContent } from '@/components/blog/blog-content'

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
    <main className="mx-auto max-w-3xl px-6 py-16">
      <article>
        <header className="mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">{post.title}</h1>
          {post.published_at && (
            <time className="text-sm text-muted-foreground">
              {new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </time>
          )}
        </header>
        {post.cover_image_url && (
          <img src={post.cover_image_url} alt="" className="rounded-xl w-full mb-10 object-cover max-h-80" />
        )}
        <BlogContent markdown={post.content} />
      </article>
    </main>
  )
}
