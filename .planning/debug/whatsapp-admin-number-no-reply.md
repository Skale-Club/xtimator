# Debug: WhatsApp admin number no reply

## Symptoms

- A sender messages the platform-managed Xtimator WhatsApp number configured in admin.
- Meta receives the inbound message.
- The sender does not receive a WhatsApp response.

## Root Cause

The webhook resolves inbound messages by the sender phone, not by the platform
phone number configured in admin. If the sender phone cannot be mapped to
`company_whatsapp.owner_phone`, `companies.phone`, an existing conversation, or
a client, the route silently returns. That makes the platform number appear to
receive messages while the sender gets no feedback.

Existing `company_whatsapp` rows can also remain non-active after phone sync,
while the webhook's primary owner route requires `status = 'active'`.

## Fix

- Reply to unknown inbound senders with a short setup message instead of
  silently ignoring them.
- Ensure owner-phone sync upserts `status = 'active'` for platform-managed
  WhatsApp routing.

## Verification

- Add/adjust unit tests for unknown sender reply and owner-phone sync payload.
