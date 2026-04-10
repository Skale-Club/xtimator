---
phase: 07-pdf-sharing-email-settings
plan: 04
subsystem: settings
tags: [settings, company, notifications, account, forms]
dependency_graph:
  requires: [companies-table, supabase-auth, logo-uploader]
  provides: [settings-page, company-settings-actions, account-management]
  affects: [dashboard, pdf-generation, share-page]
tech_stack:
  added: []
  patterns: [FormData-for-file-upload, switch-toggles, alert-dialog-confirm, password-verify-then-update]
key_files:
  created:
    - app/(app)/settings/page.tsx
    - components/settings/company-info-form.tsx
    - components/settings/defaults-form.tsx
    - components/settings/notifications-form.tsx
    - components/settings/account-section.tsx
    - lib/actions/settings.ts
    - lib/queries/company.ts
  modified: []
decisions:
  - "Logo upload in settings reuses LogoUploader component from onboarding"
  - "Tax rate stored as decimal 0-1, displayed as percentage 0-100 in UI"
  - "changePassword verifies current password via signInWithPassword before updating"
  - "Notification toggles use save button for consistency with other sections"
  - "Delete account uses service role admin API with FK CASCADE cleanup"
metrics:
  duration: 4min
  completed: "2026-04-10T18:11:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 7
  files_modified: 0
---

# Phase 7 Plan 4: Settings Page Summary

Full settings page with company info, estimate defaults, notification preferences, and account management -- all editable via react-hook-form with zod validation and server actions.

## What Was Built

### Data Layer (lib/queries/company.ts)
- `getCompanySettings` query loads full company row by user_id
- `CompanySettings` type exported for use across settings components

### Server Actions (lib/actions/settings.ts)
- `updateCompanySettings(FormData)` -- handles all company fields plus logo upload to Supabase Storage
- `updateDefaults` -- validates and saves tax rate (0-1 decimal), payment/warranty terms, validity days
- `updateNotifications` -- saves notify_on_view/accept/decline boolean preferences
- `changePassword` -- verifies current password via signInWithPassword, then updates
- `changeEmail` -- triggers Supabase confirmation email flow
- `deleteAccount` -- uses service role admin API; FK CASCADE deletes company/projects/etc.

### Settings Page (app/(app)/settings/page.tsx)
- Server component with auth check (getClaims pattern)
- Loads company settings and passes to four section components
- max-w-3xl centered layout with vertical card stack

### Company Info Form (components/settings/company-info-form.tsx)
- All company fields: name, owner, phone, email, website, industry, address, city, state, zip, license, insurance
- Logo uploader reused from onboarding component
- Brand color picker with hex display
- FormData submission for file upload support

### Defaults Form (components/settings/defaults-form.tsx)
- Tax rate displayed as percentage (0-100), converted to decimal (0-1) on save
- Payment terms and warranty terms as textarea
- Validity period in days with suffix indicator

### Notifications Form (components/settings/notifications-form.tsx)
- Three Switch toggles for view/accept/decline notifications
- Save button for consistency with other sections

### Account Section (components/settings/account-section.tsx)
- Change Password with current password verification and confirm match
- Change Email with confirmation email flow
- Delete Account with AlertDialog confirmation and destructive styling

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all data flows are wired to Supabase via server actions.

## Verification

- TypeScript strict compilation: PASSED (no errors from settings files)
- Settings nav link already exists in NAV_ITEMS (verified)
- All 6 server actions export correctly
- All 4 section components render inside Card layout

## Self-Check: PASSED

All 7 files created and verified via TypeScript compilation. No stubs, no missing exports. Commits deferred to orchestrator due to git permission restrictions.
