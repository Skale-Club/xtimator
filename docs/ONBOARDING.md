# Onboarding

The active first-run flow has six questions:

1. **Tool language** — English, Portuguese (BR) or Spanish. The interface changes immediately and subsequent questions follow the choice.
2. **Company name** — the only required text answer. Verified phone/email and the available account name are reused from the server session.
3. **Services** — grouped rows like iPhone Settings, with one group open at a time and selections retained across groups. Custom services and starter catalogue prices are optional.
4. **Service region** — a free-form city, metro area or state (for example Greater Boston, Connecticut or Framingham). No street address is requested. This is stored in the existing `companies.city` locality field.
5. **Brand color** — compact color rectangles on their own screen. Next (or Enter in the custom color field) advances to the logo.
6. **Company logo** — an optional upload on its own screen, followed directly by completion. No review, license, insurance, tax, payment, warranty or validity questions.

Phone sign-in already verifies the phone. In owned authentication, a new Google account must complete the existing SMS verification before the application issues its session and admits it to onboarding. The server also blocks older sessions without a verified phone from opening/completing onboarding.

## Resuming progress

`onboarding_drafts` exists before a company is created and belongs to the authenticated account. Opening onboarding finds the active draft, or creates one. It stores the draft ID, user, mode, current step, language, company name, selected/custom services, catalogue opt-in, general region, brand color and uploaded logo URL. It also tracks start time, last activity, revision and completion time/company.

The client saves after a short 600ms typing pause and after changing questions. A versioned, account/draft-scoped browser copy keeps recent edits available offline. Returning on the same device uses the newer browser or server copy; another device resumes the last successfully synchronized server copy. The interface shows saving/saved or a retry action after a sync failure, and retries when the browser reconnects. A close-page beacon attempts to flush the most recent edits; browser shutdown and connectivity can prevent its delivery, so the local copy remains the fallback on that device.

The logo uploads as soon as it is selected. Once upload and save finish, its URL is part of the remote draft; an unuploaded local file cannot be resumed on another device. Objects have immutable paths scoped to the account and draft, without overwriting an existing company's logo.

Each browser sends ordered writes. Duplicates/older writes from the same browser do not roll back newer progress. Completion obtains a short lease to prevent double submission, saves final answers first and marks the draft completed before the dashboard redirect. Failed completion releases the lease for a retry. Completed drafts reject late autosaves. RLS prevents access to another account's draft, and demo accounts cannot write.

Account contacts are not accepted from the draft payload. Completion derives them again from verified session claims. The browser copy does not include phone, email, owner name, street address or commercial terms.

## Future abandoned-onboarding recovery

No recovery outreach is activated. A future Vatsfeer integration can join `onboarding_drafts.user_id` to `xtimator_accounts` and use verified contacts, the selected language, current step and last activity. Recovery should select only incomplete first-company drafts older than its inactivity threshold, exclude accounts that already have a company membership, and apply the future consent, deduplication and contact policies there.

Example eligibility query (no messages or scheduled automation):

```sql
select d.id, d.user_id, d.step, d."values"->>'language' as language,
       d.started_at, d.last_activity_at
from public.onboarding_drafts d
where d.mode = 'first'
  and d.completed_at is null
  and d.completion_started_at is null
  and d.last_activity_at < now() - interval '1 day'
  and not exists (
    select 1 from public.company_members m where m.user_id = d.user_id
  );
```

The shared production/development database received migration `20261106153000_onboarding_drafts.sql` on 2026-11-06. It creates only the draft table, indexes, touch trigger and owner policies; it does not create companies or seed account answers.

Migration `20261106164500_onboarding_logo_step.sql` adds the stable `logo` step without resetting existing drafts. The browser format stays compatible: previous color-screen drafts resume there and proceed to the new logo screen, keeping any uploaded logo.

## Interaction and verification

Text questions receive focus automatically. Enter advances after validation and ignores IME confirmation events. The visual-viewport shell leaves navigation outside the scrolling question area; inputs use 16px text to avoid iOS focus zoom. Color/service choices support keyboard access.

The development-only local preview uses the same survey components and a no-op completion callback. Screenshots use fictitious inputs and create no account, draft or company. Preview storage is separate from real onboarding. Actual mobile keyboard behavior still merits a physical iOS/Android check; viewport tests cover the layout contract, not the device keyboard itself.
