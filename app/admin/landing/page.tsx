import { requireAdmin } from '@/lib/auth/admin-context'
import { getLandingContent } from '@/lib/platform-config'
import { LandingEditor } from './landing-editor'
import { Card } from '@/components/ui/card'

export const revalidate = 60

export default async function LandingAdminPage() {
  await requireAdmin()
  const content = await getLandingContent()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">Landing Page Content</h1>
        <p className="text-sm text-muted-foreground">Edit the text displayed on the public marketing page. Changes take effect immediately.</p>
      </div>
      <Card variant="glass" className="p-6 md:p-8">
        <LandingEditor initial={content} />
      </Card>
    </div>
  )
}
