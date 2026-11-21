import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { createClient } from '@/lib/supabase/server'
import { getPriceBookItems, getFolders } from '@/lib/queries/price-book'
import { seedIndustryPriceBook } from '@/lib/price-book-seed'
import { PriceBookList } from '@/components/price-book/price-book-list'
import { UndoImportBanner } from '@/components/price-book/UndoImportBanner'

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

  // No ListPage card: the list draws its own panel on desktop and goes flat,
  // full width, on a phone. On md+ the wrapper is as tall as <main> and the
  // panel fills it, so only the services column scrolls. md:pb-0: main's own
  // md:pb-6 is the gap under the card, the same 24px as the sides.
  return (
    <div className="w-full space-y-4 p-4 sm:p-6 md:flex md:h-full md:flex-col md:gap-4 md:space-y-0 md:pb-0">
      <div className="empty:hidden md:shrink-0">
        <UndoImportBanner />
      </div>
      <PriceBookList
        items={items}
        folders={folders}
        currencyCode={company.currency_code}
      />
    </div>
  )
}
