-- Seed platform admin for skale.club@gmail.com
-- Looks up the user UUID from auth.users to avoid hardcoding.
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'skale.club@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
