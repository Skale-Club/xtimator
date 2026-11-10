# Pending owner assets

Assets the WhatsApp welcome flow (Phase 3b) is waiting for. None of them blocks delivery: the code
sends a short text placeholder instead of the video and skips the template until it exists.

Where to configure all of them: Admin panel, Integrations, WhatsApp, card "WhatsApp welcome"
(`/admin/integrations`). Values are stored in `platform_integrations` (`meta_whatsapp` metadata:
`welcome_template_names`, `welcome_video_urls`). No deploy is needed to change them.

| Asset | Owner | Where it goes | Until it exists |
|---|---|---|---|
| How-it-works video, Portuguese (about 1 minute) | owner | "How-it-works video URL (Portuguese)" (https link, any host) | the bot says a short video is coming soon |
| How-it-works video, English | owner or Leila | "How-it-works video URL (English)" | same placeholder in English |
| How-it-works video, Spanish (optional) | owner | "How-it-works video URL (Spanish)" | same placeholder in Spanish |
| Welcome template copy (owner briefing: it must say the assistant is an AI and that a human team is watching; one quick-reply button, e.g. "Start" / "Começar"; submit to Meta as UTILITY, because Meta does not deliver marketing templates to US numbers) | owner | Create and submit it in the template admin (`whatsapp_notification_templates`, Meta status sync), then type its exact name into "Template name (pt / en / es)" | no first message is sent; the dashboard "Open in WhatsApp" card stays the path |

Notes:
- The template is sent only to owners who ticked the WhatsApp consent box at onboarding, once per
  user, right after onboarding completion (or right after consent, if consent comes later).
- When the owner taps the quick-reply button, the bot sends the three-message welcome sequence
  (what the assistant does, the video or its placeholder, "send your first job now").
- Draft copy for the sequence and the two tips lives in `lib/whatsapp/send-welcome.ts` and
  `lib/whatsapp/first-estimate-tips.ts`; the owner reviews it.
