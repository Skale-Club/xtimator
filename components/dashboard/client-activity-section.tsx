import { createClient } from '@/lib/supabase/server'
import { getClientActivity } from '@/lib/queries/client-activity'
import { ClientActivityCard } from '@/components/dashboard/client-activity-card'
import { ListCard } from '@/components/ui/list-page'

/** Server wrapper for the dashboard "Client activity" card (mounted inside a Suspense). */
export async function ClientActivitySection({ companyId }: { companyId: string }) {
  const supabase = await createClient()
  const rows = await getClientActivity(supabase, companyId, 30)
  return (
    <ListCard>
      <ClientActivityCard rows={rows} />
    </ListCard>
  )
}
