'use client'

import { useRef, useState } from 'react'
import { Play, Pause, Mic, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WaMessageRow } from '@/lib/whatsapp/conversations'

export function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(s: number): string {
  if (!isFinite(s) || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function AudioMessage({ src, outbound }: { src: string; outbound: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      void audio.play()
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const timeLabel =
    playing || currentTime > 0 ? formatDuration(currentTime) : formatDuration(duration)

  return (
    <div className="flex min-w-[200px] max-w-[240px] items-center gap-2.5 py-0.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrentTime(0)
        }}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
          outbound
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-foreground/10 hover:bg-foreground/20 text-foreground',
        )}
      >
        {playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 translate-x-0.5" />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div
          className={cn(
            'relative h-1 w-full overflow-hidden rounded-full',
            outbound ? 'bg-white/25' : 'bg-foreground/15',
          )}
        >
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-[width] duration-100',
              outbound ? 'bg-white/80' : 'bg-foreground/50',
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] opacity-60">{timeLabel}</span>
      </div>
      <Mic className="h-4 w-4 shrink-0 opacity-40" />
    </div>
  )
}

export function MessageBubble({ m }: { m: WaMessageRow }) {
  const outbound = m.direction === 'outbound'
  const failed = m.status === 'failed'

  const content =
    m.msg_type === 'audio' && m.media_url ? (
      <AudioMessage src={m.media_url} outbound={outbound} />
    ) : m.msg_type === 'image' && m.media_url ? (
      <img src={m.media_url} alt="Photo" className="max-w-full rounded-lg" />
    ) : (
      <span>
        {m.body ??
          (m.msg_type === 'image'
            ? '📷 Photo'
            : m.msg_type === 'audio'
              ? '🎤 Voice message'
              : m.msg_type === 'document'
                ? '📄 Document'
                : '')}
      </span>
    )

  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
          outbound
            ? failed
              ? 'bg-destructive/10 text-foreground border border-destructive/40'
              : 'bg-[image:var(--gradient-brand)] text-white'
            : 'bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] text-foreground border border-[var(--glass-border)]',
        )}
      >
        {content}
        <span
          className={cn(
            'mt-1 flex items-center gap-1 text-[10px] opacity-70',
            outbound ? 'justify-end' : 'justify-start',
          )}
        >
          {formatTime(m.created_at)}
          {outbound && !failed && <CheckCheck className="h-3 w-3" />}
          {failed && <span className="text-destructive">· failed</span>}
        </span>
      </div>
    </div>
  )
}
