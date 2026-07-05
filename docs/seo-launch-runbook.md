# SEO launch and measurement runbook

## Automated release gate

Run after the production container is healthy:

```bash
npm run audit:seo:production
npm run audit:lighthouse -- https://xtimator.com/ https://xtimator.com/industries/general-contractors
```

Pass criteria:

- `/robots.txt` and `/sitemap.xml` return 200.
- Public pages have self-canonicals, `og:url`, `og:type`, Twitter cards, and parseable JSON-LD.
- Private/demo routes emit `noindex, nofollow`.
- Public acquisition responses are not `private` or `no-store`.
- Lighthouse desktop lab gate: SEO ≥95, performance ≥85, accessibility ≥85.

Track mobile field data separately in Search Console/Core Web Vitals. The first
local mobile homepage baseline was 78 and should trend upward without weakening
the desktop release gate.

If metadata disagrees on the origin, stop and correct `APP_ORIGIN` or `NEXT_PUBLIC_SITE_URL` before requesting indexing. If performance falls below the gate, compare the current report with the previous deploy and roll back when the regression is release-caused.

## Search engine setup

Owner: platform owner.

1. In Google Search Console, add `xtimator.com` as a Domain property and complete DNS verification.
2. Submit `https://xtimator.com/sitemap.xml`.
3. Inspect and request indexing for the homepage, one industry page, and one published blog post.
4. In Bing Webmaster Tools, import the verified Search Console property or verify the domain, then submit the same sitemap.
5. Record the verification date and account owner in the private operations system—never in this repository.

Expected result: URLs are eligible for indexing, canonical selection matches the submitted HTTPS URL, and no private route appears in coverage reports.

## Rich-result and social verification

1. Test the homepage, one industry page, and one article with Google Rich Results Test or Schema Markup Validator.
2. In Meta Sharing Debugger, rescrape those URLs.
3. Confirm `og:url`, `og:type`, title, concise description, and the 1200×630 image preview.
4. `fb:app_id` may remain absent unless Xtimator owns and configures a real Facebook App.
5. Check the same representative URLs in LinkedIn Post Inspector.

## Baseline

Export or record on launch day:

- Indexed public URLs versus sitemap URLs.
- Organic impressions, clicks, CTR, and average position.
- Brand versus non-brand queries.
- Impressions and clicks by homepage, industry pages, and blog.
- Organic visits reaching demo/signup and completed signup conversions.
- Lighthouse scores for the two gate URLs.

## 30 / 60 / 90 day loop

### Day 30

- Resolve exclusions, duplicate canonical choices, soft 404s, or schema errors.
- Improve titles/descriptions on pages receiving impressions but weak CTR without changing intent.
- Confirm private routes remain absent from the index.

### Day 60

- Compare non-brand query growth by trade.
- Expand only pages showing real demand; publish supporting articles that answer those queries.
- Review conversion from organic landing page to demo/signup.

### Day 90

- Compare clicks, qualified signups, and conversions against launch baseline.
- Keep, consolidate, or rewrite pages based on demand and conversion—not page count.
- Consider location/service SEO only when unique local evidence and content can be maintained.

## Incident response

- Wrong canonical or private page indexed: fix metadata/route policy, deploy, and request recrawl. Use removals only for urgent temporary hiding.
- Sitemap 5xx/404: roll back or repair before publishing more URLs.
- Social preview stale: verify raw tags, then rescrape; scraper caches are external and may lag.
- Ranking volatility without technical errors: do not churn URLs. Review query/page evidence over several weeks.
