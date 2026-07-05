# Phase 1001: SEO Foundation and Organic Acquisition Readiness - Research

**Researched:** 2026-07-05
**Domain:** Next.js App Router technical SEO and SaaS organic acquisition
**Confidence:** HIGH

<user_constraints>
## User Constraints

- Target at least 8.5/10 readiness and Lighthouse SEO ≥95.
- Index only intentional acquisition surfaces.
- Include curated industry content, not thin mass-generated pages.
- Fix `og:url` and `og:type`; omit `fb:app_id` unless real.
- Preserve anonymous cacheability and signed-in navigation behavior.
</user_constraints>

<research_summary>
## Summary

Next.js 16 already supplies the primitives this phase needs: `Metadata`, `generateMetadata`, `MetadataRoute.Robots`, `MetadataRoute.Sitemap`, segment-level robots directives, and file/config-based social metadata. No new SEO library is necessary. The safest architecture is one canonical-origin helper, an explicit indexable-route policy, metadata factories for public pages, and JSON-LD objects serialized in server components.

Google treats redirects and `rel=canonical` as strong canonical signals and sitemap inclusion as a supporting signal. These must agree. Robots exclusions are crawl guidance, not a security or canonicalization mechanism. The current production gap is therefore structural: missing metadata routes/canonicals/schema, private rendering on acquisition pages, and insufficient public content.

**Primary recommendation:** build a typed SEO policy layer on native Next.js APIs, then add a deliberately small, high-value content set and production measurement gates.
</research_summary>

<architecture_patterns>
## Architecture Patterns

### Responsibility map

| Capability | Primary tier | Secondary tier |
|------------|--------------|----------------|
| Canonical/search/social metadata | Frontend server | CDN/static |
| Robots and sitemap | Frontend server | Search crawlers |
| JSON-LD | Frontend server | Search parsers |
| Industry/blog content | Frontend server | Database/storage |
| Lighthouse/index monitoring | CI/operations | Production |

### Recommended structure

```text
lib/seo/
  metadata.ts
  structured-data.ts
  route-policy.ts
  industries.ts
components/seo/
  json-ld.tsx
app/
  robots.ts
  sitemap.ts
  industries/[slug]/page.tsx
```

### Key patterns

- Self-canonical public pages derive URLs from `getCanonicalBaseUrl()`.
- Private route-group layouts inherit `robots: { index: false, follow: false }`.
- Sitemap is an allowlist assembled from static public routes, curated industries, and published blog posts.
- JSON-LD values reuse branding/content sources and are rendered with safe JSON serialization.
- Industry pages come from a typed curated registry and `generateStaticParams`, not arbitrary query parameters.
</architecture_patterns>

<common_pitfalls>
## Common Pitfalls

1. **Robots as security:** disallowed URLs can still appear without content. Keep auth/RLS authoritative and emit noindex on reachable private pages.
2. **Conflicting canonicals:** DB branding, environment origin, sitemap, and OG URLs can diverge. Resolve one canonical base and test agreement.
3. **Nested metadata replacement:** child Open Graph objects can replace parent fields. Public metadata factories must emit complete required nested fields.
4. **Thin programmatic pages:** multiplying near-duplicate trade/city pages creates index bloat. Curate substantial trade pages and add new entries only with unique value.
5. **Dynamic homepage by incidental auth:** reading the session in the root page prevents public caching. Move auth-aware enhancement out of the anonymous server render.
6. **Schema that describes invisible content:** structured data must match visible page content and should be validated in tests and production tools.
</common_pitfalls>

<verification_strategy>
## Verification Strategy

- Unit/source-contract tests for route policy, metadata factories, sitemap membership, and noindex layouts.
- JSON-LD parse tests with required-property assertions.
- Production HTTP smoke tests for 200 metadata routes, canonical agreement, and cache headers.
- Lighthouse gate on homepage plus one industry/blog route.
- Manual Search Console URL inspection and sitemap submission after deployment.
- Meta Sharing Debugger rescrape of homepage and representative article.
</verification_strategy>

<sources>
## Sources

### Primary
- https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- https://nextjs.org/docs/app/getting-started/metadata-and-og-images
- https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls

### Production evidence
- `https://xtimator.com/` — 200, correct title/description but no canonical/JSON-LD and private no-store response.
- `https://xtimator.com/robots.txt` — 404 on 2026-07-05.
- `https://xtimator.com/sitemap.xml` — 404 on 2026-07-05.
- Meta Sharing Debugger user capture — missing `og:url`, `og:type`, and conditional `fb:app_id`.
</sources>

---

*Phase: 1001-seo-foundation-crawlability-structured-data-content-architec*
*Research completed: 2026-07-05*
*Ready for planning: yes*
