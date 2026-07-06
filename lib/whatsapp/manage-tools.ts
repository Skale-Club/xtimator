/**
 * lib/whatsapp/manage-tools.ts
 *
 * Company-scoped WRITE LangChain tools for the WhatsApp MANAGE intent — the
 * owner asking the assistant to register a service ("add sofa cleaning $180") or
 * remember a rule ("we always charge a $50 minimum"). The LangChain binding
 * lives here (the channel adapter); the actual writes are the channel-neutral
 * createPriceBookService / addCompanyKnowledge (lib/agent-tools).
 *
 * ───────────────────────── SECURITY (T-lrf-01) ────────────────────────────────
 * `companyId` is a CLOSURE parameter captured from the trusted upstream value
 * (owner_phone → company), passed POSITIONALLY into each neutral write. It is
 * NEVER a zod tool-input field, so the LLM (fed untrusted inbound message text)
 * physically cannot supply a tenant. Do NOT add a company_id field to any schema.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Like the existing WhatsApp field-edit tools (update_total etc.), these write
 * immediately — there is no separate confirm turn; the classifier only routes
 * here for explicit "add/remember" requests, and each tool echoes back what it
 * saved so the owner can catch a mistake.
 */
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createPriceBookService, addCompanyKnowledge } from '@/lib/agent-tools'

export function makeManageTools(companyId: string, supabase: SupabaseClient) {
  const addServiceTool = tool(
    async ({ name, unitPrice, unit }: { name: string; unitPrice: number; unit?: string }) => {
      const r = await createPriceBookService(supabase, companyId, {
        name,
        unitPrice,
        ...(unit ? { unit } : {}),
      })
      return r.ok
        ? `Added "${r.name}" to the price book at ${r.currencyCode} ${r.unitPrice}.`
        : `Could not add the service: ${r.message}`
    },
    {
      name: 'add_service',
      description:
        'Add a new fixed-price service to the price book. Use when the owner wants to register a service they offer, e.g. "add upholstery cleaning for a sofa at $180".',
      schema: z.object({
        name: z.string().min(1).max(200).describe('The service name'),
        unitPrice: z.number().min(0).describe('The price in the company currency'),
        unit: z.string().max(100).optional().describe('Optional unit label (e.g. "each", "hour")'),
      }),
    }
  )

  const addKnowledgeTool = tool(
    async ({ title, body }: { title: string; body: string }) => {
      const r = await addCompanyKnowledge(supabase, companyId, {
        title,
        body,
        source: 'owner via WhatsApp',
      })
      return r.ok
        ? "Got it — I'll remember that for future estimates."
        : `Could not save that: ${r.message}`
    },
    {
      name: 'add_knowledge',
      description:
        'Save a company-specific rule, price, or preference the AI should remember for future estimates, e.g. "we always charge a $50 minimum" or "we don\'t do exterior windows".',
      schema: z.object({
        title: z.string().min(1).max(200).describe('A short title for the note'),
        body: z.string().min(1).describe('The rule or preference to remember'),
      }),
    }
  )

  return [addServiceTool, addKnowledgeTool]
}
