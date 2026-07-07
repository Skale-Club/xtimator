-- SMS (via the platform's Twilio number) is the standard client-facing text
-- channel on the Send screen — the WhatsApp send tab was removed from that
-- screen. The per-company sms_delivery_enabled flag stays as an opt-out via
-- Settings → Delivery, but it defaulted to FALSE, which hid the SMS tab for
-- every company that never found the toggle. Default it ON and backfill.
ALTER TABLE companies ALTER COLUMN sms_delivery_enabled SET DEFAULT TRUE;

UPDATE companies SET sms_delivery_enabled = TRUE WHERE sms_delivery_enabled = FALSE;
