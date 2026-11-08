'use client'

import { useEffect, useRef } from 'react'

/**
 * Minimal wrapper over the YouTube IFrame Player API. Plays inside our page via
 * the privacy-enhanced host, never links out. Reports state changes and exposes
 * position/duration through the `onPlayer` handle.
 */

interface YTPlayer {
  getCurrentTime(): number
  getDuration(): number
  destroy(): void
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      host: string
      videoId: string
      width: string
      height: string
      playerVars: Record<string, number | string>
      events: {
        onReady: () => void
        onStateChange: (e: { data: number }) => void
      }
    },
  ) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

/** YT.PlayerState values we care about. */
export const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 } as const

let apiPromise: Promise<YTNamespace> | null = null

function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube API unavailable'))
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      apiPromise = null
      reject(new Error('YouTube API failed to load'))
    }
    document.head.appendChild(script)
  })
  return apiPromise
}

export interface PlayerHandle {
  getCurrentTime(): number
  getDuration(): number
}

export function YouTubePlayer({
  videoId,
  onReady,
  onStateChange,
}: {
  videoId: string
  onReady: (handle: PlayerHandle) => void
  onStateChange: (state: number) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  // Keep the latest callbacks without re-creating the player.
  const onReadyRef = useRef(onReady)
  const onStateRef = useRef(onStateChange)
  useEffect(() => {
    onReadyRef.current = onReady
    onStateRef.current = onStateChange
  })

  useEffect(() => {
    let player: YTPlayer | null = null
    let cancelled = false
    const mountEl = hostRef.current

    loadYouTubeApi()
      .then((YT) => {
        const mount = mountEl
        if (cancelled || !mount) return
        // The API replaces the target element with an iframe; give it a fresh child.
        const target = document.createElement('div')
        mount.appendChild(target)
        player = new YT.Player(target, {
          host: 'https://www.youtube-nocookie.com',
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (player) onReadyRef.current(player)
            },
            onStateChange: (e) => onStateRef.current(e.data),
          },
        })
      })
      .catch(() => {
        // Player unavailable (offline / blocked): the lesson text still works.
      })

    return () => {
      cancelled = true
      try {
        player?.destroy()
      } catch {
        // already torn down
      }
      mountEl?.replaceChildren()
    }
  }, [videoId])

  return <div ref={hostRef} className="absolute inset-0 [&>iframe]:size-full" />
}
