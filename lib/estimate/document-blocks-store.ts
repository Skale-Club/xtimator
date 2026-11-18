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
 *  - text is empty      -> false (no text, no block)
 *  - text is non-empty  -> undefined (leave the owner's switch alone)
 *
 * Typing text used to turn the block on by itself; since 2026-11-18 the
 * payment / warranty blocks are off until the owner switches them on.
 */
export function blockFlagForTextChange(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean | undefined {
  void previous
  if (!hasText(next)) return false
  return undefined
}
