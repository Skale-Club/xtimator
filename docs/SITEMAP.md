# Sitemap Documentation

## Overview

Xtimator uses a **dynamic sitemap** system that automatically generates `sitemap.xml` and `robots.txt` files based on the application's configuration and data.

## Files

### Core Files

- **`app/sitemap.ts`** - Main sitemap generator
- **`app/robots.ts`** - Robots.txt generator
- **`lib/sitemap-config.ts`** - Static route configuration
- **`lib/sitemap-utils.ts`** - Utility functions for URL generation

### Generated Files (accessed via HTTP)

- `/sitemap.xml` - XML sitemap for search engines
- `/robots.txt` - Robots.txt directives for crawlers

## How It Works

### 1. Static Routes

Static application routes are defined in `lib/sitemap-config.ts`:

```typescript
export const SITEMAP_ROUTES: SitemapRoute[] = [
  {
    path: '/',
    priority: 1.0,
    changeFrequency: 'daily',
    description: 'Homepage / Dashboard',
  },
  // ... more routes
]
```

### 2. Dynamic Routes

The sitemap automatically generates routes for:

- **Business Templates**: One route per template (Cleaning, Painting, etc.)
  - Format: `/#services?template={templateId}`
  - Priority: 0.6
  - Frequency: monthly

- **Service Categories**: One route per category within each template
  - Format: `/#services?template={templateId}&category={index}`
  - Priority: 0.5
  - Frequency: monthly

### 3. URL Generation

Base URL is determined in this order:

1. `NEXT_PUBLIC_SITE_URL` environment variable
2. `VERCEL_URL` (for Vercel deployments)
3. `http://localhost:3000` (fallback for development)

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Production example
NEXT_PUBLIC_SITE_URL=https://xtimator.app

# Development example
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Adding New Static Routes

Edit `lib/sitemap-config.ts`:

```typescript
{
  path: '/#new-feature',
  priority: 0.8,
  changeFrequency: 'weekly',
  description: 'New feature description',
}
```

### Priority Guidelines

- **1.0**: Homepage and critical entry points
- **0.8-0.9**: Main features (estimates, customers)
- **0.6-0.7**: Secondary features (services, settings)
- **0.4-0.5**: Tertiary pages (filters, categories)

### Change Frequency Guidelines

- **always**: Changes with every access
- **hourly**: Real-time data
- **daily**: Frequently updated content
- **weekly**: Regular updates
- **monthly**: Stable features
- **yearly**: Static content
- **never**: Archived content

## Robots.txt Behavior

### Production

```
User-agent: *
Allow: /
Sitemap: https://xtimator.app/sitemap.xml
```

### Development/Preview

```
User-agent: *
Disallow: /
Sitemap: http://localhost:3000/sitemap.xml
```

This prevents search engines from indexing development/preview environments.

## Accessing the Sitemap

### Local Development

1. Start the dev server: `bun dev`
2. Visit: http://localhost:3000/sitemap.xml
3. Visit: http://localhost:3000/robots.txt

### Production

- https://xtimator.app/sitemap.xml
- https://xtimator.app/robots.txt

## Sitemap Structure

The generated sitemap includes approximately:

- **10 static routes** (dashboard, estimates, customers, etc.)
- **6 business template routes** (cleaning, painting, landscaping, etc.)
- **15+ category routes** (varies based on templates)

**Total: ~30+ URLs**

## Testing

### Validate Sitemap

Use online validators:
- https://www.xml-sitemaps.com/validate-xml-sitemap.html
- Google Search Console

### Check Robots.txt

```bash
curl http://localhost:3000/robots.txt
```

### Verify URLs

```bash
curl http://localhost:3000/sitemap.xml | grep -o '<loc>.*</loc>'
```

## Deployment

### Vercel

The sitemap is automatically generated during build:

1. Push to main branch
2. Vercel builds and deploys
3. Sitemap is available at `/sitemap.xml`

### Other Platforms

Ensure `NEXT_PUBLIC_SITE_URL` is set in environment variables.

## SEO Best Practices

1. **Submit to Search Engines**
   - Google Search Console
   - Bing Webmaster Tools

2. **Monitor Indexing**
   - Check coverage reports
   - Fix any crawl errors

3. **Update Regularly**
   - Sitemap updates automatically on each deployment
   - No manual intervention needed

## Troubleshooting

### Sitemap Not Updating

1. Clear Next.js cache: `rm -rf .next`
2. Rebuild: `bun build`
3. Restart server: `bun dev`

### Wrong Base URL

1. Check `.env` file exists
2. Verify `NEXT_PUBLIC_SITE_URL` is set correctly
3. Restart the server after changes

### Missing Routes

1. Check `lib/sitemap-config.ts` for static routes
2. Verify `lib/service-templates.ts` for dynamic routes
3. Check the generated sitemap at `/sitemap.xml`

## Future Enhancements

Potential improvements:

- [ ] Add lastmod based on actual content updates
- [ ] Include estimate detail pages (if made public)
- [ ] Add multi-language support (hreflang)
- [ ] Generate separate sitemaps for different content types
- [ ] Add sitemap index for large datasets
- [ ] Include images in sitemap (image sitemap)
