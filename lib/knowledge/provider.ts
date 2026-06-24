import 'server-only'
/**
 * lib/knowledge/provider.ts
 *
 * Server-only. The swappable KnowledgeProvider SEAM — the contract EVERY other
 * file in lib/knowledge/ imports (embed/retrieve/answer/fixture). Mirrors the
 * price-research provider port (lib/estimate/price-research/provider.ts).
 *
 * This port is BOTH:
 *  - the KMOD-04 determinism seam — a fixture adapter implements this same
 *    interface for network-free, deterministic CI runs; and
 *  - the (deferred) reranker seam — a future Cohere reranker slots BETWEEN
 *    retrieve() and answer() without changing this contract (do NOT add it day 1;
 *    it is a data-driven phase-2 optimization with an explicit trigger).
 *
 * Multi-tenant invariant: `industries` and `companyId` on RetrieveCtx are
 * CALLER-SUPPLIED (from the trusted server-side companies.industries[] / active
 * company), NEVER read from LLM output. The module is trusted server-side and
 * passes the company's OWN scoping — a tenant can never widen its own scope via
 * a prompt.
 *
 * Channel-neutral (ENGINE-01): this module imports NO channel package.
 * retrieve()/answer() are consumed by a channel adapter, never the reverse.
 */

/** One retrieved knowledge passage, ranked by cosine similarity (0..1). */
export interface Passage {
  id: string
  title: string
  body: string
  source: string | null
  scope: 'industry' | 'company'
  /** Cosine similarity in [0,1] (1 = identical). */
  similarity: number
}

/**
 * Retrieval scope — CALLER-SUPPLIED, NEVER from LLM output (multi-tenant
 * invariant). `industries` is the company's companies.industries[]; `companyId`
 * scopes the optional private overlay.
 */
export interface RetrieveCtx {
  /** companies.industries[] — caller-supplied; NEVER from LLM output. */
  industries: string[]
  /** Active company id — caller-supplied; the multi-tenant overlay scope. */
  companyId: string | null
  /** Top-k passages to return. Defaults to 5. */
  k?: number
}

export interface KnowledgeProvider {
  /** Embed text into a 1536-dim vector (text-embedding-3-small). MAY throw. */
  embed(text: string): Promise<number[]>
  /**
   * Retrieve the top-k passages (industry KB merged with the company overlay)
   * for `question` under `ctx`. NEVER throws — resolves to [] on any failure.
   */
  retrieve(question: string, ctx: RetrieveCtx): Promise<Passage[]>
}
