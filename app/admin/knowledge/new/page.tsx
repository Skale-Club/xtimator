import { requireAdmin } from '@/lib/auth/admin-context'
import { EntryFormWrapper } from '../entry-form-wrapper'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

export default async function NewKnowledgeEntryPage() {
  await requireAdmin()
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
        <T>New knowledge entry</T>
      </h1>
      <Card variant="glass" className="p-6 md:p-8">
        <EntryFormWrapper />
      </Card>
    </div>
  )
}
