/**
 * lib/legal/fallback-content.ts
 *
 * DRAFT - owner review required before publishing.
 *
 * Static Terms of Service and Privacy Policy shown by /terms-of-service and
 * /privacy-policy whenever the `legal_pages` row is missing or cannot be read
 * (see getLegalPage in lib/queries/legal-pages.ts). A row edited in the admin
 * panel always wins over this text. Google Play requires the privacy URL to
 * resolve, so these pages must never 404.
 *
 * The same text is mirrored as SQL in the launch runbook; keep them in sync.
 */

/** Change this when the owner approves the text. ISO date (YYYY-MM-DD). */
export const LEGAL_EFFECTIVE_DATE = '2026-11-21'

export const LEGAL_CONTACT_EMAIL = 'support@xtimator.com'

export type LegalPageId = 'privacy_policy' | 'terms_of_service'

export interface FallbackLegalPage {
  id: LegalPageId
  title: string
  content: string
}

const PRIVACY_POLICY = `## Introduction

Xtimator ("we", "us", or "our") operates this platform and is committed to protecting your privacy. This Privacy Policy describes what information we collect, how we use it, and who we share it with.

## Information We Collect

We collect information you provide directly or that the platform generates while you use it:

- **Account data** - your name, email address, phone number, and, if you sign in with Google, the identifier of your Google account.
- **Company profile data** - business name, address, phone, email, website, license and insurance details, logo, and branding preferences.
- **Client and customer data** - contact details you enter for your clients.
- **Estimate and project data** - audio recordings, transcripts, photos, notes, price book items, generated estimates, and change orders.
- **Signing data** - when a client signs an estimate, we record the signer's name, the date and time, the content that was signed, and technical details such as IP address and browser type.
- **Billing data** - your plan, credit balance, and payment status. Card details are handled by our payment processor and are not stored by us.
- **Usage and technical data** - log files, IP addresses, device and browser type, and error reports.

## Cookies and Similar Technologies

We use session cookies and similar storage that are required to sign you in and keep your account secure. We also use error monitoring to find and fix problems, which may record technical details of a failed page load.

On our public marketing pages (such as the home page, industry pages, blog and legal pages) we use or may use analytics and advertising technologies, loaded through Google Tag Manager: Google Analytics, to understand how visitors use the site; Microsoft Clarity, which records how visitors move, click and scroll on these pages (with form fields masked) so we can improve them; and the Meta Pixel, to measure our advertising and show our ads to people who visited the site. These tools set cookies or similar identifiers and send information such as the pages you view, your interactions, your device and browser, and an approximate location to Google, Microsoft and Meta, which may combine it with other information they hold. They only run after you accept them in the cookie banner. We do not use them inside the signed-in app or on the estimate pages that businesses share with their clients.

We also remember, in a first-party cookie, how you arrived at our site (for example the campaign or ad link you clicked, the page you landed on and the referring website), and attach it to your account if you sign up, so we know which of our marketing works. If you came from an ad and did not reject advertising cookies, we may report to Google and Meta, from our servers, that you signed up, created your first estimate or made a purchase (with the purchase amount), together with the ad click identifier and a hashed (irreversibly scrambled) copy of your email address and phone number, so they can measure and improve our ads. We never send them the content of your estimates, your clients' information or your payment details. If you reject advertising cookies or your browser sends a Global Privacy Control signal, we do not send this information to Google or Meta.

You can opt out of analytics and advertising cookies through the cookie settings on our website, by enabling a Global Privacy Control signal in your browser, with your browser's cookie controls, or with the opt-out tools offered by Google (https://tools.google.com/dlpage/gaoptout) and Meta (in your Facebook or Instagram ad settings). Disabling required cookies may stop some features from working.

## How We Use Your Information

We use your information to:

- Provide, maintain, and improve the Xtimator platform.
- Transcribe your recordings and generate estimates from your recordings and photos.
- Send estimates to your clients by link, email, SMS, or WhatsApp, at your request.
- Send verification codes, transactional emails, SMS and push notifications related to your account and estimates.
- Process subscriptions, credit purchases, and payments.
- Monitor security, diagnose errors, and prevent abuse.

## Service Providers We Use

We share data with the following providers only as needed to operate the platform:

- **OpenRouter** - AI processing. Recordings are transcribed, and recordings, photos, and project details are analyzed to generate estimates, through OpenRouter and the AI model providers it routes to.
- **Stripe** - subscription billing, credit purchases, and, if you connect your account, payments from your clients.
- **Twilio** - SMS delivery (for example verification codes and estimate links).
- **Meta (WhatsApp Cloud API)** - WhatsApp messages sent to you or your clients.
- **Resend** - email delivery.
- **Cloudflare R2** - storage for recordings, photos, logos, and generated files.
- **Google Identity Platform** - sign-in with phone number or Google account.
- **Inngest** - background job processing, such as transcription and estimate generation.
- **Sentry and Langfuse** - error monitoring and diagnostic traces of AI requests.
- **Web push services of your browser or device** - push notifications you opt in to.
- **Our own servers** - the application and its PostgreSQL database run on infrastructure we manage.
- **Google Tag Manager and Google Analytics (Google LLC)** - loading of tags and website analytics on our public marketing pages, and conversion reporting from our servers (used to measure Google Ads) as described above.
- **Microsoft Clarity (Microsoft Corporation)** - session replay and heatmaps on our public marketing pages.
- **Meta Pixel and Meta Conversions API (Meta Platforms, Inc.)** - advertising measurement and audiences on our public marketing pages, and conversion reporting from our servers as described above.

We do not sell your personal information for money. The use of advertising cookies on our marketing pages may count as "sharing" personal information for cross-context behavioral advertising under some US state laws, such as California's. You can opt out of that sharing as described in "Cookies and Similar Technologies" above, and we honor Global Privacy Control signals.

## Estimates You Share

When you send an estimate, the recipient can see its content through a link or a PDF, including your company details and the client details on that estimate. You control who receives it.

## Data Retention and Deletion

We keep your data while your account is active. You can delete your account and its data at any time at https://xtimator.com/delete-account. Deletion removes your login, profile, companies you own, and their clients, projects, estimates, recordings, photos, and settings. Payment records kept by our payment processor and backups are retained only as long as required and are then removed.

## Data Security

We use security measures including encryption in transit (TLS), access controls, and row-level access rules in our database. No method of transmission over the internet is 100% secure.

## Your Rights

Depending on where you live, you may have the right to access, correct, or delete your personal data. You can delete your account yourself at https://xtimator.com/delete-account, or contact us to exercise your rights.

## Children

Xtimator is a business tool and is not intended for children.

## Changes to This Policy

We may update this Privacy Policy from time to time. The effective date above shows when it last changed.

## Contact

For privacy-related questions, contact us at: ${LEGAL_CONTACT_EMAIL}`

