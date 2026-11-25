/** Stable synthetic development content. This module has no I/O or credentials. */
const marker = 'Xtimator QA managed content v1'

export const qaBlogAuthor = { name: 'Xtimator QA Fixture Author', slug: 'xtimator-qa-fixture-author' } as const
export const qaBlogTag = 'qa-fixture-primary'
export const qaBlogArticleMarker = 'Synthetic verification article. No customer, provider, or production data.'

const basePost = {
  cover_image_url: null,
  meta_title: null,
  meta_description: null,
  focus_keyword: null,
  reading_time_minutes: null,
  ai_generated: false,
} as const

export const qaBlogPrimary = {
  ...basePost,
  id: 'a5b11996-e962-538d-8743-d8f4d726e001',
  slug: 'xtimator-qa-fixture-primary',
  title: `${marker} — Primary article`,
  excerpt: `${marker} — Primary summary`,
  content: `${qaBlogArticleMarker}\n\n[${qaBlogAuthor.name}](/blog/author/${qaBlogAuthor.slug})`,
  tags: qaBlogTag,
  author_name: qaBlogAuthor.name,
  status: 'published',
  published_at: '2026-10-13T12:00:00.000Z',
} as const

export const qaBlogComparison = {
  ...basePost,
  id: 'a5b11996-e962-538d-8743-d8f4d726e002',
  slug: 'xtimator-qa-fixture-comparison',
  title: `${marker} — Comparison article`,
  excerpt: `${marker} — Comparison summary`,
  content: 'Synthetic comparison article in another author, tag, and archive period.',
  tags: 'qa-fixture-comparison',
  author_name: 'Xtimator QA Comparison Author',
  status: 'published',
  published_at: '2025-06-11T12:00:00.000Z',
} as const

export const qaBlogDraft = {
  ...basePost,
  id: 'a5b11996-e962-538d-8743-d8f4d726e003',
  slug: 'xtimator-qa-fixture-unpublished',
  title: `${marker} — Unpublished comparison`,
  excerpt: `${marker} — Unpublished summary`,
  content: 'Synthetic draft excluded from anonymous published content.',
  tags: qaBlogTag,
  author_name: qaBlogAuthor.name,
  status: 'draft',
  published_at: '2026-10-12T12:00:00.000Z',
} as const

export const qaBlogOtherMonth = {
  ...basePost,
  id: 'a5b11996-e962-538d-8743-d8f4d726e004',
  slug: 'xtimator-qa-fixture-other-month',
  title: `${marker} — Other-month comparison`,
  excerpt: `${marker} — Same-year alternate-month summary`,
  content: 'Synthetic article in the primary year but outside the primary month.',
  tags: 'qa-fixture-other-month',
  author_name: 'Xtimator QA Other Month Author',
  status: 'published',
  published_at: '2026-09-11T12:00:00.000Z',
} as const

export const qaManagedPosts = [qaBlogPrimary, qaBlogComparison, qaBlogDraft, qaBlogOtherMonth] as const
