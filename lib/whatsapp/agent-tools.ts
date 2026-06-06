/**
 * LangGraph tool definitions for the WhatsApp confirmation agent.
 *
 * Each tool wraps an action from confirm-actions.ts and returns a human-readable
 * string. The agent uses these strings to compose a single WhatsApp reply to the owner.
 */
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  actionSend,
  actionCancel,
  actionUpdateField,
  actionSetClient,
  actionRegenerate,
  actionGetEstimateContext,
  formatEstimateContext,
  type Session,
} from '@/lib/whatsapp/confirm-actions'

export function makeConfirmationTools(
  session: Session,
  companyId: string,
  supabase: SupabaseClient
) {
  const sendEstimate = tool(
    async () => {
      const result = await actionSend(session, companyId, supabase)
      if (result.deliveredToClient) {
        const who = result.clientName ?? result.clientPhone
        return `Estimate sent to ${who} via WhatsApp. Share link: ${result.shareUrl}`
      }
      return `Estimate ready. Share link: ${result.shareUrl}\n(No client phone on file — share manually)`
    },
    {
      name: 'send_estimate',
      description:
        'Deliver the estimate to the client and mark it as sent. Use when the owner wants to send, deliver, submit, or go ahead with the estimate.',
      schema: z.object({}),
    }
  )

  const cancelEstimate = tool(
    async () => {
      await actionCancel(session, supabase)
      return 'Estimate discarded and draft deleted.'
    },
    {
      name: 'cancel_estimate',
      description:
        'Discard the current estimate draft. Use when the owner wants to cancel, scrap, or start over.',
      schema: z.object({}),
    }
  )

  const updateTotal = tool(
    async ({ value }: { value: number }) => {
      const updated = await actionUpdateField(session, supabase, { total: value })
      return `Total updated.\n\n${formatEstimateContext(updated)}`
    },
    {
      name: 'update_total',
      description:
        'Update the estimate total amount. Use when the owner gives a new price, total, or amount.',
      schema: z.object({
        value: z.number().positive().describe('New total amount in dollars'),
      }),
    }
  )

  const updateTimeline = tool(
    async ({ value }: { value: string }) => {
      const updated = await actionUpdateField(session, supabase, { timeline: value })
      return `Timeline updated.\n\n${formatEstimateContext(updated)}`
    },
    {
      name: 'update_timeline',
      description: 'Update the project timeline or completion timeframe.',
      schema: z.object({
        value: z.string().describe('New timeline description'),
      }),
    }
  )

  const updatePaymentTerms = tool(
    async ({ value }: { value: string }) => {
      const updated = await actionUpdateField(session, supabase, { payment_terms: value })
      return `Payment terms updated.\n\n${formatEstimateContext(updated)}`
    },
    {
      name: 'update_payment_terms',
      description: 'Update the payment terms or schedule.',
      schema: z.object({
        value: z.string().describe('New payment terms'),
      }),
    }
  )

  const updateSummary = tool(
    async ({ value }: { value: string }) => {
      const updated = await actionUpdateField(session, supabase, { summary: value })
      return `Summary updated.\n\n${formatEstimateContext(updated)}`
    },
    {
      name: 'update_summary',
      description: 'Update the estimate summary or description.',
      schema: z.object({
        value: z.string().describe('New summary text'),
      }),
    }
  )

  const setClient = tool(
    async ({ name, phone }: { name: string; phone: string }) => {
      const result = await actionSetClient(session, companyId, supabase, name, phone)
      const verb = result.isNew ? 'created' : 'updated'
      return `Client ${verb}: ${result.name} (${result.phone})`
    },
    {
      name: 'set_client',
      description:
        "Set or update the client name and phone for this estimate. Use when the owner provides a client's name and phone number.",
      schema: z.object({
        name: z.string().describe("Client's full name"),
        phone: z
          .string()
          .describe("Client's phone number in E.164 format (e.g. +15552223333)"),
      }),
    }
  )

  const regenerateEstimate = tool(
    async () => {
      const result = await actionRegenerate(session, companyId, supabase)
      return `Estimate regenerated.\n\n${formatEstimateContext(result.context)}`
    },
    {
      name: 'regenerate_estimate',
      description:
        'Rebuild the estimate from the original job site recording. Use when the owner wants a fresh or redone estimate.',
      schema: z.object({}),
    }
  )

  const getEstimateDetails = tool(
    async () => {
      if (!session.draft_estimate_id) return 'No estimate loaded.'
      const ctx = await actionGetEstimateContext(supabase, session.draft_estimate_id)
      return formatEstimateContext(ctx)
    },
    {
      name: 'get_estimate_details',
      description:
        'Get the current estimate details: total, sections, timeline, payment terms, and summary. Use to answer questions about the estimate.',
      schema: z.object({}),
    }
  )

  return [
    sendEstimate,
    cancelEstimate,
    updateTotal,
    updateTimeline,
    updatePaymentTerms,
    updateSummary,
    setClient,
    regenerateEstimate,
    getEstimateDetails,
  ]
}
