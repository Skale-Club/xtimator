import 'server-only'
/**
 * lib/agent-tools/ask-knowledge.ts
 *
 * NEUT-04 — channel-neutral thin wrapper over lib/knowledge/answer (the
 * already-neutral RAG composer). A pass-through that forwards the question +
 * the retrieval scope verbatim and inherits answer()'s never-throw guarantee
 * (a KB or model outage returns a safe FALLBACK string, never propagates).
 *
 * T-lrf-01: `industries` + `companyId` are CALLER-SUPPLIED (the trusted
 * retrieval scope) — NEVER derived from the untrusted question text.
 *
 * Never-throws by construction: answer() already returns a FALLBACK string on
 * any failure, but the wrapper also guards so this neutral capability NEVER
 * propagates a rejection to a binding channel (chat / messaging / MCP) — a KB
 * or model outage degrades to a safe string, never a crash.
 */
import { answer } from '@/lib/knowledge/answer'

const FALLBACK = "I couldn't find an answer in the knowledge base right now."

export async function askKnowledge(
  question: string,
  ctx: { industries: string[]; companyId: string; language?: 'en' | 'pt' | 'es' }
): Promise<string> {
  try {
    return await answer(question, ctx)
  } catch (err) {
    console.warn('[agent-tools] askKnowledge failed (returning fallback):', err)
    return FALLBACK
  }
}
