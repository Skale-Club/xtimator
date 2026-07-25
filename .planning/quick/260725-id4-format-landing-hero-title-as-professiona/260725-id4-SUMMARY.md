---
quick_id: 260725-id4
status: complete
commit: 6ec8a5aa
---

# Quick Task 260725-id4 Summary

The landing hero headline now uses the requested responsive composition from
820px upward:

1. `Professional`
2. `estimates in seconds.`

The middle tier title increased from `42–46px` to `48–54px`. Its text column
grew from 48% to 54%, while the foreground image moved right so the larger
second line remains clear of the people.

## Verification

- Landing unit suite: 10/10 passed.
- TypeScript (`tsconfig.ci.json`): passed.
- Optimized production build: passed.
- Playwright at 820, 872, 900, 1023, 1024, and 1440px: exactly two title
  lines at every tablet/desktop width, zero console errors.
- At the tightest 820px boundary, the second line retains 5px clearance from
  the visible foreground image.
