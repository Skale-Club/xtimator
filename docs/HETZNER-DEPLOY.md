# Hetzner Cloud Deployment Runbook

> Step-by-step procedure to deploy Xtimator from a fresh Hetzner Cloud CX22 VPS to a running production host serving xtimator.com (or your configured domain).
>
> **Status (v3.1.1):** Artifacts shipped, deployment NOT activated. v3.2 milestone executes this runbook for real.

## Prerequisites

- Hetzner Cloud account with billing enabled
- Domain name with DNS control (default: `xtimator.com`)
- Supabase production project connection string + service role key (see `supabase/PROD-BOOTSTRAP.md`)
- All API keys ready: Anthropic, OpenAI, Resend, Stripe (test or live), Inngest signing + event keys
- Local SSH key pair generated

## 1. Provision Hetzner CX22

1. Hetzner Cloud Console -> Add Server
2. Location: `us-east` (Ashburn) — closest to Vercel/Supabase US regions
3. Image: Ubuntu 24.04 LTS
4. Type: CX22 (~EUR 4.51/mo — 2 vCPU, 4 GB RAM, 40 GB disk)
5. SSH Key: paste your public key
6. Name: `xtimator-prod-1`
7. Click "Create & Buy now"
8. Note the IPv4 address — call it `<SERVER_IP>` below

## 2. Initial Server Hardening

SSH in: `ssh root@<SERVER_IP>`

```bash
# System update
apt update && apt upgrade -y

# Create non-root deploy user
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# UFW firewall
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status

# Disable root SSH (optional but recommended)
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Reconnect as deploy: `ssh deploy@<SERVER_IP>`

## 3. Install Docker

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker deploy

# Logout + login to apply group
exit
```

Reconnect: `ssh deploy@<SERVER_IP>` then verify: `docker --version && docker compose version`

## 4. DNS Configuration

At your DNS provider:

- Create A record: `xtimator.com` -> `<SERVER_IP>` (TTL 300)
- (Optional) AAAA record for IPv6
- (Optional) Wildcard CNAME `*.xtimator.com` -> `xtimator.com` for custom domains feature (Phase 38-39)

Verify: `dig +short xtimator.com` returns `<SERVER_IP>` after propagation (~5-30 min).

## 5. Clone Repo and Build

```bash
cd /home/deploy
git clone https://github.com/Skale-Club/xtimator.git
cd xtimator
git checkout main
```

## 6. Populate .env.production

Copy the template and fill in real values:

```bash
cp .env.production.example .env.production
chmod 600 .env.production  # restrict permissions
nano .env.production        # populate with real keys
```

