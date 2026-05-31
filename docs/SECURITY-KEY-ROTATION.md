# Security Key Rotation Runbook

Produced by the security review (S09). Covers rotating the secrets whose
compromise is **catastrophic** for Xtimator. Treat `APP_ENCRYPTION_KEY` and the
Supabase service role key as the two highest-leverage assets — most catastrophic
breach scenarios collapse onto them.

---

## 1. `APP_ENCRYPTION_KEY` (AES-256-GCM master for `platform_integrations`)

This key encrypts every per-tenant integration credential (`platform_integrations.ciphertext`).
It is a **single key** with no versioning today, so rotation requires re-encrypting
every row. Do **not** simply swap the env var — that orphans all existing
ciphertext and breaks every integration.

### Recommended: zero-downtime versioned-ciphertext rotation

1. **Add a versioned column** (migration):
   ```sql
   alter table platform_integrations
     add column if not exists ciphertext_v2 bytea,
     add column if not exists key_version smallint not null default 1;
   ```
2. **Deploy dual-read code**: `decrypt()` tries `key_version = 2` (new key) first,
   falls back to `key_version = 1` (old key). Keep BOTH keys in env during the
   window (`APP_ENCRYPTION_KEY` + `APP_ENCRYPTION_KEY_NEXT`).
3. **Migrate rows** with a background job (Inngest) or a one-shot script:
   read each row, `decrypt(old)`, `encrypt(new)`, write `ciphertext_v2` + set
   `key_version = 2`. Idempotent — safe to re-run.
4. **Verify** every row has `key_version = 2` and `ciphertext_v2 IS NOT NULL`.
5. **Cut over**: promote `APP_ENCRYPTION_KEY_NEXT` to `APP_ENCRYPTION_KEY`,
   drop the dual-read fallback, drop the old `ciphertext` column.

### Emergency (key suspected leaked): maintenance-window rotation

1. Put the app in maintenance mode (integrations briefly unavailable).
2. Run the migration script above inline with both keys present.
3. Swap the env var, redeploy, exit maintenance.
4. **Rotate every downstream provider key** that was stored encrypted
   (Anthropic, OpenAI, Stripe, Resend, Meta, etc.) — assume they are exposed.

> Long-term: move `APP_ENCRYPTION_KEY` into a managed KMS (AWS KMS / Vault) so
> rotation is a KMS operation rather than an env-var swap.

---

## 2. Supabase service role key (`SUPABASE_SECRET_KEY`)

Bypasses all RLS — leak = full tenant compromise.

1. In the Supabase dashboard → Project Settings → API, roll the `service_role`
   key (or the new `sb_secret_*` key).
2. Update `SUPABASE_SECRET_KEY` (and the `SUPABASE_SERVICE_ROLE_KEY` fallback if
   set) in **Vercel env** (all environments) and any other host.
3. Redeploy. The old key is invalidated immediately on roll — there is no
   dual-key window, so schedule a brief redeploy.
4. Audit `platform_audit_log` + Supabase logs for use of the old key after the
   roll.

---

## 3. Webhook signing secrets

Each is independent; rotate at the provider, then update Vercel env + redeploy.

| Secret | Provider | Notes |
|--------|----------|-------|
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks | Stripe supports multiple active endpoints; add the new secret, deploy, then remove the old endpoint to avoid a gap. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Stripe Connect webhook | Same dual-endpoint trick. |
| `INNGEST_SIGNING_KEY` | Inngest dashboard | Roll, update env, redeploy. |
| `META_WHATSAPP_APP_SECRET` | Meta App dashboard | Roll, update env; re-verify the webhook subscription. |
| `CRON_SECRET` | self-generated | `openssl rand -base64 32`; update Vercel cron env. Auth check is constant-time (`lib/cron-auth.ts`). |

---

## 4. General checklist

- [ ] Rotate at the **provider first**, then update env, then redeploy
      (never the reverse — avoids a window where the new env points at a dead key).
- [ ] Never commit a key to git. `gitleaks` pre-commit + history are clean (B02);
      keep it that way.
- [ ] After any suspected leak, prefer over-rotation: rotate the leaked key AND
      anything it could decrypt or sign.
- [ ] Record the rotation in `platform_audit_log` / an incident note.
