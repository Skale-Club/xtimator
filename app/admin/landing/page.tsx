import { requireAdmin } from '@/lib/auth/admin-context'
import { getLandingContent } from '@/lib/platform-config'
import { LandingEditor } from './landing-editor'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'

export const revalidate = 60

export default async function LandingAdminPage() {
  await requireAdmin()
  const content = await getLandingContent()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight"><T>Landing Page Content</T></h1>
        <p className="text-sm text-muted-foreground"><T>Edit the text displayed on the public marketing page. Changes take effect immediately.</T></p>
      </div>
      <Card variant="glass" className="p-6 md:p-8">
        <LandingEditor initial={content} />
      </Card>
    </div>
  )
}
