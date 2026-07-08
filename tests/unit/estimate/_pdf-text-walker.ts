// tests/unit/estimate/_pdf-text-walker.ts
// Phase 163 (SENDHUB-04/-05): shared helper for walking @react-pdf/renderer
// element trees and collecting <Text> primitive children into a flat string.
// Extracted from tests/unit/pdf/estimate-pdf-totals.test.tsx:22-51 verbatim
// so both the classic + modern PDF tests AND the new cross-surface test
// share ONE implementation. Underscore prefix signals: not a test file.

import type { ReactElement, ReactNode } from 'react'

export function flattenText(children: ReactNode): string {
  if (children == null || typeof children === 'boolean') return ''
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(flattenText).join('')
  if (typeof children === 'object' && 'props' in (children as object)) {
    return flattenText((children as ReactElement).props.children)
  }
  return ''
}

export function collectTextNodes(node: ReactElement | ReactNode, out: string[]): void {
  if (node == null || typeof node === 'boolean') return
  if (Array.isArray(node)) { node.forEach((n) => collectTextNodes(n, out)); return }
  if (typeof node !== 'object' || !('props' in (node as object))) return
  const el = node as ReactElement
  // @react-pdf/renderer exposes displayName='Text' on its Text primitive.
  const displayName = (el.type as { displayName?: string })?.displayName
  if (displayName === 'Text') {
    out.push(flattenText(el.props.children))
    return
  }
  collectTextNodes(el.props.children as ReactNode, out)
}
