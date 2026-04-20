# Platform admin bootstrap

Platform admin access is gated by membership in the `platform_admins` table. Because only existing admins can add new admins (per the self-referential RLS policy and the admin UI at `/admin/admins`), the very first row must be inserted manually — otherwise there is no way in. This doc walks through that one-time procedure.

This matches the bootstrap decision in phase 8 context **D-06 / R-08**: no env-var allowlist (too easy to misconfigure in staging), no UI self-promotion (forge-proof requires DB access).

## Step 1: Find your user id

Log in to the app once so your user row exists in `auth.users`. Any route that requires auth will do — for example, visit `/login` and sign in normally.

Then in the Supabase Dashboard, navigate to **Authentication → Users**, click your row, and copy the `UUID` value. That value is your `user_id`.

## Step 2: Insert the admin row

In the Supabase Dashboard, open **SQL Editor** and run:

```sql
INSERT INTO platform_admins (user_id, notes)
VALUES ('<paste-your-user-uuid-here>', 'First platform admin — bootstrap');
```

Replace `<paste-your-user-uuid-here>` with the UUID you copied in Step 1.

Because the RLS policies on `platform_admins` only allow existing admins to insert, this INSERT must be executed as the service role (the SQL Editor uses the service role by default — no extra configuration needed).

## Step 3: Verify

Navigate to `/admin/integrations` in the app. If the page loads (rather than returning 404), you are now a platform admin. You can then use the `/admin/admins` UI to add additional admins.

If the page 404s, double-check that the `user_id` you inserted matches your `auth.users` row exactly.

## Rotating the APP_ENCRYPTION_KEY

The `APP_ENCRYPTION_KEY` environment variable encrypts all values in `platform_integrations` using AES-256-GCM. Rotate periodically (every 90–180 days) or immediately on suspected compromise.

1. **Generate the new key:**
   ```bash
   openssl rand -base64 32
   ```
   Copy the output.

2. **Re-encrypt all integration rows.** In v1 this is a manual SQL step performed by an admin with access to both the current and next key:
   - Start from a safe state (no integration edits in flight).
   - In a single transaction: decrypt each row with the current key, then re-encrypt with the new key, writing back `ciphertext` / `iv` / `auth_tag`.
   - A future phase will ship `/admin/rotate-keys` to automate this; until then, coordinate manually.

3. **Flip the env var.** Update `APP_ENCRYPTION_KEY` in your Vercel project settings (Production + Preview + Development) and in local `.env.local`. Redeploy.

If the env var is rotated *before* the re-encryption step, all existing `platform_integrations` rows will fail to decrypt and every consuming feature will return HTTP 503 until the next admin edit overwrites the row.
