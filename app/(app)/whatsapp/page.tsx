import { notFound } from 'next/navigation'

/**
 * Route tombstone — the tenant WhatsApp inbox has been retired.
 * Returning notFound() ensures no redirect, no content disclosure,
 * and no inference of WhatsApp conversation existence.
 */
export default async function WhatsAppPage() {
  notFound()
}
