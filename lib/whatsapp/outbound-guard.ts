/**
 * Development kill switch for outbound WhatsApp (owner rule: outbound effects
 * are off in development, which runs against the fake-data database).
 *
 * Blocked when NODE_ENV === 'development', unless WHATSAPP_ALLOW_DEV_SEND=true.
 * NODE_ENV is 'production' in prod and 'test' under vitest, so neither is affected.
 */
export function isWhatsAppOutboundBlocked(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.WHATSAPP_ALLOW_DEV_SEND !== 'true'
  )
}

/** Log a blocked send with the message kind and the last 4 digits only. */
export function logOutboundBlocked(kind: string, recipient?: string): void {
  console.info(
    `[WhatsApp] outbound blocked in development (type=${kind}${
      recipient ? `, to=...${recipient.slice(-4)}` : ''
    })`
  )
}
