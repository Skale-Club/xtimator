import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIndustryLabel } from '@/lib/industries'
import { EntryActions } from './entry-actions'
import { ImportCard } from './import-card'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { T } from '@/components/i18n/t'

export const dynamic = 'force-dynamic'

type KnowledgeRow = {
  id: string
  industry_id: string
  title: string
  source: string | null
  embedding: unknown | null
  created_at: string
}

export default async function AdminKnowledgePage() {
  await requireAdmin()
  const svc = requireServiceClient()
  const { data } = await svc
    .from('knowledge_entries')
    .select('id, industry_id, title, source, embedding, created_at')
    .eq('scope', 'industry')
    .order('created_at', { ascending: false })

  const entries = (data ?? []) as KnowledgeRow[]

  // Group rows under their industry label (curator works one industry at a time).
  const groups = new Map<string, KnowledgeRow[]>()
  for (const entry of entries) {
    const list = groups.get(entry.industry_id) ?? []
    list.push(entry)
    groups.set(entry.industry_id, list)
  }
  const groupedKeys = [...groups.keys()].sort((a, b) =>
    getIndustryLabel(a).localeCompare(getIndustryLabel(b))
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
            <T>Industry knowledge base</T>
          </h1>
          <p className="text-sm text-muted-foreground">
            <T>Curate per-industry knowledge entries the conversational assistant draws from.</T>
          </p>
        </div>
        <Button asChild variant="primary">
          <Link href="/admin/knowledge/new">
            <T>New entry</T>
          </Link>
        </Button>
      </div>

      <ImportCard />

      <Card variant="glass" className="p-0 overflow-hidden">
        {entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <T>No entries yet. Create your first industry KB entry.</T>
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
              {groupedKeys.map((industryId) => (
                <KnowledgeIndustryGroup
                  key={industryId}
                  industryId={industryId}
                  rows={groups.get(industryId)!}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function KnowledgeIndustryGroup({
  industryId,
  rows,
}: {
  industryId: string
  rows: KnowledgeRow[]
}) {
  return (
    <>
      <tr className="bg-[var(--glass-bg-light)] border-b border-[var(--glass-border)]">
        <td colSpan={5} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {getIndustryLabel(industryId)} ({rows.length})
        </td>
      </tr>
      {rows.map((entry) => (
        <tr
          key={entry.id}
          className="border-b border-[var(--glass-border)] last:border-0 transition-colors hover:bg-[var(--glass-bg-light)]"
        >
          <td className="px-4 py-3">
            <Link href={`/admin/knowledge/${entry.id}`} className="font-medium hover:underline">
              {entry.title}
            </Link>
          </td>
          <td className="px-4 py-3 text-muted-foreground">{entry.source ?? '—'}</td>
          <td className="px-4 py-3">
            {entry.embedding == null ? (
              <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
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
    </>
  )
}
