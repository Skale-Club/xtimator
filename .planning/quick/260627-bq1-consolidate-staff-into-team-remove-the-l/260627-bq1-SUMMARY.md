---
status: complete
quick_id: 260627-bq1
date: 2026-06-27
commit: aed92966
---

# Quick Task 260627-bq1 Summary

Team is now the single member-management surface.

## Delivered

- Removed the visible Staff settings entry and deleted its obsolete component
  and server actions.
- Preserved `/settings/staff` as a redirect to `/settings/team`.
- Added required full name to Team invitations.
- Persisted invitee names through acceptance into `company_members.display_name`.
- Preserved old pending links with auth-metadata/email fallback names.
- Migrated legacy `staff` membership roles to `member`.
- Kept PDF “Prepared by” attribution scoped by creator and company.

## Verification

- `npm run build`: passed; 74 static pages generated.
- Focused Vitest: 7 files, 62 tests passed.
- Scoped ESLint: passed.
- Production-source TypeScript check: passed.
- Browser automation confirmed the auth gate; authenticated visual inspection
  could not run because the repository auth-state fixture is empty.

## Commit

`aed92966 fix(team): consolidate staff into team`
