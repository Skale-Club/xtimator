import { requireAdmin } from '@/lib/auth/admin-context'
import { getLandingContent } from '@/lib/platform-config'
import { LandingEditor } from './landing-editor'

export const dynamic = 'force-dynamic'

export default async function LandingAdminPage() {
  await requireAdmin()
  const content = await getLandingContent()
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Landing Page Content</h1>
        <p className="text-sm text-muted-foreground">Edit the text displayed on the public marketing page. Changes take effect immediately.</p>
      </div>
      <LandingEditor initial={content} />
    </div>
  )
}
