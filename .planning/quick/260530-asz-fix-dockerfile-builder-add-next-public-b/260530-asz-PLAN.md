---
phase: quick-260530-asz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [Dockerfile]
autonomous: true
requirements: [DOCKER-NEXTPUBLIC-01]
must_haves:
  truths:
    - "Coolify build inlines real values for all 5 NEXT_PUBLIC_* vars into the client bundle"
    - "A missing NEXT_PUBLIC_* build arg fails loudly (no stale default baked in)"
  artifacts:
    - path: "Dockerfile"
      provides: "Builder stage with 5 ARG + 5 ENV NEXT_PUBLIC_* before the build"
      contains: "ARG NEXT_PUBLIC_SUPABASE_URL"
  key_links:
    - from: "Dockerfile builder ARG/ENV block"
      to: "RUN npm run build"
      via: "ENV exported before build so next build inlines into client bundle"
      pattern: "ENV NEXT_PUBLIC_.*\\$NEXT_PUBLIC_"
---

<objective>
Fix the Dockerfile builder stage so Next.js inlines the 5 `NEXT_PUBLIC_*` build-time vars into the client bundle during `npm run build`.

Purpose: Xtimator is migrating off Vercel to self-hosted Coolify (Docker). `NEXT_PUBLIC_*` vars are inlined into the CLIENT bundle by Next.js AT BUILD TIME. The current builder stage does not declare them as ARG nor export them as ENV before `RUN npm run build`, so Coolify-built images ship `undefined` for these — breaking the browser Supabase client and Cloudflare Turnstile widget.

Output: Updated `./Dockerfile` builder stage with 5 ARG declarations + 5 ENV promotions placed between `ENV NEXT_TELEMETRY_DISABLED=1` and `RUN npm run build`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@./Dockerfile

<interfaces>
<!-- Current builder stage (Dockerfile lines 23-40). The new block goes between line 36 and line 40. -->
```
# Stage 2: builder — compile Next.js to standalone output
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
```

The 5 vars (names exact, confirmed present in production env):
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- NEXT_PUBLIC_SITE_URL
- NEXT_PUBLIC_TURNSTILE_SITE_KEY
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add 5 NEXT_PUBLIC_* ARG + ENV promotions to builder stage</name>
  <files>Dockerfile</files>
  <action>
    Edit the builder stage (Stage 2) of `./Dockerfile`. Insert a new block BETWEEN the existing
    `ENV NEXT_TELEMETRY_DISABLED=1` line and the `RUN npm run build` line.

    The block has three parts, in this order:

    1. A short explanatory comment (2-4 lines) covering the non-obvious Next.js behavior:
       NEXT_PUBLIC_* vars are inlined into the CLIENT bundle at BUILD TIME by `next build`,
       so they must be present as ENV during the build (not just at runtime). Note that Coolify
       must supply these as Docker BUILD ARGUMENTS (not just runtime env). State that these are
       NOT secrets — NEXT_PUBLIC_* are public by definition (embedded in client JS), so they are
       safe as build args.

    2. Five `ARG` declarations, one per var, with NO default value (keep them empty so a missing
       value fails loudly rather than baking a stale default):
         ARG NEXT_PUBLIC_SUPABASE_URL
         ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
         ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
         ARG NEXT_PUBLIC_SITE_URL
         ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY

    3. Five `ENV` promotions, one per var, promoting each ARG into the build environment:
         ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
         ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
         ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
         ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
         ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

    CONSTRAINTS — do NOT change anything else:
    - Do NOT hardcode any actual value (no real URLs, keys, or site keys) — ARG lines stay empty,
      ENV lines only reference the matching $ARG. This is a build-arg WIRING change only; per the
      project secret-handling rule, never bake real values into the Dockerfile.
    - Do NOT add default values to the ARG lines (e.g. `ARG FOO=bar` is wrong here).
    - Do NOT touch `node:24-alpine`, the deps stage, the runner stage, the HEALTHCHECK, the CMD,
      `NEXT_TELEMETRY_DISABLED`, `output: 'standalone'` expectations, or any COPY/USER/EXPOSE line.
    - The new block must appear BEFORE `RUN npm run build` (the inlining only happens if ENV is set
      before the build runs).

    This is a Docker build-arg wiring change only. It cannot be runtime-verified without a full
    `docker build`; verification is by file inspection (see <verify>).
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('Dockerfile','utf8');const vars=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SITE_URL','NEXT_PUBLIC_TURNSTILE_SITE_KEY'];const errs=[];const buildIdx=s.indexOf('RUN npm run build');if(buildIdx<0)errs.push('RUN npm run build not found');for(const v of vars){const argRe=new RegExp('^ARG '+v+'\\\\s*$','m');const am=s.match(argRe);if(!am)errs.push('missing bare ARG '+v);else if(s.indexOf(am[0])>buildIdx)errs.push('ARG '+v+' after build');const envRe=new RegExp('^ENV '+v+'=\\\\$'+v+'\\\\s*$','m');const em=s.match(envRe);if(!em)errs.push('missing ENV '+v+'=$'+v);else if(s.indexOf(em[0])>buildIdx)errs.push('ENV '+v+' after build');if(new RegExp('^ARG '+v+'=','m').test(s))errs.push('ARG '+v+' has a default value (must be empty)');}if(!/node:24-alpine AS builder/.test(s))errs.push('builder base node:24-alpine changed');if(!/CMD \\[\"node\", \"server.js\"\\]/.test(s))errs.push('runner CMD changed');if(errs.length){console.error('FAIL:\\n'+errs.join('\\n'));process.exit(1)}console.log('PASS: all 5 ARG (bare) + 5 ENV promotions present, before build, no hardcoded values, invariants intact')"</automated>
  </verify>
  <done>
    Builder stage contains all 5 bare `ARG NEXT_PUBLIC_*` lines (no defaults) and all 5
    `ENV NEXT_PUBLIC_*=$NEXT_PUBLIC_*` promotions, all positioned before `RUN npm run build`,
    with an explanatory comment, no hardcoded values, and node:24-alpine / runner CMD / HEALTHCHECK
    / deps stage untouched. The verify command prints PASS.
  </done>
</task>

</tasks>

<verification>
Run the Task 1 verify command. It confirms, by file inspection (the only feasible verification without a full `docker build`):
(a) all 5 ARG lines present in the builder stage,
(b) all 5 ENV promotions present,
(c) ARG + ENV all appear BEFORE `RUN npm run build`,
(d) no defaults on ARG lines and no hardcoded values,
(e) `node:24-alpine` builder base and runner `CMD ["node", "server.js"]` invariants untouched.
</verification>

<success_criteria>
- `./Dockerfile` builder stage wires all 5 NEXT_PUBLIC_* vars as build args promoted to ENV before `npm run build`.
- A missing build arg yields an empty value (fails loudly at app boot) rather than a stale baked default.
- No secrets or real values committed; all other Dockerfile stages and invariants unchanged.
- Verify command prints PASS.
</success_criteria>

<output>
After completion, create `.planning/quick/260530-asz-fix-dockerfile-builder-add-next-public-b/260530-asz-SUMMARY.md`
</output>
