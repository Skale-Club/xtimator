# Organization currency support

Task: Add organization-level currency support with USD default and a small supported currency list including BRL.

Scope:
- Add currency fields/migration/types.
- Add organization setting UI.
- Centralize money formatting/parsing.
- Apply currency formatting and masked money inputs to estimates, price book, PDFs, public estimate view, dashboard, send/WhatsApp/email, and Stripe checkout where feasible.
- Keep language separate from currency.
