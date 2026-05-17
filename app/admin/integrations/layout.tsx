import { requireAdmin } from '@/lib/auth/admin-context'
import { CATEGORIES } from '@/lib/admin/integrations-providers'
import { Card } from '@/components/ui/card'
import { IntegrationsNav } from './integrations-nav'

/**
 * Shared shell for /admin/integrations/* — page header, nav (Link-based, one URL
 * per category), and a glass card frame around the child page content.
 *
 * Each child renders the cards for ONE category (and, in the AI category, the
 * active-provider selector).
 */
export default async function IntegrationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdmin()

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Manage API keys for services shared across all tenants. Changes take effect within 60 seconds.
        </p>
      </div>
      <Card variant="glass" className="p-6 md:p-8">
        <IntegrationsNav
          categories={CATEGORIES.map((c) => ({
            slug: c.slug,
            title: c.title,
            navLabel: c.navLabel,
          }))}
        />
        <div className="mt-6">{children}</div>
      </Card>
    </div>
  )
}
