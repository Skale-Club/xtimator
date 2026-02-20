# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Xtimator is a professional estimate/quotation app for service professionals. It's a client-side SPA built with Next.js App Router — all data is stored in browser localStorage via Zustand. No backend API exists yet (Supabase integration planned).

## Commands

- `bun install` — install dependencies
- `bun dev` — start dev server
- `bun build` — production build
- `bun lint` — run ESLint

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript (strict)
- **Styling**: Tailwind CSS 4 via PostCSS, CSS variables for theming
- **Components**: shadcn/ui (New York style) with Radix UI primitives, Lucide icons
- **State**: Zustand with localStorage persistence (`xtimator-storage` key)
- **Forms**: React Hook Form + Zod validation
- **Package manager**: Bun

## Architecture

**Routing is state-based, not file-based.** The app has a single page (`app/page.tsx`) that renders `AppShell → MainApp`. `MainApp` manages a `currentView` state variable that switches between 7 views. There are no Next.js file-based routes beyond the root page.

**Key files:**
- `lib/store.ts` — Zustand store managing all app state (user, categories, services, customers, estimates, settings). This is the single source of truth.
- `lib/types.ts` — All TypeScript interfaces (User, ServiceCategory, ServiceItem, Customer, Estimate, EstimateLineItem, AppSettings)
- `lib/service-templates.ts` — Pre-built service catalog templates for 6 business types (cleaning, painting, landscaping, electrical, plumbing, handyman)
- `lib/utils.ts` — `cn()` class helper and `formatCurrency()` utility
- `lib/sitemap-config.ts` — Sitemap static route configuration
- `lib/sitemap-utils.ts` — SEO and URL generation utilities
- `components/main-app.tsx` — Central view router and navigation logic
- `components/views/` — 7 view components (dashboard, estimates, estimate-creator, estimate-detail, customers, services, settings)
- `components/navigation/bottom-nav.tsx` — Mobile bottom navigation with FAB
- `components/ui/` — shadcn/ui components (do not edit manually; use `npx shadcn@latest add <component>`)
- `app/sitemap.ts` — Dynamic sitemap generator
- `app/robots.ts` — Dynamic robots.txt generator

**Path alias:** `@/*` maps to the repository root.

## SEO & Sitemap

The app uses a **dynamic sitemap system** that automatically generates sitemap.xml and robots.txt:
- Static routes defined in `lib/sitemap-config.ts`
- Dynamic routes generated from `lib/service-templates.ts` (business templates and categories)
- Accessible at `/sitemap.xml` and `/robots.txt`
- Base URL configured via `NEXT_PUBLIC_SITE_URL` environment variable
- See `docs/SITEMAP.md` for detailed documentation

## Conventions

- All user-facing text is in English
- Default currency is USD ($)
- Theme primary color is teal (#0D9488)
- Dark mode is supported via `next-themes`
- The onboarding flow exists but is currently disabled in `app-shell.tsx`
- `next.config.mjs` ignores TypeScript build errors — do not rely on `bun build` to catch type issues; run `tsc` separately if needed
