import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { AdminList, type AdminRow } from './admin-list'
import { AddAdminDialog } from './add-admin-dialog'

/**
 * /admin/admins — third Wave-3 admin page (ADMIN-03).
 *
 * Loads platform_admins joined to auth.users for email + created_at, and renders
 * the AdminList + AddAdminDialog. Belt-and-braces gate via requireAdmin() (R-05).
 *
 * Empty-state copy from UI-SPEC: "No admins found. Run the bootstrap SQL in
 * supabase/ADMIN-BOOTSTRAP.md." This is essentially impossible if the user is
 * here (they ARE an admin, so platform_admins contains at least them) but the
 * fallback is defensive.
 */
export default async function AdminAdminsPage() {
  const ctx = await requireAdmin()

  const svc = requireServiceClient()
  const { data: rows } = await svc
    .from('platform_admins')
    .select('user_id, created_at')
    .order('created_at', { ascending: true })

  // Fetch emails for these user ids via auth.admin.listUsers (filter then map).
  // The same pattern as actions.ts addPlatformAdmin — keeps the surface small.
  const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 })
  const emailById = new Map<string, string>()
  for (const u of list?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email)
  }

  const admins: AdminRow[] = (rows ?? []).map((row) => ({
    user_id: row.user_id as string,
    email: emailById.get(row.user_id as string) ?? '(unknown email)',
    created_at: row.created_at as string,
  }))

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Platform admins</h1>
          <p className="text-muted-foreground">
            Users who can access this admin panel. Admins can add and remove other
            admins.
          </p>
        </div>
        <AddAdminDialog />
      </div>

      {admins.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No admins found. Run the bootstrap SQL in supabase/ADMIN-BOOTSTRAP.md.
        </div>
      ) : (
        <AdminList admins={admins} currentUserId={ctx.userId} />
      )}
    </div>
  )
}
