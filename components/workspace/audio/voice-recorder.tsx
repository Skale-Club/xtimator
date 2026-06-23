'use client'

/**
 * Quick task 260524-lxk — Shared presentational VoiceRecorder.
 *
 * This component owns ZERO MediaRecorder / AudioContext / getUserMedia /
 * Web Speech / hard-cap / cleanup state. It only paints pixels (mic button,
 * waveform, optional timer + ring) and invokes `onToggle()` when the mic
 * is tapped. The parent component is the single source of truth for the
 * recording lifecycle.
 */

import * as React from 'react'
import { Mic, MicOff } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { WaveformVisualizer } from '@/components/workspace/audio/waveform-visualizer'
import { CircularProgressRing } from '@/components/capture/circular-progress-ring'
import { cn } from '@/lib/utils'

export interface VoiceRecorderProps {
  // Required visual state — owned by parent
  analyser: AnalyserNode | null
  isRecording: boolean
  elapsedMs: number
  onToggle: () => void

  // Optional behavior knobs
  disabled?: boolean
  maxMs?: number              // for ring progress; if omitted, no ring rendered
  size?: 'sm' | 'md' | 'lg'   // sm = inline (refine dialog), md = dialog, lg = full-screen (capture)
  showTimer?: boolean         // default true
  helperText?: string         // e.g. "Tap to start recording" / "up to 2 min"
  className?: string

  // Capture-recorder coupling: ring driven by caller (color + progress)
  ringColorClass?: string
  ringProgress?: number

  // Optional slots for surface-specific extras
  belowWaveform?: React.ReactNode
  belowMic?: React.ReactNode

  // Optional test id override for the mic button (defaults to "voice-recorder-mic")
  micTestId?: string

  // size="sm" only: on >=sm screens, stack the mic ABOVE the waveform+timer
  // row (mic on top) instead of a single inline row. Mobile stays inline.
  smStack?: boolean
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

export function VoiceRecorder(props: VoiceRecorderProps) {
  const {
    analyser,
    isRecording,
    elapsedMs,
    onToggle,
    disabled = false,
    maxMs,
    size = 'md',
    showTimer = true,
    helperText,
    className,
    ringColorClass,
    ringProgress,
    belowWaveform,
    belowMic,
    micTestId = 'voice-recorder-mic',
    smStack = false,
  } = props

  // Shared mic button class fragments
  const micBase =
    'rounded-full flex items-center justify-center transition-all min-h-[44px] min-w-[44px] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none'
  const micState = isRecording
    ? 'bg-red-500 animate-pulse hover:bg-red-600 text-white shadow-glow-brand'
    : 'gradient-brand text-primary-foreground hover:opacity-90 shadow-glow-brand'

  // Per-size mic dimensions + icon sizing
  const micSizeClass =
    size === 'sm' ? 'h-9 w-9' : size === 'md' ? 'h-16 w-16' : 'h-11 w-11'
  const iconSizeClass =
    size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-7 w-7' : 'h-5 w-5'

  const micButton = (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(micBase, micSizeClass, micState)}
      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
      data-testid={micTestId}
    >
      {isRecording ? (
        <MicOff className={iconSizeClass} />
      ) : (
        <Mic className={iconSizeClass} />
      )}
    </button>
  )

  // For size="lg" — optionally wrap mic in a CircularProgressRing.
  // Two modes supported:
  //   1. ringColorClass + ringProgress provided → caller fully controls ring
  //   2. maxMs provided → auto-compute progress with stroke-primary
  let micWithRing: React.ReactNode = micButton
  if (size === 'lg') {
    if (ringColorClass !== undefined && ringProgress !== undefined) {
      micWithRing = (
        <CircularProgressRing
          progress={ringProgress}
          size={96}
          strokeWidth={5}
          colorClass={ringColorClass}
        >
          {micButton}
        </CircularProgressRing>
      )
    } else if (maxMs && maxMs > 0) {
      const p = Math.min(elapsedMs / maxMs, 1)
      micWithRing = (
        <CircularProgressRing
          progress={p}
          size={96}
          strokeWidth={5}
          colorClass="stroke-primary"
        >
          {micButton}
        </CircularProgressRing>
      )
    }
  }

  // -- size="sm" : inline row (mic | waveform | timer). No Card wrapper.
  // With smStack, the mic moves ABOVE the waveform+timer on >=sm screens
  // (mobile stays a single inline row).
  if (size === 'sm') {
    if (smStack) {
      return (
        <div className={cn('flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2', className)}>
          {micButton}
          <div className="flex items-center gap-2 flex-1 min-w-0 sm:w-full sm:flex-none sm:justify-center">
            <div className="flex-1 min-w-0 sm:flex-none sm:w-12">
              <WaveformVisualizer analyser={analyser} isRecording={isRecording} height={30} />
            </div>
            {showTimer && (
              <span className="font-mono text-xs text-muted-foreground tabular-nums shrink-0">
                {fmt(elapsedMs)}
              </span>
            )}
          </div>
          {belowMic}
        </div>
      )
    }
    return (
      <div className={cn('flex items-center gap-3', className)}>
        {micButton}
        <div className="flex-1 min-w-0">
          <WaveformVisualizer
            analyser={analyser}
            isRecording={isRecording}
            height={40}
          />
        </div>
        {showTimer && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {fmt(elapsedMs)}
          </span>
        )}
        {belowMic}
      </div>
    )
  }

  // -- size="md" : dialog layout (timer top, waveform, mic, helper).
  if (size === 'md') {
    return (
      <Card
        variant="glass"
        className={cn('p-6 space-y-4 items-center text-center', className)}
      >
        {showTimer && (
          <p className="text-3xl font-mono text-foreground tabular-nums">
            {fmt(elapsedMs)}
          </p>
        )}
        <div className="w-full">
          <WaveformVisualizer
            analyser={analyser}
            isRecording={isRecording}
            height={72}
          />
        </div>
        {belowWaveform}
        <div className="flex justify-center">{micButton}</div>
        {helperText && (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        )}
        {belowMic}
      </Card>
    )
  }

  // -- size="lg" : capture-recorder full-screen (waveform, belowWaveform slot,
  //    mic-in-ring, helper, belowMic).
  return (
    <Card
      variant="glass"
      className={cn(
        'p-6 mx-auto w-full max-w-md flex flex-col items-center gap-4',
        className
      )}
    >
      <div className="w-full">
        <WaveformVisualizer
          analyser={analyser}
          isRecording={isRecording}
          height={80}
        />
      </div>
      {belowWaveform}
      {showTimer && (
        <p className="text-2xl font-mono text-foreground tabular-nums">
          {fmt(elapsedMs)}
        </p>
      )}
      {micWithRing}
      {helperText && (
        <p className="text-sm text-muted-foreground">{helperText}</p>
      )}
      {belowMic}
    </Card>
  )
}
