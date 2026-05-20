# Phase 76 UAT Runbook — Price Book CSV Pro

**Tester:** Owner
**Env:** localhost:3000 with real Supabase dev project
**Fixture:** `tests/fixtures/price-book-50-rows.csv`
**Plan reference:** [76-05-PLAN.md](./76-05-PLAN.md)

---

## Pre-flight

- [ ] `npx supabase db push` has run; `price_book_imports` table exists in Studio
- [ ] Logged in as a company owner (use the seeded dev account)
- [ ] `/price-book` loads with no console errors
- [ ] No leftover banner from prior imports (refresh after 5 min if present)

## Happy path — EN

- [ ] Click **Import CSV** — wizard dialog opens at Step 1 ("Import items from CSV")
- [ ] Drag `price-book-50-rows.csv` onto the drop zone
- [ ] Locale chip shows `US format detected`; **Looks right** is the primary CTA
- [ ] Click **Looks right** → advances to Step 2 ("Match your columns")
- [ ] `name`, `unit_price`, `folder`, `unit`, `notes` all auto-mapped
- [ ] Click **Next: preview** → Step 3 ("Review your items"); summary shows valid/dupe/error counts
- [ ] Click any editable cell, change price, press Enter — value updates and counts recalc
- [ ] Choose **Update** for dedupe strategy → radio reflects choice
- [ ] Click **Next: confirm** → Step 4 stat card shows total + breakdown
- [ ] Click **Import N items** → progress bar fills; subview shows "Importing X of Y"
- [ ] Success view: "N items imported · M new · K updated"
- [ ] Click **View Price Book** → dialog closes, list refreshes, new items present
- [ ] Banner shows "N items imported · You can undo for 5 minutes." with **Undo** button
- [ ] Click **Undo** → toast "Removed N items, reverted K." — items disappear from list

## Draft persistence

- [ ] Reopen wizard, upload fixture, advance to Step 2, press **Esc** → AlertDialog appears
- [ ] Click **Save and close** — dialog dismisses
- [ ] Click **Import CSV** again → "Picked up where you left off" alert visible; Step 2 is current
- [ ] Click **Start over** → wizard returns to Step 1, draft cleared

## Streaming progress — large file

- [ ] Create a 250-row CSV (duplicate the fixture rows): `cat tests/fixtures/price-book-50-rows.csv > /tmp/big.csv; for i in {1..4}; do tail -n +2 tests/fixtures/price-book-50-rows.csv >> /tmp/big.csv; done`
- [ ] Upload `/tmp/big.csv` → walk to Step 4 → click **Import** → progress bar visibly ticks per chunk (5 chunks)
- [ ] Click **Cancel import** mid-flight → failure subview shows "Imported X rows before stopping. Canceled."
- [ ] Click **View Price Book** — partial inserts visible; banner shows partial count with Undo

## Locale override

- [ ] Re-upload fixture; on Step 1 click **Override** on locale chip → Select shows
- [ ] Pick **BR** → confirm; advance to Step 3
- [ ] Verify: fixture is US-formatted, so most prices will now flag as `invalid_unit_price` — expected
- [ ] Click **Back** to Step 1, switch back to **US** → errors clear on Step 3

## i18n — PT-BR

- [ ] Top bar → switch language to PT-BR
- [ ] Reopen wizard → step titles render in Portuguese (translations fetched via `/api/translate`)
- [ ] Step 4 success body fits within the card without text overflow
- [ ] Undo banner copy renders in Portuguese

## i18n — ES

- [ ] Repeat above with ES locale
- [ ] Confirm currency labels still parse US format correctly (locale ≠ currency parsing mode)

## Error report download

- [ ] Force a row failure: edit one row's `name` to match an existing PB item, pick **Update** strategy globally, then simulate a server-side failure (e.g. yank the DB connection briefly, or set an invalid unit length)
- [ ] After commit → Success view shows **Download error report (N)** button
- [ ] Click → CSV downloads; open it; verify columns include original headers + `error_reason` populated
- [ ] RFC 4180 escaping: any name with `,` or `"` is wrapped in `"…"`; embedded quotes are doubled

## Undo edge cases

- [ ] Trigger an import; wait 5 minutes; reload `/price-book` → banner is gone (window expired)
- [ ] Trigger import; click Undo within window → toast confirms; banner disappears; items removed
- [ ] Trigger import; manually call `undoLastImport(badId)` from devtools → error toast "Import not found."

## Findings

Log any issues in `.planning/known-issues.md` with:

- Severity: `blocker / major / minor / polish`
- Repro steps
- Browser + device
- Screenshot or recording where useful

---

**Sign-off:** Once all checked items pass on Chrome desktop + Safari iOS, Phase 76 is ready to merge to `main` and ship to production.
