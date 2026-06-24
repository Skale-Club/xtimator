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
