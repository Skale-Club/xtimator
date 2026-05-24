import { redirect } from 'next/navigation'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { createClient } from '@/lib/supabase/server'
import { getPriceBookItems, getFolders } from '@/lib/queries/price-book'
import { PriceBookList } from '@/components/price-book/price-book-list'
import { UndoImportBanner } from '@/components/price-book/UndoImportBanner'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Price Book' }

export default async function PriceBookPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const company = await getCachedCompany(claims.sub as string)
  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const [items, folders] = await Promise.all([
    getPriceBookItems(supabase, company.id),
    getFolders(supabase, company.id),
  ])

  return (
    <div className="w-full max-w-none space-y-6 p-4 md:space-y-8 md:p-6">
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
