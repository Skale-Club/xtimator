// tests/unit/pdf/estimate-pdf-photo-grid-atomicity.test.tsx
//
// Phase 184 Plan 04 (PGBRK-02) — structural atomicity guard: PdfPhotoGrid
// must row-CHUNK into N `wrap={false}` Views (one per visual row), NOT one
// `wrap={false}` around the whole grid (stricter than the locked break rule
// — "photo grid breaks only between rows" — which today's pre-184-04 whole-
// grid wrap satisfied only by accident).
//
// Direct-invocation convention: EstimatePDF/EstimatePDFModern are called
// directly (no React renderer — see tests/unit/pdf/estimate-pdf-baseline-
// order.test.tsx for the same pattern), so the returned tree already
// contains fully-resolved react-pdf primitives (View/Text/Image/...). This
// is a purpose-built local walker adapted from
// tests/unit/pdf/estimate-pdf-banner-fill.test.tsx's style-aware DFS
// pattern, checking `el.props.wrap === false` instead of `backgroundColor`.

import { describe, it, expect } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import { View, Image } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { buildFixtureEstimate, FIXTURE_COMPANY } from '../estimate/fixtures/document-fixtures'

type PDFComponent = typeof EstimatePDF
type PropsElement = ReactElement<{ wrap?: boolean; children?: ReactNode }>

/** 7 photos: with photosPerRow(532 Classic) === floor(532/158) === 3 and
 * photosPerRow(508 Modern) === floor(508/158) === 3, this chunks into
 * exactly 3 rows ([3, 3, 1]) for BOTH templates. */
const SEVEN_PHOTOS = Array.from({ length: 7 }, (_, i) => ({
  id: `photo-${i}`,
  storage_path: `co-1/photo-${i}.jpg`,
  caption: null,
  url: `https://signed.example.test/photo-${i}.jpg`,
}))

function renderTree(component: PDFComponent) {
  const estimate = buildFixtureEstimate({})
  return component({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    estimate: estimate as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    company: FIXTURE_COMPANY as any,
    client: null,
    projectName: 'Photo Grid Atomicity Test',
    projectType: null,
    language: 'en',
    attachedPhotos: SEVEN_PHOTOS,
  })
}

function isPrimitive(el: PropsElement, target: unknown, displayName: string): boolean {
  const dn = (el.type as { displayName?: string } | undefined)?.displayName
  return dn === displayName || el.type === target
}

/** True iff this subtree contains at least one <Image> descendant — the one
 * unambiguous marker of a photo-grid row (no other wrap={false} block in
 * either template renders an <Image> except the signature block, which this
 * test never mounts — `signature` is omitted from renderTree above). */
function containsImage(node: ReactNode): boolean {
  if (node == null || typeof node === 'boolean') return false
  if (Array.isArray(node)) return node.some(containsImage)
  if (typeof node !== 'object' || !('props' in (node as object))) return false
  const el = node as PropsElement
  if (isPrimitive(el, Image, 'Image')) return true
  return containsImage(el.props.children)
}

/** DFS collecting every View node with `wrap === false` whose subtree
 * contains an <Image> — i.e. every photo-grid row-chunk. */
function collectPhotoGridWrapFalseNodes(node: ReactNode, out: PropsElement[]): void {
  if (node == null || typeof node === 'boolean') return
  if (Array.isArray(node)) {
    node.forEach((n) => collectPhotoGridWrapFalseNodes(n, out))
    return
  }
  if (typeof node !== 'object' || !('props' in (node as object))) return
  const el = node as PropsElement
  if (isPrimitive(el, View, 'View') && el.props.wrap === false && containsImage(el.props.children)) {
    out.push(el)
  }
  collectPhotoGridWrapFalseNodes(el.props.children, out)
}

describe.each([
  ['Classic', EstimatePDF],
  ['Modern', EstimatePDFModern],
] as const)('%s PDF photo grid atomicity (PGBRK-02)', (_label, component) => {
  it('7 photos row-chunk into exactly 3 wrap={false} row-Views (not 1 whole-grid wrap)', () => {
    const tree = renderTree(component)
    const nodes: PropsElement[] = []
    collectPhotoGridWrapFalseNodes(tree, nodes)
    expect(nodes).toHaveLength(3)
    for (const node of nodes) {
      expect(node.props.wrap).toBe(false)
    }
  })
})
