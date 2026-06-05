# Debug: WhatsApp intent no reply

## Symptoms

- Inbound WhatsApp messages stopped receiving replies.
- The webhook path now dispatches single-message inbound traffic to the
  `whatsapp-intent` Inngest function before creating a normal estimate.

## Root Cause

The intent router calls the classifier LLM before routing to the existing
`CREATE` flow. If that classifier call is unavailable or misconfigured (for
example missing OpenAI key in production), the Inngest run fails before
`processInboundMessages` is called, so no estimate job or WhatsApp reply is sent.

## Fix

Treat classifier failure the same way unrecognized classifier output is already
handled: log the error and default to the safe `CREATE` path.

## Verification

- Added a unit test proving classifier rejection still routes to
  `processInboundMessages`.
