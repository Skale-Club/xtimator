# Tutorial recording workspace

Prepared 2026-11-06 in the existing Skale Club company, under its existing owner account.

## Database environments

The development `.env.local` and the production application's public JavaScript bundles both identify Supabase project `prmqgcrnpuvpzruyzvuv`. The production health endpoint returned HTTP 200. These currently share the application data database: the seed was applied once, not duplicated into a second database. The unrelated inherited `TEST_DATABASE_URL` was not used. The local development server was not running during verification.

## Recording scenarios

Open the existing **Skale Club** company. Its current field-service industries cover construction/remodeling, painting, house cleaning, carpet/upholstery cleaning, electrical, plumbing, handyman work and landscaping. The original name, logo, owner, contact information, billing configuration, credits, integrations and admin access were retained.

| Area | Example | State | Amount (USD) |
| --- | --- | --- | ---: |
| Remodeling | Guest Bathroom Remodel | Accepted / paid | 7,250.00 |
| Remodeling | Kitchen Backsplash & Under-Cabinet Lighting | Accepted / unpaid | 3,031.00 |
| Decks | Backyard Deck Repair & Staining | Viewed | 5,349.00 |
| Painting | First-Floor Interior Painting | Viewed | 7,792.50 |
| Painting | Two-Bedroom Color Refresh | Draft | 3,486.00 |
| Painting | Exterior Trim & Entry Door Refresh | Accepted / paid | 2,850.00 |
| House cleaning | Move-Out Deep Clean — Two-Bedroom Apartment | Accepted / paid | 500.00 |
| House cleaning | Whole-Home Deep Cleaning | Viewed | 547.00 |
| House cleaning | Biweekly Home Cleaning — Initial Visit | Draft | 280.00 |
| Commercial cleaning | Dental Office — After-Hours Detail Clean | Sent | 960.00 |
| Carpet cleaning | Five-Room Carpet & Stair Cleaning | Accepted / unpaid | 532.00 |
| Upholstery | Cafe Seating & Area Rug Refresh | Viewed | 1,094.00 |
| Post-construction | Renovated Condo — Post-Construction Cleaning | Draft | 1,318.00 |
| Electrical | 200-Amp Panel Upgrade & Surge Protection | Accepted / paid | 3,195.00 |
| Electrical | Garage Level 2 EV Charger Installation | Sent | 2,020.00 |
| Plumbing | Water Heater Replacement & Utility Room Repairs | Draft | 2,491.00 |
| Landscaping | Fall Yard Cleanup & Mulch Installation | Accepted / paid | 1,550.00 |
| Maintenance | Rental Unit 3B — Drywall & Turnover Repairs | Estimate ready | 1,845.00 |
| Upholstery | Living Room Rug & Upholstery Cleaning | Declined / postponed | 710.00 |

Totals: 12 fictional clients, 19 projects/current estimates, 40 sections, 86 estimate items, 56 catalogue items in eight categories, 60 chronological activity entries, seven accepted estimates worth **$18,908**, and five simulated paid invoices. Four draft estimates, one estimate ready, two sent, four viewed, seven accepted and one declined.

Suggested walkthrough: open the client list → a draft bedroom painting estimate → the viewed first-floor painting estimate → accepted kitchen project → paid bathroom project → catalogue categories. Use the recurring cleaning draft to demonstrate adapting an estimate for a new visit.

All client email addresses use `example.com`; phone numbers use the fictional US 555-01xx range. Amounts are illustrative. Existing zero-tax settings were retained; these are not tax or pricing guidance. Payment badges and invoices are simulated database records with no Stripe payment/checkout/invoice IDs. No email, SMS, WhatsApp, AI request or payment was triggered by seeding. Existing company delivery and payment configuration remains under the owner's control.

## Original tests and backup

Seven previously active test projects were archived. Previously trashed projects were left as they were. Forty-three active marketing/web/video catalogue entries were soft-deleted. Eight existing folders were renamed for the field-service categories; no projects, estimates, recordings, photos or catalogue records were hard-deleted.

Before-state JSON is stored privately in `.bg-shell/video-workspace/` (gitignored). It includes the affected project archive flags, catalogue deletion flags, original folders and changed company defaults, plus inserted record IDs. Keep that snapshot for recovery. Restoration should be reviewed before execution, especially after tutorial edits; the script deliberately has no reset or destructive restore option.

## Reusable script

```powershell
node --env-file=.env.local scripts/seed-video-workspace.mjs --email=<owner-email> --company-id=<company-uuid>
# Explicitly apply the reviewed preview:
node --env-file=.env.local scripts/seed-video-workspace.mjs --email=<owner-email> --company-id=<company-uuid> --apply
# Read-only verification of the existing seeded company:
node --env-file=.env.local scripts/seed-video-workspace.mjs --email=<owner-email> --company-id=<company-uuid> --verify
```

The default is a read-only preview. Apply checks exact owner/company membership, takes a transaction-scoped lock, writes a private snapshot, and verifies totals, relationships and protected company/account state before committing. Deterministic IDs let verify locate the dataset; repeated apply refuses to overwrite tutorial edits. Dates are anchored to 2026-11-06. Reusing for another company intentionally retires its current active catalogue/projects, so always review the preview.

## Dashboard pending counter

Quick task `261106-alg` corrects the pending query in `getDashboardStats()` (`lib/queries/dashboard.ts`): it joins the parent project with an inner join and requires both `archived_at` and `deleted_at` to be null. The original company/current-version/draft-or-sent criteria are retained. The real function returned **seven pending estimates** for this workspace, instead of 29 including 22 archived/trashed tests. Archiving, trashing and restoring projects are covered by regression tests. Accepted/revenue aggregates retain their historical behavior. No additional database mutations are required for this correction. Published and verified in production on 2026-11-06 as commit `313633c0`; CI passed both full unit/eval runs and the health endpoint confirmed that exact deployed source revision.

Verification performed: syntax check; read-only preview; transaction verification before commit; independent read-only verify after commit; PostgREST joins for projects/clients/current estimates and catalogue/folders; no active technology services; production bundle project identity; protected account/company state hash unchanged. Browser layout was not visually audited.
