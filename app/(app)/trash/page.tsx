import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { createClient } from '@/lib/supabase/server'
import { getDeletedPriceBookItems } from '@/lib/queries/price-book'
import { TrashList } from '@/components/trash/trash-list'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'Trash' }

// Quick-260718-t7d — recently deleted price book items. Rows stay here until
// restored or permanently deleted (individually or via Empty Trash).
export default async function TrashPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')

  const company = await getActiveCompany()
  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const items = await getDeletedPriceBookItems(supabase, company.id)

  return (
    <div className="w-full max-w-none space-y-4 p-4 md:p-6">
      <Card variant="glass" className="p-4 md:p-6">
        <TrashList items={items} />
      </Card>
    </div>
  )
}
