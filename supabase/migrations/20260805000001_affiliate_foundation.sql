-- supabase/migrations/20260805000001_affiliate_foundation.sql
-- SEED-054: Affiliate program foundation — Stripe Connect EXPRESS + Transfers.
--
-- Four tables:
--   affiliates            — one row per affiliate person (owns the referral code
--                           and the Express connected account)
--   affiliate_referrals   — attribution: affiliate -> referred company (1:1 on company)
--   affiliate_commissions — append-only accrual ledger, one row per paid invoice
--   affiliate_payouts     — one row per Stripe Transfer batch to an affiliate
--
-- CRITICAL — this is a SECOND, INDEPENDENT Connect surface. Phase 70
-- (20260517000001) put a Connect **Standard** account id on
-- `companies.stripe_account_id` so a TENANT can receive its own customers'
-- estimate payments. The affiliate account here is a Connect **Express**
-- account owned by an individual, and money flows the OTHER way (platform ->
-- affiliate, via Transfer). The two must never share a column or a status enum:
-- the same human can be both a tenant owner and an affiliate.
--
-- RLS: every table is tenant-invisible. Affiliates may SELECT only their OWN
-- rows (`affiliates.user_id = auth.uid()`); there is NO company-scoped policy —
-- a referred company must not be able to see who earns on it, nor how much.
-- All writes go through service-role paths (attribution on signup, accrual in
-- the Stripe webhook, payouts in the cron), which bypass RLS. Mirrors
-- customer_messages (20260721000004): SELECT-only policies, service-role writes.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS throughout).
-- NOT applied to remote automatically — deploy is CI->GHCR->Coolify and
-- migrations are applied by hand per project convention.
--
-- Ships INERT for money movement: no payout code exists yet, and
-- `billing_config.affiliate.enabled` defaults to FALSE, so no commission accrues
-- until the super-admin flips it on.

BEGIN;

