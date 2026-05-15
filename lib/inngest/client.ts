/**
 * Phase 67: Singleton Inngest client.
 *
 * Implements INNGEST-01.
 *
 * INNGEST_EVENT_KEY is auto-detected from the environment. Local dev uses
 * dummy keys — the inngest-cli dev server does not validate them.
 */
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'xtimator',
})
