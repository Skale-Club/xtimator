import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getLegalPage } from '@/lib/queries/legal-pages'
import { getBranding } from '@/lib/platform-config'
import { BlogContent } from '@/components/blog/blog-content'
import { Card } from '@/components/ui/card'
import { SiteShell } from '@/components/site/site-shell'

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const page = await getLegalPage('privacy_policy')
  return {
    title: page?.title ?? 'Privacy Policy',
    description: 'How we collect, use, and protect your information.',
  }
}

export default async function PrivacyPolicyPage() {
  const [page, branding] = await Promise.all([
    getLegalPage('privacy_policy'),
    getBranding(),
  ])
  if (!page) notFound()

  return (
    <SiteShell branding={{ appName: branding.appName, logoUrl: branding.logoUrl }}>
      <main className="mx-auto max-w-3xl px-6 py-[clamp(48px,10vw,96px)]">
        <article>
          <header className="mb-10">
            <h1 className="text-[clamp(40px,7vw,64px)] font-semibold leading-[1.05] tracking-[-0.025em] mb-4">
              {page.title}
            </h1>
            {page.effective_date && (
              <p className="text-sm text-muted-foreground">
                Effective date:{' '}
                <time dateTime={page.effective_date}>
                  {new Date(page.effective_date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
              </p>
            )}
          </header>
          <Card variant="glass" className="p-8 sm:p-10">
            <BlogContent markdown={page.content} />
          </Card>
        </article>
      </main>
    </SiteShell>
  )
}
