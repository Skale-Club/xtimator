'use client'

/**
 * Screen Wake Lock — keeps the phone screen on while a long, hands-free
 * operation is running.
 *
 * Why: the PWA's core flow is "record a 2-10 minute audio walkthrough of the
 * job site, then wait for the estimate to generate". The user is holding the
 * phone and talking, not touching it — so the OS idle timer fires and the
 * screen goes dark mid-recording. On iOS a locked screen suspends the page,
 * which can kill the MediaRecorder and lose the take entirely.
 *
 * The Screen Wake Lock API (`navigator.wakeLock`) is the platform answer:
 * Chrome/Edge/Android 84+, Safari/iOS 16.4+ (including installed PWAs).
 * On anything older the hook is a silent no-op — there is no reliable
 * userland fallback that survives iOS's autoplay rules once getUserMedia has
 * broken the user-gesture chain.
 *
 * Lifecycle notes that drive the implementation:
 * - A sentinel is released BY THE BROWSER whenever the document becomes
 *   hidden (tab switch, app backgrounded). It is never re-acquired
 *   automatically — hence the `visibilitychange` re-acquire below, without
 *   which a single tab switch permanently loses the lock for the rest of the
 *   recording.
 * - `request()` rejects (NotAllowedError) when the document is hidden or the
 *   device is in battery-saver mode. Rejection is non-fatal: recording keeps
 *   working, the screen just isn't held.
 */

import { useEffect, useRef } from 'react'

/**
 * SSR-safe capability probe. `navigator.wakeLock` is typed as always-present by
 * lib.dom, but it genuinely is absent on iOS < 16.4 and older WebViews — every
 * access below is gated on this.
 *
 * Exported for tests and for callers that want to warn.
 */
export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

/**
 * Holds a screen wake lock for as long as `active` is true.
 *
 * Acquire/release is driven entirely by the flag — the caller just passes
 * `isRecording || isProcessing` and never touches the sentinel. Unmount
 * releases, so an aborted flow can't leak a lock that keeps the screen on
 * forever.
 */
export function useWakeLock(active: boolean): void {
  // Held across renders so the cleanup path can release the sentinel that the
  // async acquire resolved with (state would re-render the caller for nothing).
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active || !isWakeLockSupported()) return

    // Guards the async acquire against a cleanup that runs while
    // `request()` is still in flight (fast toggle / unmount mid-request):
    // without it the resolved sentinel would be stored after teardown and
    // never released.
    let cancelled = false

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      // The browser flips `released` to true when it revokes the lock on
      // hide; a still-live sentinel means there's nothing to do.
      if (sentinelRef.current && !sentinelRef.current.released) return
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void sentinel.release().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
      } catch {
        // NotAllowedError — hidden document, battery saver, or a
        // screen-wake-lock permissions-policy denial. Non-fatal by design:
        // the visibilitychange listener retries when the page comes back.
      }
    }

    // Re-acquire after the browser's automatic release on hide. Firing on
    // every visible transition is safe — the `released` check above makes a
    // redundant call a no-op.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      const sentinel = sentinelRef.current
      sentinelRef.current = null
      // Releasing an already-released sentinel is harmless, but skipping it
      // avoids a pointless promise on every hide-then-stop teardown.
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {})
    }
  }, [active])
}
