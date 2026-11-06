// lib/estimate/document-blocks-store.ts
//
// SEED-056: read-merge-write of companies.document_blocks, shared by the
// server actions that change the text behind a block (payment, warranty, fine
// print) so the block flag follows the text without clobbering the owner's
// other switches. Deliberately NOT a 'use server' module: it is a helper that
// takes an already-authorised client, not a callable endpoint.

import type { SupabaseClient } from '@supabase/supabase-js'
import { hasText, parseDocumentBlocks, type DocumentBlocksRaw } from './document-blocks'

/** Merge `patch` over the stored document_blocks (other keys preserved). */
export async function mergeDocumentBlocks(
  supabase: SupabaseClient,
  companyId: string,
  patch: DocumentBlocksRaw,
): Promise<{ error?: string }> {
  const { data } = await supabase
    .from('companies')
    .select('document_blocks')
    .eq('id', companyId)
    .single()
  const merged = { ...parseDocumentBlocks((data as { document_blocks?: unknown } | null)?.document_blocks), ...patch }
  const { error } = await supabase.from('companies').update({ document_blocks: merged }).eq('id', companyId)
  return error ? { error: error.message } : {}
}

/**
 * The block flag that should follow a text edit:
 *  - text became non-empty (was empty)  -> true  (typing text turns the block on)
 *  - text is empty                      -> false
 *  - text unchanged and non-empty       -> undefined (leave the owner's switch alone)
 */
export function blockFlagForTextChange(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean | undefined {
  if (!hasText(next)) return false
  if (!hasText(previous)) return true
  return undefined
}
