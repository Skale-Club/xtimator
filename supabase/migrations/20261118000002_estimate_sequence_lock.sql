-- The displayed estimate sequence is per COMPANY, while generation jobs are
-- serialized per PROJECT. Concurrent inserts on different projects previously
-- read the same max and one failed the unique constraint after paid generation.
-- Serialize allocation under a separate company-keyed transaction lock.
CREATE OR REPLACE FUNCTION public.set_estimate_seq()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.estimate_seq IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('estimate-seq:' || NEW.company_id::text, 0));
    SELECT coalesce(max(estimate_seq), 0) + 1 INTO NEW.estimate_seq
      FROM public.estimates WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;
