'use client'

import { useSyncExternalStore } from 'react'

/**
 * The estimate editor has two frames around the same document:
 *
 * - 'v2' — docked frame: one top bar (back, project, client, live total,
 *   status, save state), the paper in the middle, a docked action bar at the
 *   bottom. On phones the app header, the bottom nav and the chat bubble are
 *   hidden while the editor is open.
 * - 'v1' — the previous frame: ProjectHeader + the floating action pill.
 *
 * Both stay in the codebase on purpose, so going back is one line.
 */
export type EditorFrame = 'v1' | 'v2'

/**
 * THE SWITCH. To roll the redesign back for everyone, set this to 'v1' and
 * deploy. No other file needs to change.
 */
export const EDITOR_FRAME_DEFAULT: EditorFrame = 'v2'

/**
 * Per-browser override, so the owner can compare both frames on a real device
 * without a deploy: open any project with `?editor=classic` (v1), `?editor=new`
 * (v2) or `?editor=default` (forget the override). The choice is remembered in
 * this browser only.
 */
const STORAGE_KEY = 'xt:editor-frame'
const PARAM = 'editor'

function readOverride(): EditorFrame | null {
  try {
    const param = new URLSearchParams(window.location.search).get(PARAM)
    if (param === 'classic') window.localStorage.setItem(STORAGE_KEY, 'v1')
    else if (param === 'new') window.localStorage.setItem(STORAGE_KEY, 'v2')
    else if (param === 'default') window.localStorage.removeItem(STORAGE_KEY)
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'v1' || stored === 'v2' ? stored : null
  } catch {
    // Private mode / blocked storage: no override, the default applies.
    return null
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

const getSnapshot = (): EditorFrame => readOverride() ?? EDITOR_FRAME_DEFAULT
const getServerSnapshot = (): EditorFrame => EDITOR_FRAME_DEFAULT

/** Which frame this browser should draw. Server render always uses the default. */
export function useEditorFrame(): EditorFrame {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
