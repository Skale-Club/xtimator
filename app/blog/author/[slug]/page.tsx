import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PostList } from '@/components/blog/post-list'
import { getBlogArchive, getBlogPostsByAuthor, getBlogTags } from '@/lib/queries/blog'
import { createPublicMetadata } from '@/lib/seo/metadata'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const posts = await getBlogPostsByAuthor(slug)
  if (posts.length === 0) return {}

  const name = posts[0]?.author_name ?? slug
  return createPublicMetadata({
    title: `Posts by ${name}`,
    description: `Everything ${name} has written.`,
    pathname: `/blog/author/${slug}`,
  })
}

export default async function BlogAuthorPage({ params }: Props) {
  const { slug } = await params

  const [posts, archive, tags] = await Promise.all([
    getBlogPostsByAuthor(slug),
    getBlogArchive(),
    getBlogTags(),
  ])
  // Sem posts é 404: um autor sem artigos não é uma página, é um URL inventado.
  if (posts.length === 0) notFound()

  const name = posts[0]?.author_name ?? slug
  return <PostList heading={`Posts by ${name}`} posts={posts} archive={archive} tags={tags} />
}
