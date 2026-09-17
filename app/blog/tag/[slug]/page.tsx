import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PostList } from '@/components/blog/post-list'
import { getBlogArchive, getBlogPostsByTag, getBlogTags } from '@/lib/queries/blog'
import { createPublicMetadata } from '@/lib/seo/metadata'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

async function findTag(slug: string) {
  return (await getBlogTags()).find((tag) => tag.slug === slug) ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const tag = await findTag(slug)
  if (!tag) return {}

  return createPublicMetadata({
    title: tag.name,
    description: `Posts about ${tag.name}.`,
    pathname: `/blog/tag/${slug}`,
  })
}

export default async function BlogTagPage({ params }: Props) {
  const { slug } = await params

  // Uma etiqueta que não existe é 404, não uma listagem vazia: senão qualquer
  // palavra escrita no URL passa a ser uma página indexável sem nada dentro.
  const tag = await findTag(slug)
  if (!tag) notFound()

  const [posts, archive, tags] = await Promise.all([
    getBlogPostsByTag(slug),
    getBlogArchive(),
    getBlogTags(),
  ])
  if (posts.length === 0) notFound()

  return <PostList heading={`#${tag.name}`} posts={posts} archive={archive} tags={tags} />
}
