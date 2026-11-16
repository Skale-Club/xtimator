'use client'

import { useRef, useState } from 'react'
import { notFound, useSearchParams } from 'next/navigation'
import { NewXtimateFrame } from '@/components/projects/new-project-dialog'
import { RecorderBody, type RecorderBodyProps } from '@/components/capture/capture-recorder'
import { CaptureProcessingOverlay } from '@/components/capture/capture-processing-overlay'
import { CaptureFailure } from '@/components/capture/capture-failure'
import { RefineWorking } from '@/components/capture/refine-working'
import { RefineReview } from '@/components/capture/refine-review'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

/**
 * Dev-only fixture for the New Xtimate / Edit with AI popup, without signing
 * in: ?state=empty|text|photos|recording|paused|processing|needs|failure|refine|
 * refine-working|refine-review and ?edit=1 for the "Edit with AI" title. Every
 * handler is a no-op and nothing touches the server. Nothing imports this.
 */
const STATES = [
  'empty', 'text', 'photos', 'recording', 'paused', 'processing', 'needs',
  'failure', 'refine', 'refine-working', 'refine-review',
] as const
type FixtureState = (typeof STATES)[number]

const SHOT_COLORS = ['#cfc4b0', '#b9c4cc', '#dfe6e4', '#e6e1d6', '#c9b9a5']
function shot(i: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${SHOT_COLORS[i % 5]}"/><rect y="50" width="64" height="14" fill="#8a7a66"/><path d="M22 3l5 14-5 12 8 13-4 8" fill="none" stroke="#5b4d3f" stroke-width="2"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
const PHOTOS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, status: 'done' as const, previewUrl: shot(i) }))

const SAMPLE_TEXT =
  'Interior painting of the living room and two bedrooms, about 85 m2 of wall. Skim coat on the cracked spots, two coats of matte white acrylic. Client wants to start next week.'

const DIFF = {
  changed: [
    { description: 'Wall painting, living room and bedrooms', oldPrice: 1480, newPrice: 1650, oldQty: 1, newQty: 1 },
    { description: 'Skim coat and sanding', oldPrice: 180, newPrice: 180, oldQty: 3, newQty: 2 },
  ],
  added: [{ description: 'Ceiling painting, living room', unit_price: 390 }],
  removed: [{ description: 'Extra floor protection' }],
  fields: { summary: { old: 'Interior painting.', new: 'Interior painting with satin finish.' }, timeline: true },
}

// Fixed so the render stays pure; the checklist just shows an old step as running.
const ACTIVE_STEP_STARTED_AT = '2026-11-16T12:00:00.000Z'

const noop = () => {}
const noopAsync = async () => {}

function Fixture() {
  const params = useSearchParams()
  const raw = params.get('state') ?? 'empty'
  const state: FixtureState = (STATES as readonly string[]).includes(raw) ? (raw as FixtureState) : 'empty'
  const edit = params.get('edit') === '1'
  const [language, setLanguage] = useState<EstimateLanguage>('en')
  const [text, setText] = useState(state === 'text' || state === 'photos' || state === 'refine' ? (state === 'refine' ? 'Use satin paint and add the living room ceiling.' : SAMPLE_TEXT) : '')
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const refineMode = state === 'refine' || edit
  const recording = state === 'recording' || state === 'paused'
  const photoItems = state === 'photos' || recording ? PHOTOS.slice(0, state === 'photos' ? 4 : 2) : []

  const bodyProps: RecorderBodyProps = {
    analyser: null,
    isRecording: recording,
    isPaused: state === 'paused',
    elapsedMs: state === 'paused' ? 74_000 : 47_000,
    ringColorClass: 'stroke-primary',
    progress: 0.1,
    onToggle: noop,
    onPause: noop,
    onDiscard: noop,
    descriptionText: text,
    setDescriptionText: setText,
    uploadedPhotos: [],
    isUploadingPhotos: false,
    photoItems,
    onRemovePhoto: noop,
    photoInputRef,
    onPhotoFileChange: noopAsync,
    onPhotoFiles: noopAsync,
    hasAnyInput: text.trim().length > 0 || photoItems.length > 0,
    onGenerate: noopAsync,
    refineMode,
    hasAudio: false,
    onClearAudio: noop,
    onRegenerate: noop,
    estimateLanguage: language,
    setEstimateLanguage: setLanguage,
    mode: undefined,
    isHorizontal: true,
    onStartBlank: refineMode ? undefined : noopAsync,
    needsDetails:
      state === 'needs'
        ? {
            reason: 'missing_specifics',
            questions: ['What is the wall area to paint?', 'Is the paint supplied by you or by the client?'],
            fallbackMessage: 'Description too vague. Please add more detail.',
          }
        : null,
  }

  let body: React.ReactNode
  if (state === 'processing') {
    body = (
      <div className="relative flex min-h-[260px] flex-1 flex-col overflow-y-auto">
        <CaptureProcessingOverlay
          layout="popup"
          stage="generating"
          mode="audio"
          completedSteps={['save_recording', 'transcribe']}
          activeStep="generate_estimate"
          activeStepStartedAt={ACTIVE_STEP_STARTED_AT}
          showLeaveHint
          onContinueInBackground={noop}
        />
      </div>
    )
  } else if (state === 'failure') {
    body = (
      <div className="flex flex-1 flex-col">
        <CaptureFailure
          errorMessage="The estimate could not be generated. Try again or build it by hand."
          retriesUsed={0}
          onRetry={noop}
          onEditManually={noop}
        />
      </div>
    )
  } else if (state === 'refine-working') {
    body = <RefineWorking phase="refining" />
  } else if (state === 'refine-review') {
    body = (
      <RefineReview
        diff={DIFF}
        currencyCode="USD"
        totals={{ before: 2340, after: 2635, label: 'total' }}
        onApply={noop}
        onDiscard={noop}
      />
    )
  } else {
    body = (
      <>
        {refineMode && (
          <p className="mx-5 mt-1 rounded-xl bg-primary/10 px-3 py-2.5 text-[13px] text-muted-foreground" data-testid="refine-mode-hint">
            This will update the current estimate. You review the changes before they are applied.
          </p>
        )}
        <RecorderBody {...bodyProps} />
      </>
    )
  }

  const title = state === 'refine-review' ? 'Review changes' : edit || refineMode ? 'Edit with AI' : 'New Xtimate'
  return (
    <div className="min-h-dvh bg-muted/30 p-4 text-xs">
      <nav className="flex flex-wrap gap-2">
        {STATES.map((s) => (
          <a key={s} href={`?state=${s}${edit ? '&edit=1' : ''}`} className={`rounded border bg-background px-2 py-1 ${s === state ? 'border-primary text-primary' : ''}`}>{s}</a>
        ))}
        <a href={`?state=${state}${edit ? '' : '&edit=1'}`} className="rounded border bg-background px-2 py-1">{edit ? 'edit off' : 'edit on'}</a>
      </nav>
      <NewXtimateFrame
        open
        onClose={noop}
        title={title}
        description="Fixture"
        estimateLanguage={language}
        setEstimateLanguage={setLanguage}
      >
        {body}
      </NewXtimateFrame>
    </div>
  )
}

export default function NewXtimatePreview() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <Fixture />
}
