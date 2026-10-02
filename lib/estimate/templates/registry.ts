/**
 * Estimate design template registry — the single shared source of truth for
 * template ids ('classic' | 'modern').
 *
 * This registry is the "meio de campo": the PDF route, the share page, and
 * the Settings picker all look up their template COMPONENT via a
 * `Record<EstimateTemplateId, Component>` map keyed off these ids — never
 * via inline if/else. Adding a future 3rd template is one registry entry +
 * one map entry + one new component file, nothing else touched.
 *
 * Matches the DB constraint in supabase/migrations/20260705000001_estimate_design_template.sql:
 * `check (estimate_template_style in ('classic', 'modern'))`, `default 'classic'`.
 */

export interface EstimateTemplateDefinition {
  id: 'classic' | 'modern'
  label: string
  description: string
  /**
   * Public path of a page-1 preview image (480px-wide WebP) shown in the
   * Settings template picker. Generated from the REAL PDF renderer by
   * scripts/generate-template-thumbnails.ts - re-run it after changing a PDF template.
   */
  thumbnail: string
}

export const ESTIMATE_TEMPLATES: ReadonlyArray<EstimateTemplateDefinition> = [
  {
    id: 'classic',
    label: 'Classic',
    description:
      'Bold corporate letterhead with brand-colored section headers and a boxed totals table.',
    thumbnail: '/estimate-templates/classic.webp',
  },
  {
    id: 'modern',
    label: 'Modern',
    description:
      'Quiet editorial style with serif typography, thin rule dividers, and a large standalone total.',
    thumbnail: '/estimate-templates/modern.webp',
  },
] as const

export type EstimateTemplateId = (typeof ESTIMATE_TEMPLATES)[number]['id']

const ESTIMATE_TEMPLATE_IDS: readonly EstimateTemplateId[] = ESTIMATE_TEMPLATES.map((t) => t.id)

export function isEstimateTemplateId(value: unknown): value is EstimateTemplateId {
  return typeof value === 'string' && ESTIMATE_TEMPLATE_IDS.includes(value as EstimateTemplateId)
}

export const DEFAULT_ESTIMATE_TEMPLATE_ID: EstimateTemplateId = 'classic'
