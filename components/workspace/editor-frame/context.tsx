'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { EditorFrame } from './frame'

interface EditorFrameCtx {
  frame: EditorFrame
  /**
   * v2 only: the docked bar's mount point at the bottom of the workspace. The
   * estimate editor owns every action handler, so it portals its dock in here
   * instead of lifting all of them up. null until the workspace has mounted.
   */
  dockEl: HTMLElement | null
}

/**
 * No provider means v1: anything that renders the editor on its own (unit
 * tests, /dev fixtures) keeps the floating pill unless it opts into v2.
 */
const Ctx = createContext<EditorFrameCtx>({ frame: 'v1', dockEl: null })

export function EditorFrameProvider({
  frame,
  dockEl,
  children,
}: EditorFrameCtx & { children: ReactNode }) {
  const value = useMemo(() => ({ frame, dockEl }), [frame, dockEl])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEditorFrameContext(): EditorFrameCtx {
  return useContext(Ctx)
}
