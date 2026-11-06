'use server'

// SEED-056 Phase B: persist the company's document-block defaults
// (companies.document_blocks). These only shape estimates created AFTER the
// change -- existing estimates keep the presentation_settings they were born
// with (copy, not reference).

import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'
import { DOCUMENT_BLOCK_KEYS, type DocumentBlocksRaw } from '@/lib/estimate/document-blocks'

const documentBlocksSchema = z.object({
  summary: z.boolean(),
  payment_terms: z.boolean(),
  warranty_terms: z.boolean(),
  timeline: z.boolean(),
  notes: z.boolean(),
  photos: z.boolean(),
  estimate_terms: z.boolean(),
  valid_until: z.boolean(),
})

export async function updateDocumentBlocks(data: DocumentBlocksRaw) {
  const parsed = documentBlocksSchema.safeParse(data)
  if (!parsed.success) return { error: 'Invalid document block settings.' }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return { error: 'Not authenticated' }

  const companyId = await getActiveCompanyId()
  if (!companyId) return { error: 'No company found' }

  const denied = await assertWritable()
  if (denied) return denied

  // Persist exactly the known keys, in catalogue order.
  const documentBlocks: Record<string, boolean> = {}
  for (const key of DOCUMENT_BLOCK_KEYS) documentBlocks[key] = parsed.data[key]

  const { error } = await supabase
    .from('companies')
    .update({ document_blocks: documentBlocks })
    .eq('id', companyId)

  if (error) {
    console.error('[document-blocks] update DB error:', error)
    return { error: 'Failed to save document blocks. Please try again.' }
  }

  updateTag('company')
  revalidatePath('/settings')
  return { success: true }
}