-- ---------------------------------------------------------------------------
-- affiliates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliates (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable + ON DELETE SET NULL: an affiliate's earned commissions and payout
  -- history are financial records that must survive the auth user being
  -- deleted. Nullable also leaves room for an admin-created affiliate who has
  -- not yet claimed a login.
  user_id                   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- The referral code as it appears in `?ref=CODE`. Stored NORMALIZED
  -- (lowercase, [a-z0-9] only) so the UNIQUE constraint is genuinely
  -- case-insensitive — lib/affiliates/code.ts normalizes before every read and
  -- write. A CHECK enforces the same shape at the DB boundary.
  code                      text NOT NULL UNIQUE
    CHECK (code ~ '^[a-z0-9]{4,32}$'),
  email                     text NOT NULL,
  name                      text,
  -- pending  — applied, not yet approved (no commission accrues)
  -- active   — approved; referrals attribute and commissions accrue
  -- suspended— fraud/abuse hold; attribution and accrual both stop
  status                    text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','suspended')),

  -- Stripe Connect EXPRESS account (acct_xxx) — NOT the Phase-70 Standard
  -- account on companies.stripe_account_id. See header.
  stripe_account_id         text UNIQUE,
  stripe_account_status     text
    CHECK (stripe_account_status IS NULL OR stripe_account_status IN
      ('onboarding','active','restricted','disconnected')),
  -- Mirrors of the Stripe account capability flags, synced by the future
  -- `account.updated` webhook arm. `payouts_enabled` is the ONLY gate the payout
  -- runner may trust — a transfer to an account that cannot pay out just parks
  -- the money in a Stripe balance the affiliate cannot withdraw.
  stripe_payouts_enabled    boolean NOT NULL DEFAULT false,
  stripe_details_submitted  boolean NOT NULL DEFAULT false,
  stripe_onboarded_at       timestamptz,

  -- Negotiated per-affiliate rate. NULL = use billing_config.affiliate.commissionPct.
  -- Stored as a fraction (0.25 = 25%), matching estimateFeePct's convention.
  commission_pct_override   numeric(5,4)
    CHECK (commission_pct_override IS NULL OR (commission_pct_override >= 0 AND commission_pct_override <= 1)),

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON public.affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_status ON public.affiliates(status);
-- Partial: most rows have no Stripe account until the affiliate onboards.
-- Supports the future account.updated webhook lookup by acct id.
CREATE INDEX IF NOT EXISTS idx_affiliates_stripe_account_id
  ON public.affiliates(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_affiliates_set_updated_at ON public.affiliates;
CREATE TRIGGER trg_affiliates_set_updated_at
  BEFORE UPDATE ON public.affiliates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- affiliate_referrals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_referrals (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id              uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  -- UNIQUE: a company is attributed to AT MOST ONE affiliate, forever. The
  -- attribution write relies on this constraint for its idempotency (a 23505 on
  -- insert means "already attributed" — first attribution wins, a later ?ref=
  -- from a different affiliate cannot steal an existing tenant).
  company_id                uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Snapshot of where the click came from, for affiliate-facing reporting.
  -- Free-form and untrusted (derived from a Referer header) — never used in a
  -- query predicate.
  source                    text,
  attributed_at             timestamptz NOT NULL DEFAULT now(),
  -- Computed at attribution time from billing_config.affiliate.commissionDurationMonths
  -- and FROZEN: changing the global duration later must not retroactively extend
  -- or cut short an existing referral's earning window.
  commission_window_ends_at timestamptz NOT NULL,
  -- active — inside the window, commissions accrue
  -- expired— window elapsed (set lazily by the accrual path / a future cron)
  -- void   — fraud/self-referral; never accrues again
  status                    text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','void')),
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate_id
  ON public.affiliate_referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_status
  ON public.affiliate_referrals(status);

-- ---------------------------------------------------------------------------
-- affiliate_commissions  (append-only accrual ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id            uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referral_id             uuid NOT NULL REFERENCES public.affiliate_referrals(id) ON DELETE CASCADE,
  -- ON DELETE SET NULL, not CASCADE: money already earned survives the referred
  -- company being deleted (same rationale as customer_messages' audit trail).
  company_id              uuid REFERENCES public.companies(id) ON DELETE SET NULL,

  stripe_invoice_id       text,
  stripe_event_id         text,
  -- `commission:{invoiceId}` — the single dedup authority. A redelivered
  -- invoice.paid webhook (Stripe retries, or the route's dedup-row-clear on a
  -- downstream failure) must never accrue twice.
  idempotency_key         text NOT NULL UNIQUE,

  -- What the referred company actually PAID on this invoice (amount_paid), in
  -- integer cents. Never a total/subtotal — a discounted or partially-credited
  -- invoice must not over-pay the affiliate.
  base_amount_cents       integer NOT NULL CHECK (base_amount_cents >= 0),
  -- Rate SNAPSHOT at accrual time. Changing the global/override rate later must
  -- not silently restate historical earnings.
  commission_pct          numeric(5,4) NOT NULL CHECK (commission_pct >= 0 AND commission_pct <= 1),
  commission_amount_cents integer NOT NULL CHECK (commission_amount_cents >= 0),
  currency                text NOT NULL DEFAULT 'usd',

  -- pending  — accrued, inside the refund/chargeback hold
  -- payable  — hold elapsed, eligible for the next transfer batch
  -- paid     — included in a settled affiliate_payouts row
  -- reversed — the underlying charge was refunded/disputed
  -- void     — administratively cancelled (fraud)
  status                  text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','payable','paid','reversed','void')),
  -- accrued_at + billing_config.affiliate.holdDays. The payout runner promotes
  -- pending -> payable only once now() >= payable_at, so every reversal before
  -- that point is a pure DB state change rather than a clawback from a person's
  -- bank account.
  payable_at              timestamptz NOT NULL,
  -- FK added after affiliate_payouts is created (see the DO block below) — this
  -- table is declared first because it is the more important one to read.
  payout_id               uuid,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate_id
  ON public.affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_referral_id
  ON public.affiliate_commissions(referral_id);
-- Drives the payout runner's "what is due now" scan.
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status_payable_at
  ON public.affiliate_commissions(status, payable_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_payout_id
  ON public.affiliate_commissions(payout_id) WHERE payout_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- affiliate_payouts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id       uuid NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  amount_cents       integer NOT NULL CHECK (amount_cents > 0),
  currency           text NOT NULL DEFAULT 'usd',
  status             text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed')),
  -- Set once stripe.transfers.create succeeds.
  stripe_transfer_id text UNIQUE,
  -- Passed to Stripe as the request idempotency key AND enforced here, so a
  -- crashed/retried payout run can never double-transfer.
  idempotency_key    text NOT NULL UNIQUE,
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate_id
  ON public.affiliate_payouts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status
  ON public.affiliate_payouts(status);

-- affiliate_commissions.payout_id references affiliate_payouts, which is created
-- after it in this file. Add the FK here so the table order stays readable
-- (commissions are the more important table) without a forward reference.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_commissions_payout_id_fkey'
  ) THEN
    ALTER TABLE public.affiliate_commissions
      ADD CONSTRAINT affiliate_commissions_payout_id_fkey
      FOREIGN KEY (payout_id) REFERENCES public.affiliate_payouts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- RLS — affiliate reads own rows only; every write is service-role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.affiliates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payouts     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliates_select_own" ON public.affiliates;
CREATE POLICY "affiliates_select_own" ON public.affiliates FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- NOTE the deliberate omission: there is no policy exposing a referral to the
-- REFERRED company. A tenant must not learn it was referred, by whom, or for
-- how much. Only the affiliate sees its own referrals.
DROP POLICY IF EXISTS "affiliate_referrals_select_own" ON public.affiliate_referrals;
CREATE POLICY "affiliate_referrals_select_own" ON public.affiliate_referrals FOR SELECT TO authenticated
  USING (affiliate_id IN (
    SELECT affiliates.id FROM public.affiliates WHERE affiliates.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "affiliate_commissions_select_own" ON public.affiliate_commissions;
CREATE POLICY "affiliate_commissions_select_own" ON public.affiliate_commissions FOR SELECT TO authenticated
  USING (affiliate_id IN (
    SELECT affiliates.id FROM public.affiliates WHERE affiliates.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "affiliate_payouts_select_own" ON public.affiliate_payouts;
CREATE POLICY "affiliate_payouts_select_own" ON public.affiliate_payouts FOR SELECT TO authenticated
  USING (affiliate_id IN (
    SELECT affiliates.id FROM public.affiliates WHERE affiliates.user_id = (SELECT auth.uid())
  ));

COMMENT ON TABLE public.affiliates IS
  'SEED-054: affiliate program participants. stripe_account_id is a Connect EXPRESS account (platform -> affiliate Transfers), deliberately SEPARATE from companies.stripe_account_id (Phase 70 Connect STANDARD, customer -> tenant charges). RLS: own-row SELECT only; writes are service-role.';
COMMENT ON TABLE public.affiliate_referrals IS
  'SEED-054: affiliate -> referred company attribution. UNIQUE(company_id) makes first attribution final and gives the signup write its idempotency. commission_window_ends_at is frozen at attribution time.';
COMMENT ON TABLE public.affiliate_commissions IS
  'SEED-054: append-only commission accrual, one row per paid subscription invoice. Deduped on idempotency_key = commission:{invoiceId}. commission_pct and base_amount_cents are snapshots; payable_at enforces the refund/chargeback hold before any money moves.';
COMMENT ON TABLE public.affiliate_payouts IS
  'SEED-054: one row per Stripe Transfer batch to an affiliate Express account. idempotency_key is both the Stripe request key and a UNIQUE constraint so a retried payout run can never double-transfer.';

COMMIT;
