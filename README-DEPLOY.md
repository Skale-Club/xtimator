# Deploy: CI build → GHCR → Coolify pull

> **Secrets:** every secret-shaped value in this doc is a PLACEHOLDER. Never
> paste real PAT / webhook / key values here (a pre-commit gitleaks hook blocks
> them anyway).

## ⚠️ CRITICAL — order of operations before the first push

**Do NOT `git push` these commits yet.** They must stay LOCAL until a human has,
in this order:

1. **Rebooted / recovered the saturated CX32 VPS** (it OOM-thrashed and froze
   under the on-VPS build).
2. **Disabled Coolify git auto-deploy / source-build for Xtimator** so Coolify
   stops building from source on the VPS.

**Why:** if you push to `main` while Coolify is still configured to source-build,
the push re-triggers an on-VPS `next build`, which re-OOMs and re-freezes the
whole server (Coolify + every other app on the box). Only after BOTH steps above
are done is it safe to push. After the push, Coolify only ever PULLS the
prebuilt image — it never compiles on the VPS again.

## How it works

```
git push origin main
      │
      ▼
GitHub Actions (.github/workflows/build-deploy.yml)
  • runs on GitHub-hosted ubuntu-latest runners
  • docker build  ← `next build` happens HERE, in CI (never on the VPS)
  • docker push   → ghcr.io/skale-club/xtimator:latest
                    ghcr.io/skale-club/xtimator:<git-sha>
  • POST Coolify deploy webhook (COOLIFY_WEBHOOK_XTIMATOR)
      │
      ▼
Coolify on the CX32 VPS
  • PULLS ghcr.io/skale-club/xtimator:latest  (no build — just a pull)
  • restarts the container
```

**Root problem this fixes:** the memory-heavy `next build` used to run on the
8GB Hetzner CX32 VPS. It OOM-thrashed, saturated swap, and froze Coolify and
every app on the box. Moving the build into CI (GitHub runners) eliminates that
failure mode entirely. The `Dockerfile` is unchanged — it still uses
`output: 'standalone'` and the 5 `NEXT_PUBLIC_*` build ARGs.

## One-time Coolify reconfiguration checklist (human)

Do this in the Coolify panel BEFORE the first push (see CRITICAL section above):

1. **Switch the Xtimator app to "Docker Image" deployment** — point it at the
   image `ghcr.io/skale-club/xtimator:latest`.
2. **Add GHCR as a private registry in Coolify** so it can pull:
   - Registry: `ghcr.io`
   - Username: a GitHub username with access to the package
   - Password: a GitHub **Personal Access Token** with the `read:packages`
     scope (placeholder shape: `ghp_<your-pat>`).
   - This PAT is only for Coolify to PULL the image. CI does NOT need it — the
     CI push uses the built-in `GITHUB_TOKEN`.
3. **DISABLE git auto-deploy / source build** for the app. No more building
   from source on the VPS — Coolify should only pull the prebuilt image.
4. **Copy the Coolify "Deploy Webhook" URL** and store it as the GitHub repo
   secret `COOLIFY_WEBHOOK_XTIMATOR` (Settings → Secrets and variables →
   Actions → Secrets). Placeholder shape:
   `https://coolify.<your-host>/api/v1/deploy?uuid=<uuid>&force=false`
   Until this secret is set, the workflow's Coolify step skips gracefully — the
   image is still built and pushed, you just trigger the pull manually in
   Coolify.

## GitHub configuration for this repo

Set under **Settings → Secrets and variables → Actions**.

### Actions Variables (PUBLIC — these are NOT secrets)

These `NEXT_PUBLIC_*` values are inlined into the client bundle by `next build`,
so they are public by definition. They are passed as Docker build args.

| Variable                               | Notes                                  |
| -------------------------------------- | -------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`        | Supabase anon/publishable key          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key               |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`       | Cloudflare Turnstile site key          |

**`NEXT_PUBLIC_SITE_URL` is NOT a Variable.** It is hardcoded in the workflow
`env.SITE_URL` to exactly `https://xtimator.com`. The old Coolify env value
contained a literal `\n`, which broke redirects; hardcoding it guarantees no
stray newline/quote is ever reintroduced. Do not add it as a Variable.

### Actions Secrets

| Secret                     | Notes                                                          |
| -------------------------- | -------------------------------------------------------------- |
| `COOLIFY_WEBHOOK_XTIMATOR` | Coolify deploy webhook URL. Optional until Coolify is wired.   |

GHCR push uses the built-in `GITHUB_TOKEN` (the workflow has
`permissions: packages: write`) — **no PAT is needed in CI**. The PAT with
`read:packages` is only configured inside Coolify so it can PULL.

## Rollout to sibling apps (skaleclub-mail, xphere, xareable, xmart, …)

The workflow is written as a copy-paste template:

1. Copy `.github/workflows/build-deploy.yml` into the sibling repo.
2. In the workflow, change ONLY the 3 values called out in its header comment:
   - `env.IMAGE_NAME` → `ghcr.io/skale-club/<app>` (MUST be lowercase)
   - `env.SITE_URL` → that app's canonical https URL (no trailing newline/quote)
   - the `COOLIFY_WEBHOOK_<APP>` secret name referenced in the final step
3. In the sibling repo, set its own Actions Variables (whatever `NEXT_PUBLIC_*`
   that app needs) plus its own `COOLIFY_WEBHOOK_<APP>` secret.
4. In Coolify, do the same one-time reconfiguration (Docker Image type, GHCR
   private registry, disable source build, copy deploy webhook) for that app.

### Per-app config matrix

| Repo            | `IMAGE_NAME`                      | Webhook secret             | Actions Variables                  |
| --------------- | --------------------------------- | -------------------------- | ---------------------------------- |
| xtimator        | `ghcr.io/skale-club/xtimator`     | `COOLIFY_WEBHOOK_XTIMATOR` | the 4 `NEXT_PUBLIC_*` listed above |
| skaleclub-mail  | `ghcr.io/skale-club/skaleclub-mail` | `COOLIFY_WEBHOOK_MAIL`   | that app's `NEXT_PUBLIC_*`         |
| xphere          | `ghcr.io/skale-club/xphere`       | `COOLIFY_WEBHOOK_XPHERE`   | that app's `NEXT_PUBLIC_*`         |
| xareable        | `ghcr.io/skale-club/xareable`     | `COOLIFY_WEBHOOK_XAREABLE` | that app's `NEXT_PUBLIC_*`         |
| xmart           | `ghcr.io/skale-club/xmart`        | `COOLIFY_WEBHOOK_XMART`    | that app's `NEXT_PUBLIC_*`         |

## Out of scope (human follow-ups, not done here)

These are explicitly NOT covered by this change and require manual work:

- Coolify panel reconfiguration (the checklist above — done by a human).
- VPS swap tuning (swap size / swappiness on the CX32).
- Container resource limits (memory/CPU caps per app in Coolify).
- Hetzner alerts (CPU / memory / disk alerting so the next saturation is caught
  before it freezes the box).
