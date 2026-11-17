'use client'

import { useEffect, useState } from 'react'
import { notFound, useSearchParams } from 'next/navigation'
import { BreadcrumbProvider } from '@/components/app-shell/breadcrumb-context'
import {
  EstimateVersionProvider,
  useEstimateVersionSlot,
  type VersionSlot,
} from '@/components/workspace/estimate-version-context'
import { EditorTopBar } from '@/components/workspace/editor-frame/editor-top-bar'
import { EditorDock } from '@/components/workspace/editor-frame/editor-dock'
import { EstimateStatusSheet } from '@/components/workspace/editor-frame/estimate-status-sheet'
import type { EstimateViewMode } from '@/components/workspace/estimate/estimate-floating-actions'
import type { ProjectDetail } from '@/lib/queries/project'

/**
 * Dev-only fixture for the editor's v2 frame (top bar, docked action bar,
 * status sheet), without signing in:
 * ?state=draft|saving|error|sent|accepted|declined. Sample data, nothing is
 * fetched. Renaming the project calls the real server action, so only use it
 * against a dev session. Nothing imports this route.
 */
const STATES = ['draft', 'saving', 'error', 'sent', 'accepted', 'declined'] as const
type FixtureState = (typeof STATES)[number]

const PROJECT = {
  id: 'dev-project',
  company_id: 'dev-company',
  name: 'Two-bedroom repaint',
  client: { id: 'dev-client', name: 'Ava Thompson' },
} as unknown as ProjectDetail

function sampleSlot(
  state: FixtureState,
  onOpenStatus: () => void,
  onReopen: () => void,
  viewMode: EstimateViewMode,
  setViewMode: (m: EstimateViewMode) => void,
): VersionSlot {
  const answered = state === 'accepted' || state === 'declined'
  const shared = state === 'sent' || answered
  return {
    currentVersionId: 'dev-estimate',
    versions: [],
    version: 1,
    isDirty: false,
    isReadOnly: answered,
    onVersionChange: () => {},
    projectName: PROJECT.name,
    onProjectRenamed: () => {},
    saveStatus: state === 'saving' ? 'saving' : state === 'error' ? 'error' : 'saved',
    viewMode,
    onViewModeChange: setViewMode,
    viewCount: shared ? 3 : 0,
    lastViewedAt: shared ? new Date(Date.now() - 40 * 60_000).toISOString() : null,
    sentAt: shared ? '2026-11-16T09:00:00.000Z' : null,
    total: 3486,
    currencyCode: 'USD',
    estimateNumber: 'NP-1045',
    createdAt: '2026-11-05T12:00:00.000Z',
    clientResponse: answered ? state : null,
    respondedAt: answered ? '2026-11-16T15:00:00.000Z' : null,
    hasSignature: false,
    isLocked: answered,
    onRetrySave: state === 'error' ? () => {} : undefined,
    onOpenStatus,
    onReopen: state === 'declined' ? onReopen : undefined,
  }
}

function Frame({ state: urlState }: { state: FixtureState }) {
  const { setSlot, slot } = useEstimateVersionSlot()
  const [statusOpen, setStatusOpen] = useState(false)
  const [viewMode, setViewMode] = useState<EstimateViewMode>('width')
  // "Revise and reopen" on the declined fixture moves it to the sent state
  // locally, like the real editor does after the server clears the answer.
  const [override, setOverride] = useState<{ from: FixtureState; to: FixtureState } | null>(null)
  const state = override && override.from === urlState ? override.to : urlState

  useEffect(() => {
    setSlot(
      sampleSlot(
        state,
        () => setStatusOpen(true),
        () => setOverride({ from: urlState, to: 'sent' }),
        viewMode,
        setViewMode,
      ),
    )
    return () => setSlot(null)
  }, [state, urlState, viewMode, setSlot])

  const answered = state === 'accepted' || state === 'declined'
  const shared = state === 'sent' || answered

  return (
    <div data-editor-frame="v2" className="flex min-h-[100dvh] flex-col bg-background">
      <EditorTopBar project={PROJECT} />

      <div className="flex-1 bg-muted/30 px-3 py-4 md:px-6">
        <nav className="mx-auto mb-3 flex max-w-3xl flex-wrap gap-2 text-xs">
          {STATES.map((s) => (
            <a
              key={s}
              href={`?state=${s}`}
              className={`rounded border bg-background px-2 py-1 ${s === urlState ? 'border-primary text-primary' : ''}`}
            >
              {s}
            </a>
          ))}
        </nav>
        <div className="mx-auto min-h-[1400px] max-w-3xl rounded-lg border border-border bg-white p-6 shadow-sm">
          {Array.from({ length: 28 }, (_, i) => (
            <div key={i} className="mb-6 flex items-center justify-between gap-6 border-b border-neutral-100 pb-4">
              <div className="h-3 w-1/2 rounded bg-neutral-200" />
              <div className="h-3 w-16 rounded bg-neutral-200" />
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 z-30">
        <EditorDock
          projectId={PROJECT.id}
          saving={state === 'saving'}
          locked={answered}
          onShare={() => {}}
          onOpenPhotos={() => {}}
          onOpenSettings={() => {}}
          onOpenDebug={() => {}}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>

      <EstimateStatusSheet
        open={statusOpen}
        onOpenChange={setStatusOpen}
        estimateId="dev-estimate"
        createdAt="2026-11-05T12:00:00.000Z"
        sentAt={shared ? '2026-11-16T09:00:00.000Z' : null}
        viewCount={slot?.viewCount ?? 0}
        lastViewedAt={slot?.lastViewedAt ?? null}
        clientResponse={answered ? state : null}
        respondedAt={answered ? '2026-11-16T15:00:00.000Z' : null}
        signedOnline={false}
        recordDisabled={state === 'saving'}
        onRecord={async () => {}}
      />
    </div>
  )
}

function Fixture() {
  const params = useSearchParams()
  const raw = params.get('state') ?? 'draft'
  const state: FixtureState = (STATES as readonly string[]).includes(raw) ? (raw as FixtureState) : 'draft'
  return (
    <BreadcrumbProvider>
      <EstimateVersionProvider>
        <Frame state={state} />
      </EstimateVersionProvider>
    </BreadcrumbProvider>
  )
}

export default function EditorFramePreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Fixture />
}
