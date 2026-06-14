import { createServiceClient } from '@/lib/supabase/service'
import { getDemoCompanyId } from '@/lib/demo/config'
import { getPriceBookItems, getFolders, type PriceBookItem } from '@/lib/queries/price-book'
import { PageHeading } from '@/components/app-shell/page-heading'
import { formatMoney } from '@/lib/money/currency'

export const dynamic = 'force-dynamic'

export default async function DemoPriceBookPage() {
  const supabase = createServiceClient()
  if (!supabase) {
    return <p className="p-6 text-sm text-muted-foreground">Demo is not configured.</p>
  }

  const companyId = getDemoCompanyId()
  const [items, folders] = await Promise.all([
    getPriceBookItems(supabase, companyId),
    getFolders(supabase, companyId),
  ])

  // Group items by folder; preserve folder sort order, ungrouped last.
  const byFolder = new Map<string | null, PriceBookItem[]>()
  for (const it of items) {
    const key = it.folder_id
    if (!byFolder.has(key)) byFolder.set(key, [])
    byFolder.get(key)!.push(it)
  }

  const groups: { name: string; items: PriceBookItem[] }[] = []
  for (const folder of folders) {
    const group = byFolder.get(folder.id)
    if (group?.length) groups.push({ name: folder.name, items: group })
  }
  const ungrouped = byFolder.get(null)
  if (ungrouped?.length) groups.push({ name: 'Other', items: ungrouped })

  return (
    <div className="space-y-6 p-6">
      <PageHeading>Price Book</PageHeading>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No price book items yet.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.name}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.name}
              </h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {group.items.map((it) => (
                      <tr key={it.id} className="border-t border-border first:border-t-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{it.name}</div>
                          {it.notes && (
                            <div className="text-xs text-muted-foreground">{it.notes}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {formatMoney(it.unit_price, it.currency_code ?? 'USD')}
                          {it.unit ? (
                            <span className="text-muted-foreground"> / {it.unit}</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
