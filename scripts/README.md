# Scripts

This directory contains utility scripts for testing and development.

## Available Scripts

### `test-sitemap.ts`

Tests the sitemap generation locally without starting the dev server.

**Usage:**
```bash
bun run scripts/test-sitemap.ts
```

**Output:**
- Total number of URLs in the sitemap
- URLs grouped by priority
- Robots.txt configuration

**Use cases:**
- Verify sitemap generation during development
- Check that new routes are being included
- Debug sitemap issues
- Preview robots.txt configuration

## Adding New Scripts

1. Create a new `.ts` file in this directory
2. Add TypeScript code with proper imports
3. Run with `bun run scripts/your-script.ts`
4. Document it in this README
