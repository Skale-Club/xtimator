# Local development notes

## Signing in on localhost

`GET http://localhost:9633/api/dev/login` signs in as the first platform admin of the
development database (Supabase `prmqgcrnpuvpzruyzvuv`). Options:

- `?email=a@b.com` signs in as that account
- `&to=/academy` sets the landing path (same-site paths only)

The route answers 404 unless `NODE_ENV=development` and the request is addressed to
`localhost` / `127.0.0.1`. `proxy.ts` lets it through only in development.

## Academy sample course

Set `ACADEMY_FIXTURES=1` in `.env.local` (development only) to get a built-in sample
course (vertical video, horizontal video, text-only lesson, plus a Portuguese
translation) without a Notion token. `ACADEMY_INCLUDE_DRAFTS=1` also shows
unpublished Notion rows. Both are ignored in production.

## `/storage/...` images 404 on localhost (logo, landing images)

Symptom: every `/storage/{bucket}/{key}` request returns Next's HTML 404 page, and
`app/storage/[bucket]/[...key]/route.ts` never compiles (no `Compiling /storage/...`
line in the dev log).

Cause: the persistent Turbopack cache (kept between runs since `b420116a`) can hold a
stale app-route tree that does not include the storage route.

Fix, in order:
1. `touch "app/storage/[bucket]/[...key]/route.ts"` (no restart needed).
2. If it persists: stop the dev server, delete `.next/dev/cache`, start it again.

Once the route runs, dev assets resolve through R2 (if `S3_*` is set), then Supabase
dev storage, then the read-only fallback to https://xtimator.com
(`lib/storage/dev-remote.ts`).
