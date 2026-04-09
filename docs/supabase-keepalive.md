# Supabase Keepalive

This project uses a scheduled GitHub Actions workflow to ping the Supabase REST API once per day.

## Setup

1. Open the GitHub repository settings.
2. Go to **Secrets and variables** > **Actions**.
3. Add repository secrets named `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Use the matching values from `.env.local`. `SUPABASE_URL` should match `NEXT_PUBLIC_SUPABASE_URL`.
5. Go to **Actions** > **Supabase Keepalive** and run the workflow manually once to confirm the connection works.

The workflow lives at `.github/workflows/supabase-keepalive.yml`.
