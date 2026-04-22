-- Phase 9: theme preference per user (stored on companies, 1:1 with auth.users)
ALTER TABLE companies
  ADD COLUMN theme_preference TEXT
  CHECK (theme_preference IS NULL OR theme_preference IN ('dark','light','system'));

COMMENT ON COLUMN companies.theme_preference IS
  'User theme choice. NULL means use system preference. Mirrored to eb-theme cookie for SSR hydration.';
