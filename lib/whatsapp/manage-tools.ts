/**
 * lib/whatsapp/manage-tools.ts
 *
 * Company-scoped WRITE LangChain tools for the WhatsApp MANAGE intent — the
 * owner asking the assistant to register a service ("add sofa cleaning $180") or
 * remember a rule ("we always charge a $50 minimum"). The LangChain binding
 * lives here (the channel adapter); the actual writes are the channel-neutral
 * createPriceBookService / addCompanyKnowledge (lib/agent-tools).
 *
 * Phase 178 Plan 03 (AGENT-01): also binds the DRAFT side of the agentic-send
 * confirmation flow — draft_customer_message prepares a customer-facing
 * message (via the channel-neutral draftCustomerMessage) and returns an
 * exact-echo confirmation string; it NEVER sends. The CONFIRM side (the
 * owner's next distinct reply) is handled separately in intent-router.ts's
 * pending-confirmation pre-check, not through this ReAct tool loop.
 *
 * ───────────────────────── SECURITY (T-lrf-01) ────────────────────────────────
 * `companyId` is a CLOSURE parameter captured from the trusted upstream value
 * (owner_phone → company), passed POSITIONALLY into each neutral write. It is
 * NEVER a zod tool-input field, so the LLM (fed untrusted inbound message text)
 * physically cannot supply a tenant. Do NOT add a company_id field to any schema.
 * `ownerPhone` is likewise a CLOSURE parameter (the channelRef bound to any
 * draft this call creates) — never a zod tool-input field either.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Like the existing WhatsApp field-edit tools (update_total etc.), add_service
 * and add_knowledge write immediately — there is no separate confirm turn;
 * the classifier only routes here for explicit "add/remember" requests, and
 * each tool echoes back what it saved so the owner can catch a mistake.
 * draft_customer_message is different: it never writes a send, only a pending
 * confirmation row — the owner's actual send always needs a distinct reply.
 */
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createPriceBookService,
  addCompanyKnowledge,
  draftCustomerMessage,
  getLatestEstimateForClient,
} from '@/lib/agent-tools'

export function makeManageTools(companyId: string, supabase: SupabaseClient, ownerPhone: string) {
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

  const draftCustomerMessageTool = tool(
    async ({
      client_name,
      channel,
      body,
      subject,
    }: {
      client_name: string
      channel: 'sms' | 'email'
      body: string
      subject?: string
    }) => {
      const r = await draftCustomerMessage(supabase, {
        companyId,
        clientQuery: client_name,
        channel,
        body,
        subject,
        triggerSource: 'agentic-whatsapp',
        channelRef: ownerPhone,
      })

      if (r.ok) {
        const kind = r.channel === 'sms' ? 'text' : 'email'
        return `Ready to send this ${kind} to ${r.clientName} (${r.recipient}):\n\n"${r.body}"\n\nReply YES to send it, or NO to cancel.`
      }

      switch (r.error) {
        case 'client_ambiguous': {
          const names = (r.candidates ?? []).join(', ')
          return `I found more than one client matching "${client_name}": ${names}. Which one did you mean? Nothing has been drafted yet.`
        }
        case 'client_not_found':
          return `I couldn't find a client matching "${client_name}". Please check the name and try again.`
        case 'no_recipient_email':
          return `${client_name} doesn't have an email on file, so I can't draft an email to them. Add an email to their client record first.`
        case 'no_recipient_phone':
          return `${client_name} doesn't have a phone number on file, so I can't draft a text to them. Add a phone number to their client record first.`
        case 'rate_limited':
          return "You've hit the daily limit for sending customer messages this way — nothing was drafted. Please try again tomorrow."
        default:
          return "I couldn't draft that message right now. Please try again."
      }
    },
    {
      name: 'draft_customer_message',
      description:
        'Prepare (draft) a text or email message to an existing client. This does NOT send anything — it creates a pending confirmation that the owner must separately approve on their next reply. Use when the owner asks to message/text/email a client, e.g. "text Sarah that we\'re running a day late".',
      schema: z.object({
        client_name: z.string().min(1).max(200).describe('The client to message, by name'),
        channel: z.enum(['sms', 'email']).describe('Whether to send as a text message or an email'),
        body: z.string().min(1).max(2000).describe('The message body to send to the client'),
        subject: z.string().max(200).optional().describe('Email subject line (email only)'),
      }),
    }
  )

  const getLatestEstimateForClientTool = tool(
    async ({ name }: { name: string }) => getLatestEstimateForClient(companyId, supabase, name),
    {
      name: 'get_latest_estimate_for_client',
      description:
        'Get the most recent estimate (total + date) for a client identified by name. Use this BEFORE mentioning any dollar amount in a drafted message — never state a price from memory.',
      schema: z.object({
        name: z.string().describe('Client name to look up the latest estimate for'),
      }),
    }
  )

  return [addServiceTool, addKnowledgeTool, draftCustomerMessageTool, getLatestEstimateForClientTool]
}
