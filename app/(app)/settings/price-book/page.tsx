import { redirect } from 'next/navigation'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { createClient } from '@/lib/supabase/server'
import { getPriceBookItems } from '@/lib/queries/price-book'
import { PriceBookList } from '@/components/price-book/price-book-list'

export const metadata = { title: 'Price Book' }

export default async function PriceBookPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const company = await getCachedCompany(claims.sub as string)
  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const items = await getPriceBookItems(supabase, company.id)

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Price Book</h1>
        {items.length > 0 && (
          <p className="text-sm text-muted-foreground">
            The AI uses your listed prices as anchors when generating estimates.
            Leaving items out is fine &mdash; it falls back to market estimates.
          </p>
        )}
      </div>
      <PriceBookList items={items} companyId={company.id} />
    </div>
  )
}
