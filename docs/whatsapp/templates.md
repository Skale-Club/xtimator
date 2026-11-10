# WhatsApp owner templates (proposed)

Messages the platform starts on its own, outside the owner's 24-hour customer-service window, must be approved templates (Meta error 131047 otherwise). The end client never receives WhatsApp from the bot's number: estimates reach clients by SMS and email only.

Submit these through the admin template composer (`lib/whatsapp/template-composer.ts`). Nothing here has been sent to Meta yet.

Rules the bodies already follow: category UTILITY, no leading or trailing variable, sequential `{{n}}`, no promotional wording, no newlines inside a variable value. One template name carries all three languages (pt_BR, en_US, es).

| Template | Used for | Variables |
|---|---|---|
| `owner_estimate_update` | estimate.viewed, accepted, declined, expired | `{{1}}` title, `{{2}}` detail |
| `owner_billing_alert` | payment.received, quota.exhausted, trial.expiring_3d | `{{1}}` title, `{{2}}` detail |
| `owner_update` | generic re-open; fallback when a free-form owner message gets 131047 or 131049 | `{{1}}` short summary |

Language codes: `pt_BR`, `en_US`, `es`. The language is the owner's (company default through the language cascade, English fallback).

## owner_estimate_update

Category: UTILITY. Why: a transactional status update about an estimate the owner created, triggered by the client's action on it.

- **pt_BR**: `Xtimator: {{1}}. {{2}} Abra o app para ver os detalhes.`
- **en_US**: `Xtimator: {{1}}. {{2}} Open the app to see the details.`
- **es**: `Xtimator: {{1}}. {{2}} Abre la app para ver los detalles.`

Examples: `{{1}}` = `Estimate viewed`, `{{2}}` = `Johnson opened your Kitchen remodel estimate.`

## owner_billing_alert

Category: UTILITY. Why: account and billing status about the owner's own subscription (payment received, credits used up, trial ending).

- **pt_BR**: `Xtimator, aviso da conta: {{1}}. {{2}} Veja os detalhes em Configurações, Cobrança.`
- **en_US**: `Xtimator account notice: {{1}}. {{2}} See the details in Settings, Billing.`
- **es**: `Xtimator, aviso de cuenta: {{1}}. {{2}} Consulta los detalles en Ajustes, Facturación.`

Examples: `{{1}}` = `Trial ends in 3 days`, `{{2}}` = `Pick a plan to keep creating estimates.`

## owner_update

Category: UTILITY. Why: a one-line status message about the owner's own work in the product, sent only because they started or asked for it (for example the estimate they were drafting). It reopens the conversation so the owner can reply.

- **pt_BR**: `Xtimator: {{1}} Responda por aqui para continuar.`
- **en_US**: `Xtimator: {{1}} Reply here to continue.`
- **es**: `Xtimator: {{1}} Responde por aquí para continuar.`

Example: `{{1}}` = `Estimate confirmation expired: send a new audio, text or photo to create a fresh estimate.`

Note: `{{1}}` is followed by literal text, so the "cannot end with a variable" rule passes. The summary is capped at 200 characters (`summaryVariable` in `lib/notifications/whatsapp-registry.ts`).

## Wiring

- Event to template mapping and language variants: `lib/notifications/whatsapp-registry.ts`.
- 24-hour window and 131047/131049 fallback: `lib/whatsapp/owner-send.ts` (`sendOwnerWhatsApp`).
- Opt-in (`whatsapp_opt_in_at`) is enforced upstream in `lib/notifications/preferences.ts`.
- A DB row approved in `whatsapp_notification_templates` still wins over the static map, preferring the owner's language.
