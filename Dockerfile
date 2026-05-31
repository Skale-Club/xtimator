# syntax=docker/dockerfile:1.7

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
# ARG lines stay empty (no defaults) so a missing value fails loudly at app
# boot rather than baking a stale default into the bundle.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

# Build. Requires output: 'standalone' in next.config.ts to produce
# .next/standalone/server.js — verified by Task 1.
RUN npm run build

# =========================================================================
# Stage 3: runner — minimal runtime image
# =========================================================================
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

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
# an unhealthy instance. Hits /api/health, which exercises DB + Redis.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# The standalone server entry — DO NOT use `npm start`, which requires
# node_modules + `next` binary that aren't present in this stage.
CMD ["node", "server.js"]
