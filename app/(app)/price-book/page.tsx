import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { createClient } from '@/lib/supabase/server'
import { getPriceBookItems, getFolders } from '@/lib/queries/price-book'
import { seedIndustryPriceBook } from '@/lib/price-book-seed'
import { PriceBookList } from '@/components/price-book/price-book-list'
import { UndoImportBanner } from '@/components/price-book/UndoImportBanner'
import { PageHeading } from '@/components/app-shell/page-heading'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Price Book' }

export default async function PriceBookPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const company = await getActiveCompany()
  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  let [items, folders] = await Promise.all([
    getPriceBookItems(supabase, company.id),
    getFolders(supabase, company.id),
  ])

  // Backfill industry-specific market defaults for accounts created before the
  // price-book seeding existed. No-ops if items already exist, the industry is
  // unsupported (e.g. "Other"), or no industry was chosen during onboarding.
  if (items.length === 0 && company.industry) {
    await seedIndustryPriceBook(supabase, company.id, company.industry, company.currency_code)
    ;[items, folders] = await Promise.all([
      getPriceBookItems(supabase, company.id),
      getFolders(supabase, company.id),
    ])
  }

  return (
    <div className="w-full max-w-none space-y-6 p-4 md:space-y-8 md:p-6">
      <PageHeading><T>Price Book</T></PageHeading>
      {items.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <T>The AI uses your listed prices as anchors when generating estimates. Leaving items out is fine | it falls back to market estimates.</T>
        </p>
      )}
      <UndoImportBanner />
      <Card variant="glass" className="p-4 md:p-8">
        <PriceBookList
          items={items}
          folders={folders}
          currencyCode={company.currency_code}
        />
      </Card>
    </div>
  )
}
