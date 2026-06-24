import { z } from 'zod'
import { isKnownIndustry } from '@/lib/industries'

/**
 * lib/schemas/knowledge.ts
 *
 * KCUR-01: validation shape for a super-admin industry KB entry. `industry_id`
 * is a code-side id from lib/industries.ts (NOT a FK) — refined against the
 * known set so a bad/stale id is rejected before it ever reaches the service
 * client. `source` is an optional provenance label.
 *
 * Mirrors the blogPostSchema export pattern in lib/schemas/admin.ts.
 */
export const knowledgeEntrySchema = z.object({
  industry_id: z.string().min(1).refine(isKnownIndustry, 'Unknown industry'),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  source: z.string().max(500).nullable().optional(),
})

export type KnowledgeEntryInput = z.infer<typeof knowledgeEntrySchema>

/**
 * KOVL-01: validation shape for a per-COMPANY KB overlay entry (the tenant's own
 * settings panel — the two-panel rule). NO `industry_id` field: company rows
 * carry `industry_id: null` (the Phase-117 scope CHECK requires
 * `scope='company' => company_id NOT NULL`). The owning company is derived from
 * the active-company context, never from the client payload.
 */
export const companyKnowledgeEntrySchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  source: z.string().max(500).nullable().optional(),
})

export type CompanyKnowledgeEntryInput = z.infer<typeof companyKnowledgeEntrySchema>
