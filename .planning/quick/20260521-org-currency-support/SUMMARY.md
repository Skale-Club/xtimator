# Organization Currency Support

## Completed

- Added organization currency selection with a 10-currency allowlist and USD as the default.
- Added BRL support and shared currency utilities for formatting, parsing, symbols, and minor units.
- Added database migration fields and constraints for `companies`, `estimates`, and `company_price_book`.
- Wired currency into estimate generation, refinement prompts, saved estimates, Price Book rows, PDFs, public estimate views, send previews, WhatsApp text, dashboard totals, and Stripe Checkout amounts.
- Added masked money inputs to estimate editing and Price Book item editing/import preview.
- Updated company settings so changing the company currency also updates current Price Book rows.

## Verification

- `npx tsc --noEmit`
- `npm run test -- tests/unit/utils/format.test.ts tests/unit/dashboard/stat-cards.test.tsx tests/unit/price-book/price-book-list.test.tsx tests/unit/estimate/price-badge.test.tsx`
- `npx eslint ...` on the touched currency/UI/server files
- `npm run build`

## Notes

- Full-repo lint still has existing unrelated errors outside this change. The touched-file lint run has no errors, only pre-existing `<img>` warnings in Price Book components.
