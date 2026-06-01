---
phase: quick-260531-npx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/build-deploy.yml
  - README-DEPLOY.md
autonomous: true
requirements: [CI-BUILD-01, CI-PUSH-02, COOLIFY-DEPLOY-03, DEPLOY-DOCS-04]

must_haves:
  truths:
    - "Pushing to main triggers a GitHub Actions job that builds the Docker image on GitHub runners (never on the VPS)"
    - "The built image is pushed to ghcr.io/skale-club/xtimator with :latest and :<sha> tags"
    - "The 5 NEXT_PUBLIC_* values are passed as build args from GitHub Actions Variables, with NEXT_PUBLIC_SITE_URL exactly https://xtimator.com (no trailing newline/quotes)"
    - "A final step pings the Coolify deploy webhook from a secret, but skips gracefully (workflow still succeeds) when the secret is absent"
    - "The workflow file doubles as a copy-paste template for sibling apps via a top env: block + header comment"
    - "README-DEPLOY.md documents the new flow plus the exact human Coolify reconfiguration checklist"
  artifacts:
    - path: ".github/workflows/build-deploy.yml"
      provides: "CI build-and-push pipeline + Coolify webhook trigger"
      contains: "docker/build-push-action"
    - path: "README-DEPLOY.md"
      provides: "Deploy flow docs + Coolify reconfiguration checklist + per-app rollout"
      contains: "ghcr.io/skale-club/xtimator"
  key_links:
    - from: ".github/workflows/build-deploy.yml"
      to: "ghcr.io"
      via: "docker/login-action with GITHUB_TOKEN"
      pattern: "docker/login-action"
    - from: ".github/workflows/build-deploy.yml"
      to: "Dockerfile ARG NEXT_PUBLIC_*"
      via: "build-args from vars.*"
      pattern: "build-args"
    - from: ".github/workflows/build-deploy.yml"
      to: "Coolify"
      via: "curl COOLIFY_WEBHOOK_XTIMATOR"
      pattern: "COOLIFY_WEBHOOK_XTIMATOR"
---

<objective>
Add a GitHub Actions pipeline that builds the Xtimator Docker image on GitHub-hosted runners, pushes it to GHCR, and triggers a Coolify deploy webhook — so Coolify only ever PULLS a prebuilt image and never runs `next build` on the 8GB CX32 VPS again (the on-VPS build OOM-thrashed and froze the whole server).

Purpose: Move the memory-heavy `next build` off the production VPS and into CI, eliminating the server-freeze failure mode while keeping the existing Dockerfile (output:standalone + 5 NEXT_PUBLIC_* ARGs) unchanged.

Output:
- `.github/workflows/build-deploy.yml` — a single concrete WORKING workflow for xtimator that is also a copy-paste template for sibling apps (skaleclub-mail, xphere, xareable, xmart).
- `README-DEPLOY.md` — flow documentation + the exact human Coolify reconfiguration checklist + per-app rollout steps.

NO app code changes. YAML + Markdown only.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@Dockerfile
@.github/workflows/cron-jobs.yml
@.github/workflows/gitleaks.yml
@next.config.ts

<facts>
DECIDED (do not re-litigate):
- Registry = GHCR, image path = ghcr.io/skale-club/xtimator (lowercase).
- Repo = github.com/Skale-Club/xtimator, org = Skale-Club.
- GHCR login uses the built-in GITHUB_TOKEN — NO extra registry secret in CI.
- The 5 NEXT_PUBLIC_* are PUBLIC (inlined into the client bundle), so they live in GitHub Actions Variables (vars.*), NOT secrets.
- Coolify webhook URL lives in GitHub secret COOLIFY_WEBHOOK_XTIMATOR.

The Dockerfile (already on disk) defines exactly these 5 build ARGs at lines 51-55:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- NEXT_PUBLIC_SITE_URL
- NEXT_PUBLIC_TURNSTILE_SITE_KEY

NEXT_PUBLIC_SITE_URL must be EXACTLY `https://xtimator.com` — the old Coolify env value contained a literal `\n`; the workflow must hardcode this value (not read it from vars.*) to guarantee no stray newline/quote is reintroduced. The other 4 come from vars.*.

Existing workflow conventions to match (from cron-jobs.yml / gitleaks.yml):
- `on:` with `push: branches: [main]` + `workflow_dispatch:`
- explicit top-level `permissions:` block
- `runs-on: ubuntu-latest`, named jobs and steps
- secrets/vars referenced only via `${{ secrets.* }}` / `${{ vars.* }}` — never hardcoded
- `actions/checkout@v4`
- a header comment block at the top of the file explaining purpose + required secrets/vars
</facts>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create build-deploy.yml CI pipeline (also a reusable template)</name>
  <files>.github/workflows/build-deploy.yml</files>
  <action>
