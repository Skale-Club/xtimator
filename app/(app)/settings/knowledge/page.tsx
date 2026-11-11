import { BookOpen, Plus } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { isDemoCompany } from '@/lib/demo/config'
import { createClient } from '@/lib/supabase/server'
import { EntryActions } from './entry-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { T } from '@/components/i18n/t'
import { SettingsHeader } from '@/components/settings/settings-ui'

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
  if (isDemoCompany(company.id)) redirect('/settings/company')

  const supabase = await createClient()
  const { data } = await supabase
    .from('knowledge_entries')
    .select('id, title, source, embedding, created_at')
    .eq('scope', 'company')
    .eq('company_id', company.id) // explicit + RLS both scope it
    .order('created_at', { ascending: false })

  const entries = (data ?? []) as OverlayRow[]

  return (
    <div className="space-y-6">
      <SettingsHeader
        title={<T>AI knowledge</T>}
        description={<T>Your own processes, prices and guidance. The AI reads these when it writes your estimates.</T>}
        actions={
          <Button asChild variant="primary">
            <Link href="/settings/knowledge/new">
              <Plus className="h-4 w-4" />
              <T>New entry</T>
            </Link>
          </Button>
        }
      />

      <Card variant="glass" className="p-0 overflow-hidden">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <p className="text-base font-semibold">
              <T>Teach the AI how your business works</T>
            </p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              <T>Add the details a new estimator would need: how you price jobs, what you always include, what you never do.</T>
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link href="/settings/knowledge/new">
                <Plus className="h-4 w-4" />
                <T>Add your first entry</T>
              </Link>
            </Button>
          </div>
        ) : (
          // Phones: Source and Created are hidden (hidden sm:table-cell) so the
          // table fits; overflow-x-auto is the safety net for long titles.
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">
                  <T>Title</T>
                </th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  <T>Source</T>
                </th>
                <th className="px-4 py-3 font-medium">
                  <T>Status</T>
                </th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
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
                  <td className="min-w-0 break-words px-4 py-3">
                    <Link
                      href={`/settings/knowledge/${entry.id}`}
                      className="font-medium hover:underline"
                    >
                      {entry.title}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{entry.source ?? '—'}</td>
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
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
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
          </div>
        )}
      </Card>
    </div>
  )
}
