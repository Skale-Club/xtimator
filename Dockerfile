# syntax=docker/dockerfile:1.10
# check=error=true

# =========================================================================
# Stage 1: deps — install production + build dependencies
# =========================================================================
FROM node:24-alpine AS deps

# libc6-compat shim — some npm packages (sharp, pg, native modules) link
# against glibc symbols. alpine ships musl; this shim covers the gap.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy lockfile + manifest only — maximizes Docker layer cache hits when
# only source code changes.
COPY package.json package-lock.json* ./

# Use `npm install` (not `npm ci`) here on purpose. Several deps ship a WASM
# fallback (@tailwindcss/oxide-wasm32-wasi, etc.) that pull @emnapi as a nested
# dependency. npm's lockfile only materializes those nested entries for the
# HOST platform it was generated on, so a Windows-generated package-lock.json
# fails strict `npm ci` on linux/alpine with "Missing @emnapi/core@… from lock
# file". `npm install` reconciles the platform-specific subtree at build time
# from the committed lock, which keeps the build reproducible enough while
# tolerating that cross-platform gap. --ignore-scripts skips the postinstall
# hooks for sharp + unrs-resolver (matches package.json "ignoreScripts").
RUN npm install --ignore-scripts --no-audit --no-fund

# Download the @sentry/cli binary (postinstall was skipped above by --ignore-scripts).
# This binary is needed at build time only for source map upload — not at runtime.
# Runs here in the deps stage so the builder cache layer reuses it on code-only changes.
RUN node node_modules/@sentry/cli/scripts/install.js 2>/dev/null || true

# =========================================================================
# Stage 2: builder — compile Next.js to standalone output
# =========================================================================
FROM node:24-alpine AS builder

WORKDIR /app

# Copy node_modules from deps stage + the full source.
# The full COPY happens here, AFTER deps is cached.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next telemetry at build time (no outbound calls during build).
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* vars are inlined into the CLIENT bundle by `next build` AT
# BUILD TIME, so they must be present as ENV during the build — not just at
# runtime. Coolify must supply these as Docker BUILD ARGUMENTS (--build-arg),
# not just runtime env. These are NOT secrets: NEXT_PUBLIC_* are public by
# definition (embedded in the client JS), so they are safe as build args.
# The neutral ARG names keep Docker's secret detector meaningful: these values
# are intentionally public, while names containing KEY would be false positives.
# They are mapped to the framework names only for the build process below.
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_VALUE
ARG PUBLIC_SUPABASE_PUBLISHABLE_VALUE
ARG PUBLIC_SITE_URL
ARG PUBLIC_TURNSTILE_SITE_VALUE
ARG DEPLOYMENT_VERSION

# NEXT_PUBLIC_SENTRY_DSN is inlined into the browser bundle — must be a build arg.
# SENTRY_DSN (server-side, no NEXT_PUBLIC_) is NOT a build arg — it is a runtime
# env var set in Coolify and read by the Node.js process at request time.
# SENTRY_ORG / SENTRY_PROJECT are needed by withSentryConfig to upload source maps.
ARG PUBLIC_SENTRY_DSN
ARG SENTRY_ORG
ARG SENTRY_PROJECT

# Build. SENTRY_AUTH_TOKEN is mounted as a Docker secret so it is never baked
# into any image layer. withSentryConfig reads it from env during `next build`
# to upload source maps to Sentry; the token is gone after this RUN step.
# Requires output: 'standalone' in next.config.ts to produce .next/standalone/server.js.
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    NEXT_PUBLIC_SUPABASE_URL="$PUBLIC_SUPABASE_URL" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="$PUBLIC_SUPABASE_ANON_VALUE" \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$PUBLIC_SUPABASE_PUBLISHABLE_VALUE" \
    NEXT_PUBLIC_SITE_URL="$PUBLIC_SITE_URL" \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY="$PUBLIC_TURNSTILE_SITE_VALUE" \
    NEXT_PUBLIC_SENTRY_DSN="$PUBLIC_SENTRY_DSN" \
    DEPLOYMENT_VERSION="$DEPLOYMENT_VERSION" \
    SENTRY_ORG="$SENTRY_ORG" \
    SENTRY_PROJECT="$SENTRY_PROJECT" \
    npm run build

# =========================================================================
# Stage 3: runner — minimal runtime image
# =========================================================================
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Pre-launch audit fix: /api/health reads process.env.GIT_SHA to report which
# commit is live (app/api/health/route.ts), but nothing ever set it — every
# deploy reported commit: "unknown", making the "which version is live" check
# in the deploy runbook useless. DEPLOYMENT_VERSION (used by next.config.ts's
# skew-protection deploymentId) already carries the build SHA — reuse it.
ARG DEPLOYMENT_VERSION
ENV GIT_SHA=$DEPLOYMENT_VERSION

# Create unprivileged user — runs as uid/gid 1001:1001 (HETZNER-01 non-root).
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy public assets verbatim (NOT in standalone output).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy standalone server + the static directory.
# The standalone output already contains a minimal node_modules with
# only the packages each route actually traces — the full node_modules
# from deps stage is intentionally NOT copied.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Security Review S13: container healthcheck so orchestrators can route around
# an unhealthy instance. Uses /api/health/live — a PURE LIVENESS probe (no DB,
# no storage). This gate must only fail when the Node process itself is down;
# gating it on Supabase (the old /api/health deep check) meant any DB/storage
# blip marked the container unhealthy → Coolify pulled it from the proxy →
# "no available server" with the app running fine. Fast interval so a freshly
# deployed container is marked healthy within seconds (short zero-downtime gap).
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# The standalone server entry — DO NOT use `npm start`, which requires
# node_modules + `next` binary that aren't present in this stage.
CMD ["node", "server.js"]
