# Known Issues

> Bug + perf-regression registry for milestone v3.1.1 onwards. Each UAT or validation test produces an entry here with PASS / FAIL / DEFERRED verdict.

---

## Phase 68 — Hetzner Deploy Readiness (2026-05-15)

### HETZNER-06 — Local Docker validation: **DEFERRED**

**Reason:** Docker Desktop not installed on dev machine (Windows 11). Validation requires `docker --version` to succeed.

**What's shipped:** Dockerfile, docker-compose.yml, Caddyfile, .env.production.example — all syntax-validated by inspection. Multi-stage Node 22 alpine, non-root user, port 3000, restart unless-stopped, named volumes for cert persistence. Image size estimate ~300-400 MB based on similar Next.js standalone images.

**Deferred to:** v3.2 first deploy. The actual `docker build` + `docker run` + `/api/health` curl will happen on the Hetzner server itself per `docs/HETZNER-DEPLOY.md` Section 7. This is acceptable because:
- The Dockerfile patterns are well-understood (multi-stage Node alpine is standard)
- The smoke check is exactly what the runbook performs as Section 8
- Failure on first deploy is recoverable — `docker compose down && fix && docker compose up -d`

**To validate before v3.2:** Install Docker Desktop on dev machine OR run validation directly on the Hetzner server during the v3.2 first deploy.

### PERF-01 — Lighthouse audit: **DEFERRED**

**Reason:** Lighthouse CLI not installed. Chrome DevTools Lighthouse requires running `npm run dev` and manual operation.

**What we know:** Phase 17 (Navigation Performance) shipped React `cache()` + Skeleton loading + Suspense streaming + HoverPrefetchLink. Phase 13 (Visual Identity Polish) handled icon optimization. Baseline expected to be reasonable but not measured for v3.1.1.

**Deferred to:** v3.2 — Lighthouse will run against the deployed `https://xtimator.com` URL (more meaningful than localhost), captured as part of v3.2 Phase 64 (Monitoring) deliverables.

### PERF-02 — Bundle size: **DEFERRED**

**Reason:** `npm run build` fails with `ENOENT: .env.local` because `.env.local` is a symlink to `G:\My Drive\Dev\xtimator\.env.local` (Google Drive) which is currently unmounted on this machine. Build cannot proceed without env file.

**Workarounds tried:** None — fixing the Google Drive mount is out of scope for this plan.

**Deferred to:** v3.2 first deploy — `npm run build` succeeds on the Hetzner server (where the env file is a normal file, not a symlink). Bundle size captured from CI logs at that point.

---

## Triage rules

- **PASS** — verified working, no follow-up
- **FAIL** — blocking, must fix before milestone close
- **FLAGGED** — works but with caveats; documented for future improvement
- **DEFERRED** — out of scope for this milestone, passed forward with explicit rationale and target milestone
