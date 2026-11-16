import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { EDITOR_FRAME_DEFAULT, useEditorFrame } from '@/components/workspace/editor-frame/frame'

const KEY = 'xt:editor-frame'

function setUrl(search: string) {
  window.history.replaceState(null, '', `/${search}`)
}

describe('useEditorFrame', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setUrl('')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    setUrl('')
  })

  it('returns the default frame with no override', () => {
    const { result } = renderHook(() => useEditorFrame())
    expect(result.current).toBe(EDITOR_FRAME_DEFAULT)
  })

  it('?editor=classic gives v1 and remembers it', () => {
    setUrl('?editor=classic')
    const { result } = renderHook(() => useEditorFrame())
    expect(result.current).toBe('v1')
    expect(window.localStorage.getItem(KEY)).toBe('v1')
  })

  it('?editor=new gives v2 and remembers it', () => {
    setUrl('?editor=new')
    const { result } = renderHook(() => useEditorFrame())
    expect(result.current).toBe('v2')
    expect(window.localStorage.getItem(KEY)).toBe('v2')
  })

  it('honours a stored v2', () => {
    window.localStorage.setItem(KEY, 'v2')
    const { result } = renderHook(() => useEditorFrame())
    expect(result.current).toBe('v2')
  })

  it('honours a stored v1', () => {
    window.localStorage.setItem(KEY, 'v1')
    const { result } = renderHook(() => useEditorFrame())
    expect(result.current).toBe('v1')
  })

  it('ignores a garbage stored value', () => {
    window.localStorage.setItem(KEY, 'v9')
    const { result } = renderHook(() => useEditorFrame())
    expect(result.current).toBe(EDITOR_FRAME_DEFAULT)
  })

  it('?editor=default clears the stored override', () => {
    window.localStorage.setItem(KEY, EDITOR_FRAME_DEFAULT === 'v2' ? 'v1' : 'v2')
    setUrl('?editor=default')
    const { result } = renderHook(() => useEditorFrame())
    expect(result.current).toBe(EDITOR_FRAME_DEFAULT)
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('falls back to the default when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    setUrl('?editor=classic')
    const { result } = renderHook(() => useEditorFrame())
    expect(result.current).toBe(EDITOR_FRAME_DEFAULT)
  })
})
