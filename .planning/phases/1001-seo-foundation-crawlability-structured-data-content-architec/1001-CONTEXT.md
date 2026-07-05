# Phase 1001: SEO Foundation and Organic Acquisition Readiness - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Raise the production SEO readiness of `xtimator.com` from the audited 4.5/10 baseline to at least 8.5/10. This phase owns technical crawlability, canonical and social metadata, structured data, a curated first content architecture, anonymous-page performance, automated regression gates, and the operational measurement checklist. It does not promise rankings or create an open-ended content-marketing operation.

</domain>

<decisions>
## Implementation Decisions

### Success target and measurement
- **D-01:** Target an implementation-readiness score of at least 8.5/10 and a production Lighthouse SEO score of at least 95.
- **D-02:** Treat indexation and organic acquisition as measured outcomes: Search Console coverage, impressions, clicks, non-brand queries, and conversion paths are tracked at 30/60/90 days.
- **D-03:** Automated checks must protect crawlability, canonical metadata, JSON-LD validity, and route-indexing policy in CI.

### Indexing boundary
- **D-04:** Index only deliberate acquisition surfaces: homepage, legal pages, blog index, published blog posts, and curated industry pages.
- **D-05:** Auth, onboarding, offline, OAuth, invite, application, admin, capture, demo, and tokenized estimate routes are not acquisition pages and must emit `noindex, nofollow`; they must never enter the sitemap.
- **D-06:** `robots.txt` is for crawl guidance, not secret protection or canonicalization. Authentication and authorization remain the security boundary.

### Search and social presentation
- **D-07:** Every indexable URL receives a unique title, concise description, self-canonical, `og:url`, `og:type`, Twitter card, and 1200×630 image metadata with alt text.
- **D-08:** Fix the Meta Sharing Debugger warnings for missing `og:url` and `og:type`. Do not manufacture `fb:app_id`; emit it only when a real Facebook App exists and its ID is configured.
- **D-09:** Use one canonical-origin resolver and one metadata policy so database-managed branding cannot produce conflicting origins or silently omit required fields.

### Content architecture
- **D-10:** Include both technical SEO and scalable content foundations; technical fixes alone are insufficient for a materially higher score.
- **D-11:** Start with a small curated set of substantial US trade pages built from a typed registry and reviewed copy. Do not generate hundreds of thin city/service permutations.
- **D-12:** Blog index and article routes need unique metadata, Article/Breadcrumb schema, meaningful image alt text, and internal links to relevant industry/product paths.

### Performance
- **D-13:** Anonymous acquisition pages should be statically rendered or safely cached. The homepage must not become `private, no-store` merely because its navigation checks the current Supabase user.
- **D-14:** Preserve the current signed-in navigation experience through a client-safe auth enhancement that does not make the entire acquisition response user-specific.

### the agent's Discretion
- Exact helper/module names, schema serialization component, initial industry-page count, copy organization, cache lifetime, and test-file grouping.
- Whether the optional Facebook App ID is represented by an environment variable or platform configuration, provided absence omits the tag.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and phase
- `.planning/PROJECT.md` — product audience, core value, stack, and mobile constraints.
- `.planning/ROADMAP.md` — Phase 1001 goal, requirements, success criteria, waves, and scope.
- `.planning/REQUIREMENTS.md` — SEO-01 through SEO-06.

### Existing implementation
- `app/layout.tsx` — current DB-backed root metadata and canonical-base resolver.
- `app/page.tsx` — homepage auth lookup that currently forces private/no-store behavior.
- `app/blog/page.tsx` — blog index without route-specific metadata.
- `app/blog/[slug]/page.tsx` — article metadata and rendering.
- `lib/queries/blog.ts` — published-post query used by sitemap and content pages.
- `lib/utils/site-url.ts` — existing canonical origin resolution.
- `lib/platform-config.ts` — branding and editable SEO values.
- `scripts/lighthouse.mjs` — existing Lighthouse runner to strengthen into a gate.
- `next.config.ts` — headers, caching, and runtime configuration.

### External standards
- `https://developers.google.com/search/docs/fundamentals/seo-starter-guide` — Google search fundamentals.
- `https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls` — canonical URL guidance.
- `https://nextjs.org/docs/app/getting-started/metadata-and-og-images` — current App Router metadata conventions.
- `https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap` — current sitemap API.
- `https://nextjs.org/docs/app/api-reference/functions/generate-metadata` — metadata, Open Graph, Twitter, robots, and URL composition.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getBranding()` and the admin SEO editor already provide title, description, OG image, and canonical-base inputs.
- `getCanonicalBaseUrl()` already resolves a request-less production origin with tests.
- `getBlogPosts()` / `getBlogPost()` provide the published content source for sitemap and article metadata.
- `scripts/lighthouse.mjs` already captures SEO, performance, accessibility, and best-practices categories.

### Established Patterns
- Next.js App Router server components and Metadata API are already in use.
- Public branding is DB-backed with safe static fallbacks.
- Vitest source-contract tests are common and appropriate for metadata route policy.

### Integration Points
- Root metadata in `app/layout.tsx`.
- New metadata routes in `app/robots.ts` and `app/sitemap.ts`.
- Segment layouts for private noindex inheritance.
- Blog and new industry routes for unique metadata and JSON-LD.
- Homepage navigation/auth boundary for cacheability.

</code_context>

<specifics>
## Specific Ideas

- Production evidence on 2026-07-05: `/robots.txt` and `/sitemap.xml` returned 404; homepage and blog lacked canonicals and JSON-LD; the blog was empty; the homepage response was `private, no-cache, no-store`.
- Meta Sharing Debugger reported missing `og:url`, `og:type`, and `fb:app_id`; the first two are defects, while the third is conditional on owning a Facebook App.
- Preserve the working 301/302 HTTP-to-HTTPS canonical redirect and make every metadata signal agree on `https://xtimator.com`.

</specifics>

<deferred>
## Deferred Ideas

- Ongoing editorial calendar and backlink outreach after the technical/content foundation ships.
- Localization/hreflang for fully translated public acquisition pages.
- Large-scale location/service programmatic SEO, contingent on evidence and genuinely unique content.

</deferred>

---

*Phase: 1001-seo-foundation-crawlability-structured-data-content-architec*
*Context gathered: 2026-07-05*
