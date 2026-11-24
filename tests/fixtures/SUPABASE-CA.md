# Development database trust anchor

`supabase-dev-root.crt` is the public Supabase Root2021 CA distributed by the
[official Studio configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json).
It contains no private key or credential.

- Source: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
- DER SHA-256: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`
- Valid until:2031-04-26T10:56:53Z.

The payment integration uses this CA with `rejectUnauthorized: true` and the
exact development pooler hostname and project user. A read-only connection
and `SELECT1` succeeded on2026-11-24. No database SSL setting was changed.
Follow the [Supabase TLS guidance](https://supabase.com/docs/guides/platform/ssl-enforcement)
and [node-postgres configuration](https://node-postgres.com/features/ssl) when
rotating the certificate. Keep certificate and hostname verification enabled.
