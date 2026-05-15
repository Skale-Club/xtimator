# syntax=docker/dockerfile:1.7

# =========================================================================
# Stage 1: deps — install production + build dependencies
# =========================================================================
FROM node:22-alpine AS deps

# libc6-compat shim — some npm packages (sharp, pg, native modules) link
# against glibc symbols. alpine ships musl; this shim covers the gap.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy lockfile + manifest only — maximizes Docker layer cache hits when
# only source code changes.
COPY package.json package-lock.json* ./

# npm ci is deterministic + faster than npm install in CI/Docker contexts.
# --ignore-scripts skips the postinstall hooks for sharp + unrs-resolver
# (matches the "ignoreScripts" array in package.json — same packages).
RUN npm ci --ignore-scripts

# =========================================================================
# Stage 2: builder — compile Next.js to standalone output
# =========================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy node_modules from deps stage + the full source.
# The full COPY happens here, AFTER deps is cached.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next telemetry at build time (no outbound calls during build).
ENV NEXT_TELEMETRY_DISABLED=1

# Build. Requires output: 'standalone' in next.config.ts to produce
# .next/standalone/server.js — verified by Task 1.
RUN npm run build

# =========================================================================
# Stage 3: runner — minimal runtime image
# =========================================================================
FROM node:22-alpine AS runner

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

# The standalone server entry — DO NOT use `npm start`, which requires
# node_modules + `next` binary that aren't present in this stage.
CMD ["node", "server.js"]