Required env vars (from `.env.production.example`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` (optionally `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_BUSINESS_ANNUAL`) — these are a LEGACY FALLBACK only (see `lib/billing/stripe-price-map.ts`); the primary path is the panel-managed Price ids stored in `billing_config` (`tiers[tier].stripePriceIdMonth`/`stripePriceIdYear`, set via the admin billing config UI)
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `STORAGE_PROVIDER` (default `supabase`; set to `s3` only when migrating to Hetzner Object Storage — see `docs/STORAGE-MIGRATION.md`)
- `GIT_SHA` — set automatically by step 7 below

Caddy / TLS env vars live in a SEPARATE file, `/opt/xtimator/.env`, NOT in `.env.production`:

```bash
sudo mkdir -p /opt/xtimator
sudo tee /opt/xtimator/.env > /dev/null <<'EOF'
DOMAIN=xtimator.com
ACME_EMAIL=admin@xtimator.com
EOF
sudo chmod 600 /opt/xtimator/.env
```

This split keeps the Next app from receiving TLS-layer config it doesn't need (Plan 68-01 decision).

**NEVER commit `.env.production` or `/opt/xtimator/.env`.** The repo `.env.production` filename is in `.gitignore`; the gitleaks pre-commit hook is the second line of defense.

## 7. Build and Start

```bash
# Inject build-time GIT_SHA so /api/health can report it
echo "GIT_SHA=$(git rev-parse HEAD)" >> .env.production

# Export the compose-substitution vars (DOMAIN/ACME_EMAIL) for `docker compose`
set -a; source /opt/xtimator/.env; set +a

# Build the Docker image
docker compose build

# Start in detached mode
docker compose up -d

# Watch logs
docker compose logs -f
```

The Caddy service will request a Let's Encrypt cert on first inbound HTTPS request — this can take 10-30 seconds. The xtimator service waits to be healthy (per `depends_on: service_healthy`) before Caddy accepts traffic, so there's no 502 window.

## 8. Smoke Test

From local machine:

```bash
# Liveness check (HTTPS — Caddy provisions Let's Encrypt cert on first request)
curl https://xtimator.com/api/health | jq

# Expected response:
# { "ok": true, "db": "ok", "storage": "ok", "commit": "<sha>" }
```

Manual smoke:

1. Open `https://xtimator.com` — landing page loads
2. Sign up new account — redirects to onboarding
3. Complete onboarding — redirects to dashboard
4. Create test project — capture flow loads
5. Open Inngest dashboard at `https://app.inngest.com` — confirm worker app registered

If `/api/health` returns 503, see Troubleshooting below.

## 9. Configure Cert Renewal

Caddy handles renewal automatically — Let's Encrypt certs renew at ~60 days (30 days before expiry). The `caddy_data` named volume persists `/data/caddy` across container restarts so renewals don't burn rate limits.

Verify periodically:

```bash
docker compose exec caddy caddy list-modules | grep tls.acme
docker compose logs caddy | grep -i "renewed\|certificate obtained"
```

If a renewal ever fails (e.g., DNS misconfigured), Caddy will keep serving the existing cert until expiry and retry hourly.

## 10. Backup Procedure

Daily automated backup of `.env.production` (the only host-side state — DB lives in Supabase managed):

```bash
# On the server, create backup script
sudo nano /usr/local/bin/backup-env.sh
```

```bash
#!/bin/bash
set -euo pipefail
BACKUP_DIR="/var/backups/xtimator"
DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
cp /home/deploy/xtimator/.env.production "$BACKUP_DIR/env-$DATE"
# Encrypt with age + upload to Hetzner Object Storage or Backblaze B2 here
# Keep 30 days of local backups
find "$BACKUP_DIR" -name 'env-*' -mtime +30 -delete
```

```bash
sudo chmod +x /usr/local/bin/backup-env.sh
sudo crontab -e
# Add line:
# 0 2 * * * /usr/local/bin/backup-env.sh
```

Caddy cert state (`caddy_data` volume) is also worth backing up so a host loss doesn't trigger a fresh ACME issuance:

```bash
docker run --rm -v xtimator_caddy_data:/data -v /var/backups/xtimator:/backup alpine \
  tar czf /backup/caddy-data-$(date +%Y%m%d).tar.gz -C /data .
```

## 11. Update Procedure

For a new deploy:

```bash
cd /home/deploy/xtimator
git pull origin main
sed -i "s/^GIT_SHA=.*/GIT_SHA=$(git rev-parse HEAD)/" .env.production
set -a; source /opt/xtimator/.env; set +a
docker compose up -d --build
docker compose logs -f --tail=50
curl https://xtimator.com/api/health | jq
```

The `--build` flag forces a fresh image; the `up -d` restarts only the service whose image changed (xtimator), leaving Caddy untouched. No 502 window because the new xtimator container must pass `/api/health` before the old one is killed (`depends_on: service_healthy`).

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `/api/health` returns 503 db=fail | DATABASE_URL wrong, env not loaded, or Supabase down | Verify env: `docker compose exec xtimator printenv NEXT_PUBLIC_SUPABASE_URL`. Check Supabase status. |
| `/api/health` returns 503 storage=fail | Supabase storage 5xx OR `STORAGE_PROVIDER=s3` with bad creds | Check `STORAGE_PROVIDER` value; revert to `supabase` if MinIO/Hetzner Object Storage misconfigured. |
| Caddy can't get cert | DNS not propagated / port 80 blocked | `dig xtimator.com`; `ufw status`; wait for DNS. Caddy logs: `docker compose logs caddy`. |
| `docker compose up` errors `DOMAIN required` | `/opt/xtimator/.env` not sourced into shell | Run `set -a; source /opt/xtimator/.env; set +a` before `docker compose` commands. |
| Inngest jobs not firing | Wrong INNGEST_EVENT_KEY | Inngest dashboard -> Settings -> re-copy event key into `.env.production`. |
| Container OOM-killed | 4 GB RAM tight under heavy AI load | Upgrade to CX32 (8 GB RAM, ~EUR 7/mo): Hetzner Console -> Server -> Rescale. |
| Image > 500 MB | `.dockerignore` not excluding everything | `docker images xtimator --format "{{.Size}}"`; review `.dockerignore` against Plan 68-03 verification. |

## Cost Summary

- **Hetzner CX22:** ~EUR 4.51/mo
- **Domain (xtimator.com):** ~USD 15/yr
- **Supabase Free:** USD 0
- **Inngest Free:** USD 0 (50k jobs/mo)
- **Total:** ~EUR 5/mo

Compare to Vercel Pro (USD 20/mo) — ~75% cheaper at MVP scale, with no 10s function timeout (which was the blocker that deferred v3.1 phases 62-65).

## Related

- `supabase/PROD-BOOTSTRAP.md` — Supabase production setup
- `docs/STORAGE-MIGRATION.md` — Future Hetzner Object Storage migration
- `docs/INNGEST-LOCAL-DEV.md` — Inngest local dev workflow
- `.env.production.example` — every runtime env var documented (placeholder syntax only)
- `Dockerfile` + `docker-compose.yml` + `Caddyfile` — the artifacts this runbook deploys
