import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { createClient } from '@/lib/supabase/server'
import { EntryActions } from './entry-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

type OverlayRow = {
  id: string
  title: string
  source: string | null
  embedding: unknown | null
  created_at: string
}

export default async function CompanyKnowledgePage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/?auth=login')
  const company = await getActiveCompany()
  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const { data } = await supabase
    .from('knowledge_entries')
    .select('id, title, source, embedding, created_at')
    .eq('scope', 'company')
    .eq('company_id', company.id) // explicit + RLS both scope it
    .order('created_at', { ascending: false })

  const entries = (data ?? []) as OverlayRow[]

  return (
    <div className="space-y-8 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
            <T>Knowledge base</T>
          </h1>
          <p className="text-sm text-muted-foreground">
            <T>
              Add your company&apos;s own knowledge the assistant draws from — your specific
              processes, prices, and guidance.
            </T>
          </p>
        </div>
        <Button asChild variant="primary">
          <Link href="/settings/knowledge/new">
            <T>New entry</T>
          </Link>
        </Button>
      </header>

      <Card variant="glass" className="p-0 overflow-hidden">
        {entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <T>No entries yet. Add your first knowledge entry.</T>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">
                  <T>Title</T>
                </th>
                <th className="px-4 py-3 font-medium">
                  <T>Source</T>
                </th>
                <th className="px-4 py-3 font-medium">
                  <T>Status</T>
                </th>
                <th className="px-4 py-3 font-medium">
                  <T>Created</T>
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <T>Actions</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-[var(--glass-border)] last:border-0 transition-colors hover:bg-[var(--glass-bg-light)]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/settings/knowledge/${entry.id}`}
                      className="font-medium hover:underline"
                    >
                      {entry.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{entry.source ?? '—'}</td>
                  <td className="px-4 py-3">
                    {entry.embedding == null ? (
                      <Badge
                        variant="secondary"
                        className="bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      >
                        <T>Needs reindex</T>
                      </Badge>
                    ) : (
                      <Badge variant="success">
                        <T>Indexed</T>
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(entry.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <EntryActions id={entry.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
