'use client'

import { Fragment, useMemo, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useTranslation } from '@/lib/i18n/use-translation'
import { parseAiMeta, parseAiMetaInternal } from '@/lib/estimate/ai-meta'
import { AiInsightsSections } from './ai-insights-panel'

// Platform-admin-only debug tool: everything the AI recorded about an estimate
// (what it assumed, what it could not decide, how its prices were resolved).
// The editor only mounts this when the server said the viewer is a platform
// admin; for everyone else ai_meta is stripped before it reaches the browser.

export interface EstimateDebugTarget {
  id: string
  version: number
  project_id: string
  company_id: string
  ai_meta?: unknown
}

interface EstimateDebugDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  estimate: EstimateDebugTarget
  projectId: string
}

const MAX_FINDINGS = 20

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? ''
  } catch {
    return ''
  }
}

function Section({ title, testId, children }: { title: string; testId?: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="text-xs">{children}</div>
    </section>
  )
}

export function EstimateDebugDialog({ open, onOpenChange, estimate, projectId }: EstimateDebugDialogProps) {
  const { t } = useTranslation()
  const meta = useMemo(() => parseAiMeta(estimate.ai_meta), [estimate.ai_meta])
  const internal = useMemo(() => parseAiMetaInternal(estimate.ai_meta), [estimate.ai_meta])
  const hasRecord = estimate.ai_meta != null
  const research = internal?.pricing?.research
  const changes = internal?.pricing?.changes ?? []
  const diagnostics = internal?.pricing?.diagnostics
  const hasNotes =
    !!meta &&
    ((meta.assumptions?.length ?? 0) > 0 ||
      (meta.exclusions?.length ?? 0) > 0 ||
      (meta.open_questions?.length ?? 0) > 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid="estimate-debug-dialog">
        <SheetHeader>
          <SheetTitle>{t('Estimate debug')}</SheetTitle>
          <SheetDescription className="sr-only">
            {t('Internal AI record for this estimate. Visible to platform admins only.')}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6 text-sm">
          <Section title={t('Ids')} testId="debug-ids">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
              <dt className="text-muted-foreground">estimate</dt>
              <dd className="break-all">{estimate.id}</dd>
              <dt className="text-muted-foreground">version</dt>
              <dd>{estimate.version}</dd>
              <dt className="text-muted-foreground">project</dt>
              <dd className="break-all">{estimate.project_id || projectId}</dd>
              <dt className="text-muted-foreground">company</dt>
              <dd className="break-all">{estimate.company_id}</dd>
            </dl>
          </Section>

          {!hasRecord && (
            <p className="text-xs text-muted-foreground" data-testid="debug-no-record">
              {t('No AI record for this estimate.')}
            </p>
          )}

          {meta?.quality && (
            <Section title={t('AI review')} testId="debug-quality">
              <p>
                <span className="font-medium">{meta.quality.band}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {t('score')} {meta.quality.score}
                </span>
              </p>
              {meta.quality.findings.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {meta.quality.findings.slice(0, MAX_FINDINGS).map((finding) => (
                    <li key={finding}>{finding}</li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {hasNotes && (
            <div className="text-xs">
              <AiInsightsSections meta={meta} projectId={projectId} onNavigate={() => onOpenChange(false)} />
            </div>
          )}

          {internal?.source_notes && (
            <Section title={t('Source notes')} testId="debug-source-notes">
              <ul className="list-disc space-y-0.5 pl-5">
                {internal.source_notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Section>
          )}

          {internal?.pricing && (
            <Section title={t('Pricing')} testId="debug-pricing">
              {research && (
                <dl
                  className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono"
                  data-testid="debug-pricing-research"
                >
                  <dt className="text-muted-foreground">candidates</dt>
                  <dd>{research.candidates}</dd>
                  <dt className="text-muted-foreground">cache hits</dt>
                  <dd>{research.cacheHits}</dd>
                  <dt className="text-muted-foreground">usable</dt>
                  <dd>{research.providerUsable}</dd>
                  <dt className="text-muted-foreground">missed</dt>
                  <dd>{research.missed}</dd>
                  {research.searches !== undefined && (
                    <>
                      <dt className="text-muted-foreground">searches</dt>
                      <dd>{research.searches}</dd>
                    </>
                  )}
                </dl>
              )}
              {diagnostics && diagnostics.lookups.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left" data-testid="debug-pricing-lookups">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="pr-2 font-medium">{t('Lookup')}</th>
                        <th className="pr-2 font-medium">http</th>
                        <th className="pr-2 font-medium">parsed</th>
                        <th className="pr-2 text-right font-medium">asked</th>
                        <th className="pr-2 text-right font-medium">returned</th>
                        <th className="pr-2 text-right font-medium">matched</th>
                        <th className="pr-2 text-right font-medium">cites</th>
                        <th className="text-right font-medium">cited</th>
                        <th className="pl-2 font-medium">reply</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {diagnostics.lookups.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-0.5 pr-2">{i + 1}</td>
                          <td className="pr-2">{l.httpOk ? 'ok' : 'fail'}</td>
                          <td className="pr-2">{l.parsed ? 'yes' : 'no'}</td>
                          <td className="pr-2 text-right">{l.requested}</td>
                          <td className="pr-2 text-right">{l.returned}</td>
                          <td className="pr-2 text-right">
                            {l.matched}
                            {l.matchedLoosely > 0 ? ` (${l.matchedLoosely} loose)` : ''}
                          </td>
                          <td className="pr-2 text-right">{l.citations}</td>
                          <td className="text-right">
                            {l.cited}
                            {l.citedLoosely > 0 ? ` (${l.citedLoosely} loose)` : ''}
                          </td>
                          <td className="pl-2 text-muted-foreground" data-testid="debug-pricing-reply">
                            {[
                              l.finishReason ? `finish ${l.finishReason}` : null,
                              l.contentChars != null ? `${l.contentChars} chars` : null,
                              l.completionTokens != null ? `${l.completionTokens} tok` : null,
                              l.reasoningTokens != null ? `${l.reasoningTokens} reasoning` : null,
                              l.salvaged ? `${l.salvaged} salvaged` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {diagnostics && Object.keys(diagnostics.misses).length > 0 && (
                <dl
                  className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono"
                  data-testid="debug-pricing-misses"
                >
                  {Object.entries(diagnostics.misses).map(([reason, count]) => (
                    <Fragment key={reason}>
                      <dt className="text-muted-foreground">{reason}</dt>
                      <dd>{count}</dd>
                    </Fragment>
                  ))}
                </dl>
              )}
              {diagnostics && diagnostics.rejected.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <p className="text-muted-foreground">{t('Rejected web prices')}</p>
                  <table className="w-full text-left" data-testid="debug-pricing-rejected">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="pr-2 font-medium">{t('Key')}</th>
                        <th className="pr-2 font-medium">{t('Unit')}</th>
                        <th className="pr-2 text-right font-medium">{t('AI price')}</th>
                        <th className="pr-2 text-right font-medium">{t('Web price')}</th>
                        <th className="pr-2 font-medium">{t('Web unit')}</th>
                        <th className="font-medium">{t('Reason')}</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {diagnostics.rejected.map((r, i) => (
                        <tr key={`${r.key}-${i}`} className="border-t">
                          <td className="break-all py-0.5 pr-2">{r.key}</td>
                          <td className="pr-2">{r.unit}</td>
                          <td className="pr-2 text-right">{r.ai}</td>
                          <td className="pr-2 text-right">{r.web}</td>
                          <td className="pr-2">{r.webUnit ?? ''}</td>
                          <td>{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {changes.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left" data-testid="debug-pricing-changes">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="pr-2 font-medium">{t('Key')}</th>
                        <th className="pr-2 font-medium">{t('Unit')}</th>
                        <th className="pr-2 text-right font-medium">{t('AI price')}</th>
                        <th className="pr-2 text-right font-medium">{t('Final price')}</th>
                        <th className="font-medium">{t('Source')}</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {changes.map((c, i) => (
                        <tr key={`${c.key}-${i}`} className="border-t">
                          <td className="break-all py-0.5 pr-2">{c.key}</td>
                          <td className="pr-2">{c.unit}</td>
                          <td className="pr-2 text-right">{c.ai}</td>
                          <td className="pr-2 text-right">{c.final}</td>
                          <td>{c.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {hasRecord && (
            <details data-testid="debug-raw" className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">{t('Raw ai_meta')}</summary>
              <pre className="mt-1 max-h-96 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
                {prettyJson(estimate.ai_meta)}
              </pre>
            </details>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