const TERMS_OF_SERVICE = `## Agreement

By accessing or using Xtimator, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform.

## Use of Xtimator

Xtimator provides AI-powered estimation tools for service businesses. You may use the platform only for lawful business purposes and in accordance with these Terms.

## User Responsibilities

You are responsible for:

- Maintaining the confidentiality of your account credentials.
- All activity that occurs under your account.
- The accuracy of information you enter, including client data and project details.
- Ensuring that recordings or photos you upload comply with applicable laws, including any consent requirements.

## Accuracy of Estimates

Xtimator uses AI to assist in generating estimates and proposals. These are tools to support your judgment, not substitutes for it. You are responsible for reviewing every estimate before you send it. Xtimator makes no warranties about the accuracy or suitability of AI-generated content for any specific project.

## Acceptable Use

You agree not to:

- Use the platform for illegal, fraudulent, or abusive purposes.
- Attempt to reverse-engineer, scrape, or overload the platform.
- Upload content that violates third-party rights.

## Subscription and Payment

Access to certain features requires a paid subscription or credits. Fees are charged in advance and are non-refundable except as required by applicable law. We reserve the right to change pricing with reasonable notice.

## Intellectual Property

Xtimator and its original content, features, and functionality are owned by us and protected by applicable intellectual property laws. You retain ownership of the business data you enter into the platform.

## Your Data and Account Deletion

You can delete your account and its data at any time at https://xtimator.com/delete-account. How we handle personal information is described in our Privacy Policy.

## Limitation of Liability

To the maximum extent permitted by law, Xtimator is not liable for indirect, incidental, special, or consequential damages arising from your use of the platform.

## Changes to These Terms

We may update these Terms at any time. We will notify you of material changes. Continued use of the platform after changes are posted constitutes acceptance of the revised Terms.

## Contact

For questions about these Terms, contact us at: ${LEGAL_CONTACT_EMAIL}`

export const FALLBACK_LEGAL_PAGES: Record<LegalPageId, FallbackLegalPage> = {
  privacy_policy: { id: 'privacy_policy', title: 'Privacy Policy', content: PRIVACY_POLICY },
  terms_of_service: { id: 'terms_of_service', title: 'Terms of Service', content: TERMS_OF_SERVICE },
}
