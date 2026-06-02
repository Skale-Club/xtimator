# Debug: WhatsApp owner phone inbound

## Symptoms

- Owner sends a WhatsApp message from their phone number.
- Message does not create a project in Xtimator.
- Owner receives no WhatsApp reply.

## Root Cause

The inbound webhook routes first by `company_whatsapp.owner_phone` with
`status = 'active'`. The `owner_phone` migration added the column and unique
index, but did not backfill existing companies from `companies.phone`.

Existing companies can therefore have a valid owner phone on `companies.phone`
but no matching `company_whatsapp.owner_phone`, causing the webhook to silently
ignore the sender as unknown.

## Fix

Backfill `company_whatsapp.owner_phone` from `companies.phone` during the
owner-phone migration, creating missing `company_whatsapp` rows and updating
existing rows with a null owner phone. Keep only the first company per normalized
phone to preserve the unique `owner_phone` index.
