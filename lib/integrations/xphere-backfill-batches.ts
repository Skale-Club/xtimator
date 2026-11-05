import { EVENT_XPHERE_SYNC } from '@/lib/inngest/events'

/** Pure batch construction; route modules export only HTTP handlers/config. */
export function chunkEventBatches(companyIds: string[], size: number) {
  const events = companyIds.map(companyId => ({ name: EVENT_XPHERE_SYNC, data: { companyId, event: 'company.updated' as const } }))
  const chunks: (typeof events)[] = []
  for (let index = 0; index < events.length; index += size) chunks.push(events.slice(index, index + size))
  return chunks
}
