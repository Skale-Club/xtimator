-- Share-link expiry (PII): public estimate links currently never expire, so a
-- forwarded/guessed URL exposes owner + client phone/email indefinitely. Add an
-- explicit expiry stamped at consolidation (when the link goes live). The public
-- loader treats a past share_expires_at as "expired" and serves no PII.
-- NULL = never expires (legacy links predating this change stay valid).
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS share_expires_at timestamptz;

COMMENT ON COLUMN estimates.share_expires_at IS
  'When the public share link stops working. Set at consolidation. NULL = no expiry (legacy).';
