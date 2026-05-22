---
status: complete
---

# Summary

Fixed the clients page runtime error caused by an empty-string Radix Select item value.

Verification:
- `npx eslint components/clients/client-sheet.tsx components/app-shell/sidebar.tsx`
- Dev server recompiled and `/clients` returned 200 after the fix.