Create the workflow. Structure it so it is a single concrete WORKING file for xtimator AND a copy-paste template for sibling apps.

Top-of-file header comment block (matching the cron-jobs.yml/gitleaks.yml comment style) must list:
  - Purpose: build the Docker image in CI, push to GHCR, trigger Coolify pull. Never builds on the VPS.
  - "TO REUSE FOR ANOTHER APP, change ONLY these:" then list exactly:
      1. env.IMAGE_NAME (e.g. ghcr.io/skale-club/<app> — lowercase)
      2. env.SITE_URL (the app's canonical https URL, no trailing newline/quotes)
      3. the COOLIFY_WEBHOOK_<APP> secret name referenced in the final step
  - Required GitHub Actions Variables (Settings -> Secrets and variables -> Variables): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_TURNSTILE_SITE_KEY. (NEXT_PUBLIC_SITE_URL is hardcoded via env.SITE_URL, not a Variable.)
  - Required GitHub secret: COOLIFY_WEBHOOK_XTIMATOR (optional until Coolify is wired; step skips if absent).
  - State that these NEXT_PUBLIC_* are PUBLIC build args, NOT secrets.

name: Build and Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

env:
  IMAGE_NAME: ghcr.io/skale-club/xtimator
  # Canonical site URL — hardcoded (NOT a Variable) so no stray newline/quote
  # can be reintroduced. The old Coolify value had a literal \n; do not repeat.
  SITE_URL: https://xtimator.com

Single job `build-and-push`, runs-on: ubuntu-latest, timeout-minutes: 30.

Steps:
  1. actions/checkout@v4
  2. docker/setup-buildx-action@v3
  3. docker/login-action@v3 with:
       registry: ghcr.io
       username: ${{ github.actor }}
       password: ${{ secrets.GITHUB_TOKEN }}
  4. docker/build-push-action@v6 with:
       context: .
       push: true
       tags: |
         ${{ env.IMAGE_NAME }}:latest
         ${{ env.IMAGE_NAME }}:${{ github.sha }}
       cache-from: type=gha
       cache-to: type=gha,mode=max
       build-args: |
         NEXT_PUBLIC_SUPABASE_URL=${{ vars.NEXT_PUBLIC_SUPABASE_URL }}
         NEXT_PUBLIC_SUPABASE_ANON_KEY=${{ vars.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
         NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${{ vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
         NEXT_PUBLIC_SITE_URL=${{ env.SITE_URL }}
         NEXT_PUBLIC_TURNSTILE_SITE_KEY=${{ vars.NEXT_PUBLIC_TURNSTILE_SITE_KEY }}
     (Note: env.IMAGE_NAME is already lowercase, so no extra lowercasing step is needed — but say so in a comment for template-reusers whose org/app names contain capitals: they should keep IMAGE_NAME lowercase.)
  5. Final step "Trigger Coolify deploy" — bash, env: COOLIFY_WEBHOOK: ${{ secrets.COOLIFY_WEBHOOK_XTIMATOR }}. Logic:
       set -u
       if [ -z "${COOLIFY_WEBHOOK:-}" ]; then
         echo "::notice::COOLIFY_WEBHOOK_XTIMATOR not set — skipping Coolify trigger (image is built & pushed). Wire the webhook secret once Coolify is reconfigured."
         exit 0
       fi
       then curl POST the webhook with --fail-with-body, --max-time 30, retries similar to cron-jobs.yml hit() pattern (3 attempts, backoff), echo HTTP code. Workflow MUST still succeed when the secret is absent.

Reference CLAUDE.md secret rules: the file contains NO real secret/key values — only ${{ secrets.* }} / ${{ vars.* }} interpolations and the public SITE_URL.
  </action>
  <verify>
    <automated>node -e "const yaml=require('js-yaml');const fs=require('fs');const d=yaml.load(fs.readFileSync('.github/workflows/build-deploy.yml','utf8'));if(!d.jobs||!d.jobs['build-and-push'])throw new Error('missing build-and-push job');if(!d.permissions||d.permissions.packages!=='write')throw new Error('packages:write missing');console.log('build-deploy.yml OK')"</automated>
  </verify>
  <done>
.github/workflows/build-deploy.yml exists; parses as valid YAML; has on.push.branches=[main] + workflow_dispatch; permissions contents:read + packages:write; build-push-action with both :latest and :${{ github.sha }} tags, type=gha cache, and all 5 NEXT_PUBLIC_* build-args; SITE_URL hardcoded to https://xtimator.com; Coolify webhook step skips gracefully on absent secret; no hardcoded secret values; top env: block + reuse header comment present.
  </done>
</task>

<task type="auto">
  <name>Task 2: Write README-DEPLOY.md (flow + Coolify checklist + per-app rollout)</name>
  <files>README-DEPLOY.md</files>
  <action>
Create README-DEPLOY.md at repo root. Use placeholders only for any secret-shaped value (per CLAUDE.md). Sections:

1. "## How it works" — diagram the new flow: push to main -> GitHub Actions builds image on GitHub runners -> pushes to ghcr.io/skale-club/xtimator:{latest,<sha>} -> triggers Coolify deploy webhook -> Coolify PULLS the prebuilt image. Emphasize: `next build` runs in CI, NEVER on the VPS. State the root problem this fixes (on-VPS build OOM-thrashed the 8GB CX32, freezing Coolify + all apps).

2. "## CRITICAL — order of operations before first push" (put this PROMINENTLY, near the top). State that the commit must NOT be pushed until the human has:
   (a) rebooted/recovered the saturated VPS, AND
   (b) disabled Coolify git auto-deploy / source-build for the app,
   BECAUSE pushing to main while Coolify still source-builds would re-trigger an on-VPS build and re-freeze the server. Commits stay LOCAL until both are done.

3. "## One-time Coolify reconfiguration checklist (human)" — exact steps:
   - Switch the Xtimator app type to "Docker Image" -> image `ghcr.io/skale-club/xtimator:latest`.
   - Add GHCR as a private registry in Coolify: registry `ghcr.io`, username = a GitHub username, password = a GitHub PAT with `read:packages` scope (placeholder: `ghp_<your-pat>`).
   - DISABLE git auto-deploy / source build for the app (no more building from source on the VPS).
   - Copy the Coolify "Deploy Webhook" URL and store it as GitHub repo secret `COOLIFY_WEBHOOK_XTIMATOR` (placeholder shape: `https://coolify.<your-host>/api/v1/deploy?uuid=<uuid>&force=false`).

4. "## GitHub configuration for this repo" — table:
   - Actions Variables (public): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_TURNSTILE_SITE_KEY.
   - Note NEXT_PUBLIC_SITE_URL is hardcoded in the workflow env (https://xtimator.com) — do NOT add it as a Variable, and make sure no trailing newline/quotes anywhere.
   - Secrets: COOLIFY_WEBHOOK_XTIMATOR (optional until Coolify wired). GHCR push uses the built-in GITHUB_TOKEN — no PAT needed in CI (the PAT is only for Coolify to PULL).

5. "## Rollout to sibling apps (skaleclub-mail, xphere, xareable, xmart, ...)" — steps:
   - Copy `.github/workflows/build-deploy.yml` into the sibling repo.
   - Change the 3 values called out in the workflow header comment (IMAGE_NAME, SITE_URL, COOLIFY_WEBHOOK_<APP> secret name).
   - In each sibling repo set the same kind of Actions Variables it needs + its own COOLIFY_WEBHOOK_<APP> secret.
   - In Coolify, do the same one-time reconfiguration for that app.
   - Per-app table: which Variables / which secret each repo needs.

6. "## Out of scope (human follow-ups, not done here)" — list: Coolify panel reconfiguration, VPS swap tuning, container resource limits, Hetzner alerts.

Use placeholders only; never paste real whsec_/sk_/ghp_/rk_ values.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const t=fs.readFileSync('README-DEPLOY.md','utf8');for(const s of ['ghcr.io/skale-club/xtimator','COOLIFY_WEBHOOK_XTIMATOR','read:packages','CRITICAL','sibling']){if(!t.includes(s))throw new Error('missing: '+s)}if(/sk-ant-[A-Za-z0-9]/.test(t)||/whsec_[A-Za-z0-9]/.test(t)||/ghp_[A-Za-z0-9]{20}/.test(t))throw new Error('looks like a real secret leaked');console.log('README-DEPLOY.md OK')"</automated>
  </verify>
  <done>
README-DEPLOY.md exists; documents the push->CI->GHCR->Coolify-pull flow; has a prominent CRITICAL ordering section (reboot VPS + disable Coolify source-build BEFORE pushing); has the one-time Coolify reconfiguration checklist; lists GitHub Variables/Secrets; has per-app rollout steps; lists out-of-scope follow-ups; contains only placeholder secrets.
  </done>
</task>

<task type="auto">
  <name>Task 3: Validate workflow YAML is well-formed and lint-clean</name>
  <files>.github/workflows/build-deploy.yml</files>
  <action>
Validate the workflow offline (act/gh may not run). Use a Node one-liner with js-yaml (already a transitive dep in most Next projects; if `require('js-yaml')` fails, fall back to `npx --yes js-yaml .github/workflows/build-deploy.yml` which parses+prints, or `python -c "import yaml,sys;yaml.safe_load(open('.github/workflows/build-deploy.yml'))"`).

Assert structurally:
  - file parses as YAML
  - on.push.branches includes 'main' and on.workflow_dispatch is present
  - permissions.contents == 'read' and permissions.packages == 'write'
  - jobs['build-and-push'].steps reference docker/login-action, docker/setup-buildx-action, and docker/build-push-action
  - build-push-action `with.tags` contains both ':latest' and 'github.sha'
  - build-push-action `with.build-args` lists all 5 NEXT_PUBLIC_* keys
  - cache-from/cache-to use type=gha
  - the Coolify step references secrets.COOLIFY_WEBHOOK_XTIMATOR and has skip-on-absent logic

Also grep the whole file to assert NO real secret patterns are present (only ${{ secrets.* }} / ${{ vars.* }} interpolations): the strings `sk-ant-`, `whsec_`, `sk_live_`, `ghp_` followed by alphanumerics must NOT appear as literals.

Fix any failure before marking done.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');let yaml;try{yaml=require('js-yaml')}catch(e){console.error('js-yaml not local — run: npx --yes js-yaml .github/workflows/build-deploy.yml');process.exit(2)}const s=fs.readFileSync('.github/workflows/build-deploy.yml','utf8');const d=yaml.load(s);const on=d.on||d['on'];if(!on||!on.push||!on.push.branches.includes('main'))throw new Error('push.main missing');if(!('workflow_dispatch' in on))throw new Error('workflow_dispatch missing');if(d.permissions.contents!=='read'||d.permissions.packages!=='write')throw new Error('permissions wrong');const j=d.jobs['build-and-push'];const txt=JSON.stringify(j);for(const a of ['docker/login-action','docker/setup-buildx-action','docker/build-push-action'])if(!txt.includes(a))throw new Error('missing action: '+a);for(const k of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SITE_URL','NEXT_PUBLIC_TURNSTILE_SITE_KEY'])if(!s.includes(k))throw new Error('missing build-arg: '+k);if(!s.includes('type=gha'))throw new Error('gha cache missing');if(!s.includes('COOLIFY_WEBHOOK_XTIMATOR'))throw new Error('coolify webhook missing');if(/sk-ant-[A-Za-z0-9]/.test(s)||/whsec_[A-Za-z0-9]/.test(s)||/ghp_[A-Za-z0-9]{20}/.test(s))throw new Error('real secret literal detected');console.log('WORKFLOW VALID')"</automated>
  </verify>
  <done>
The Node validator prints WORKFLOW VALID: YAML parses; triggers, permissions, all 3 docker actions, both image tags, all 5 build-args, type=gha cache, and the Coolify webhook reference are all present; no real secret literals detected. (If js-yaml is not locally installed, the documented npx/python fallback is used and passes.)
  </done>
</task>

</tasks>

<verification>
- `.github/workflows/build-deploy.yml` parses as valid YAML and contains the full build-push-Coolify pipeline.
- All 5 NEXT_PUBLIC_* build args wired; NEXT_PUBLIC_SITE_URL hardcoded to https://xtimator.com with no trailing newline/quotes.
- GHCR push via built-in GITHUB_TOKEN; two tags (:latest + :<sha>); GitHub Actions layer cache (type=gha).
- Coolify webhook step skips gracefully when COOLIFY_WEBHOOK_XTIMATOR is unset; workflow still succeeds.
- Workflow is reusable: top env: block + header comment naming the 3 per-app values to change.
- README-DEPLOY.md documents the flow, the CRITICAL pre-push ordering, the Coolify checklist, GitHub config, per-app rollout, and out-of-scope follow-ups — placeholders only.
- No real secrets anywhere (gitleaks pre-commit hook + the validator's literal-secret check both pass).
</verification>

<success_criteria>
- Two files created: `.github/workflows/build-deploy.yml` + `README-DEPLOY.md`.
- No app code changed (YAML + Markdown only).
- Workflow YAML validates well-formed via the Node/js-yaml (or npx/python fallback) check.
- A different engineer could copy the workflow to a sibling repo and, by changing only the 3 documented values + setting that repo's Variables/secret, get the same CI-build-and-push behavior.
- Commits stay LOCAL — the human is clearly instructed (in README-DEPLOY.md and the SUMMARY) to reboot the VPS and disable Coolify source-build BEFORE pushing.
</success_criteria>

<output>
After completion, create `.planning/quick/260531-npx-build-docker-image-in-github-actions-and/260531-npx-SUMMARY.md`.

The SUMMARY must state PROMINENTLY (top of file, as a warning block):
**DO NOT git push these commits yet.** Commits stay local until the human has (1) rebooted/recovered the saturated CX32 VPS and (2) disabled Coolify git auto-deploy / source-build for Xtimator. Pushing to main while Coolify still source-builds will re-trigger an on-VPS `next build` and re-freeze the server. Only after both are done is it safe to push.

Also note the human follow-ups (out of scope here): Coolify panel reconfiguration, VPS swap tuning, container resource limits, Hetzner alerts.
</output>
