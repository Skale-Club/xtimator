# How to Add New Routes to the Sitemap

This guide shows you how to add new routes to the sitemap.

## Adding Static Routes

Edit `lib/sitemap-config.ts` and add a new entry to `SITEMAP_ROUTES`:

```typescript
export const SITEMAP_ROUTES: SitemapRoute[] = [
  // ... existing routes
  {
    path: '/#your-new-route',
    priority: 0.8,
    changeFrequency: 'weekly',
    description: 'Description of your new route',
  },
]
```

### Route Configuration

- **path**: The URL path (use `/#` for SPA hash routes)
- **priority**: Importance (0.0 to 1.0)
- **changeFrequency**: How often the content changes
- **description**: Optional note for documentation

## Adding Dynamic Routes

Dynamic routes are automatically generated from data sources.

### Example: Adding Routes from a New Data Source

Edit `app/sitemap.ts`:

```typescript
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl()
  const currentDate = getCurrentDate()

  // ... existing code

  // Add your new dynamic routes
  const yourNewRoutes = yourDataSource.map(item => ({
    url: `${baseUrl}/#your-view?id=${item.id}`,
    lastModified: currentDate,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  return [
    ...staticRoutes,
    ...templateRoutes,
    ...categoryRoutes,
    ...yourNewRoutes, // Add your new routes here
  ]
}
```

## Testing Your Changes

1. **Run the test script:**
   ```bash
   bun run scripts/test-sitemap.ts
   ```

2. **Check in browser:**
   - Start dev server: `bun dev`
   - Visit: http://localhost:3000/sitemap.xml

3. **Verify your route appears:**
   - Look for your new URL in the output
   - Check priority and frequency are correct

## Examples

### Example 1: Add a Help Page

```typescript
{
  path: '/#help',
  priority: 0.7,
  changeFrequency: 'monthly',
  description: 'Help and documentation',
}
```

### Example 2: Add Routes for Each Customer

```typescript
// In app/sitemap.ts
const customerRoutes = customers.map(customer => ({
  url: `${baseUrl}/#customer/${customer.id}`,
  lastModified: customer.updatedAt || currentDate,
  changeFrequency: 'weekly' as const,
  priority: 0.5,
}))
```

### Example 3: Add Routes with Query Parameters

```typescript
{
  path: '/#estimates?status=pending',
  priority: 0.7,
  changeFrequency: 'daily',
  description: 'Pending estimates filter',
}
```

## Common Pitfalls

### ❌ Don't forget the hash for SPA routes

```typescript
// Wrong
path: '/estimates'

// Correct
path: '/#estimates'
```

### ❌ Priority must be between 0.0 and 1.0

```typescript
// Wrong
priority: 1.5

// Correct
priority: 0.8
```

### ❌ Must use 'as const' for changeFrequency in dynamic routes

```typescript
// Wrong
changeFrequency: 'weekly'

// Correct
changeFrequency: 'weekly' as const
```

## Best Practices

1. **Group related routes** with similar priorities
2. **Use descriptive descriptions** for future reference
3. **Set realistic change frequencies** (don't use 'always' unless truly necessary)
4. **Test after adding routes** to verify they appear correctly
5. **Keep priorities relative** to other routes in the app

## Need Help?

- Check the main documentation: `docs/SITEMAP.md`
- Review existing routes in `lib/sitemap-config.ts`
- Run the test script to debug issues
