# WhatsApp owner templates and activation

Messages the platform starts on its own, outside the owner's 24-hour customer-service window, must be approved templates (Meta error 131047 otherwise). The end client never receives WhatsApp from the bot's number: estimates reach clients by SMS and email only.

Use this copy to prepare templates for Meta review. The admin composer supports body-only templates. Create the welcome template with its quick-reply button in Meta WhatsApp Manager.

Rules the bodies already follow: category UTILITY, no leading or trailing variable, sequential `{{n}}`, no promotional wording, no newlines inside a variable value. One template name carries all three languages (pt_BR, en_US, es).

| Template | Used for | Variables |
|---|---|---|
| `owner_estimate_update` | estimate.viewed, accepted, declined, expired | `{{1}}` title, `{{2}}` detail |
| `owner_billing_alert` | payment.received, quota.exhausted, trial.expiring_3d | `{{1}}` title, `{{2}}` detail |
| `owner_update` | generic re-open; fallback when a free-form owner message gets 131047 or 131049 | `{{1}}` short summary |
| `owner_welcome_start` | first proactive message after onboarding | No body variables. One quick-reply button |

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

## owner_welcome_start

Request UTILITY review as a follow-up to the owner's Xtimator setup and explicit WhatsApp consent. Configure one quick-reply button at index 0. The send attaches the stable payload `xtimator_welcome_start`.

| Locale | Body | Quick reply |
|---|---|---|
| `en_US` | Welcome to Xtimator. Your account is ready. Reply here to learn how to create an estimate by sending a voice message or photos of a job. | Get started |
| `pt_BR` | Boas-vindas à Xtimator. Sua conta está pronta. Responda por aqui para aprender a criar um orçamento enviando um áudio ou fotos do serviço. | Começar |
| `es` | Te damos la bienvenida a Xtimator. Tu cuenta está lista. Responde aquí para aprender a crear un presupuesto enviando un audio o fotos del trabajo. | Empezar |

## Activation

1. In **Admin → Integrations → WhatsApp**, configure the Meta access token, business account ID, phone number ID and public display number in E.164 format. Give the token the `whatsapp_business_management` permission to import templates. [Meta template management](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates/)
2. Author the variants above in the same WABA and submit them for Meta approval. Configure template names for English, Portuguese and Spanish in **WhatsApp welcome**. Add a video URL for each locale when the video is ready. The first-contact flow gives usage guidance in locales without a video.
3. Open **Admin → Inbox → Settings → Templates**, choose **Import from Meta**, enter the approved name and exact locale, and choose the notification event. Import one binding per event and locale. The same approved Meta variant can back several events. Use **No notification event** for `owner_welcome_start` and `owner_update`. The activation panel tracks missing bindings and welcome variants.
4. With an owner-controlled phone, verify Google onboarding with and without a verified phone, the welcome template and quick reply, three welcome messages, and an audio-to-estimate flow. Also verify a proactive estimate update outside the reply window and opt-out from Notifications.

## Wiring

- Event to template mapping and language variants: `lib/notifications/whatsapp-registry.ts`.
- 24-hour window and 131047/131049 fallback: `lib/whatsapp/owner-send.ts` (`sendOwnerWhatsApp`).
- Opt-in (`whatsapp_opt_in_at`) is enforced upstream in `lib/notifications/preferences.ts`.
- Notifications resolve approved exact event bindings in `whatsapp_notification_templates`, preferring the owner's locale and falling back to an approved English binding.
- Welcome requires an approved variant in its configured locale. Its first-contact sequence resumes at the first unsent step when the same phone messages again.
- If a first-contact send loses its provider outcome, open the company's **Inbox Settings → Accounts** entry after the five-minute lease expires. Check the indicated step and phone with Meta or the owner, then choose **Confirmed sent** or **Confirmed unsent**. The next inbound resumes from the recorded step.
- For an uncertain proactive welcome template, use **Welcome template delivery** in the same account after the lease expires. A confirmed unsent template can retry through the next onboarding or explicit opt-in trigger.
