import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { AdminList, type AdminRow } from './admin-list'
import { AddAdminDialog } from './add-admin-dialog'
import { Card } from '@/components/ui/card'

export default async function AdminAdminsPage() {
  const ctx = await requireAdmin()

  const svc = requireServiceClient()
  const { data: rows } = await svc
    .from('platform_admins')
    .select('user_id, created_at')
    .order('created_at', { ascending: true })

  const admins: AdminRow[] = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: u } = await svc.auth.admin.getUserById(row.user_id as string)
      return {
        user_id: row.user_id as string,
        email: u?.user?.email ?? '(unknown email)',
        created_at: row.created_at as string,
      }
    })
  )

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">Platform admins</h1>
          <p className="text-muted-foreground">
            Users who can access this admin panel. Admins can add and remove other
            admins.
          </p>
        </div>
        <AddAdminDialog />
      </div>

      <Card variant="glass" className="p-6 md:p-8">
        {admins.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            No admins found. Run the bootstrap SQL in supabase/ADMIN-BOOTSTRAP.md.
          </div>
        ) : (
          <AdminList admins={admins} currentUserId={ctx.userId} />
        )}
      </Card>
    </div>
  )
}
