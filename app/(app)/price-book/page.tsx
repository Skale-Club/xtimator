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
  if (!claims) redirect('/login')

  const company = await getCachedCompany(claims.sub as string)
  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const [items, folders] = await Promise.all([
    getPriceBookItems(supabase, company.id),
    getFolders(supabase, company.id),
  ])

  return (
    <div className="w-full max-w-none space-y-8 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Price Book</T>
        </h1>
        {items.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <T>The AI uses your listed prices as anchors when generating estimates. Leaving items out is fine — it falls back to market estimates.</T>
          </p>
        )}
      </header>
      <UndoImportBanner />
      <Card variant="glass" className="p-6 md:p-8">
        <PriceBookList items={items} folders={folders} companyId={company.id} />
      </Card>
    </div>
  )
}
