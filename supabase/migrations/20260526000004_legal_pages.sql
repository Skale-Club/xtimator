CREATE TABLE IF NOT EXISTS legal_pages (
  id                text PRIMARY KEY,
  title             text NOT NULL,
  content           text NOT NULL DEFAULT '',
  effective_date    date,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by_email  text
);

ALTER TABLE legal_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_pages_public_read" ON legal_pages
  FOR SELECT USING (true);

INSERT INTO legal_pages (id, title, content, effective_date) VALUES
(
  'privacy_policy',
  'Privacy Policy',
  E'## Introduction\n\nXtimator ("we", "us", or "our") operates this platform and is committed to protecting your privacy. This Privacy Policy describes how we collect, use, and protect your information.\n\n## Information We Collect\n\nWe collect information you provide directly:\n\n- **Account data** — name, email address, and password.\n- **Company profile data** — business name, address, phone, logo, and branding preferences.\n- **Client and customer data** — contact details you enter for your clients.\n- **Estimate and project data** — audio recordings, photos, transcriptions, and generated estimates.\n- **Usage and technical data** — log files, IP addresses, browser type, and interactions with the platform.\n\n## Cookies and Tracking\n\nWe use session cookies required for authentication. We may use analytics tools to understand how the platform is used. You can disable cookies in your browser settings, but some features may not function correctly.\n\n## How We Use Your Information\n\nWe use your information to:\n\n- Provide, maintain, and improve the Xtimator platform.\n- Generate AI-powered estimates from your recordings and photos.\n- Send transactional emails related to your account and estimates.\n- Monitor security and prevent abuse.\n\n## Service Providers\n\nWe share data with trusted third-party providers to operate the platform, including cloud hosting, AI processing, email delivery, and payment processing. These providers are bound by confidentiality obligations.\n\n## Data Security\n\nWe implement industry-standard security measures including encryption in transit (TLS) and at rest, access controls, and audit logging. No method of transmission over the internet is 100% secure.\n\n## Your Rights\n\nDepending on your jurisdiction, you may have the right to access, correct, or delete your personal data. Contact us at the address below to exercise your rights.\n\n## Contact\n\nFor privacy-related questions, contact us at: [your contact email]',
  current_date
),
(
  'terms_of_service',
  'Terms of Service',
  E'## Agreement\n\nBy accessing or using Xtimator, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform.\n\n## Use of Xtimator\n\nXtimator provides AI-powered estimation tools for service businesses. You may use the platform only for lawful business purposes and in accordance with these Terms.\n\n## User Responsibilities\n\nYou are responsible for:\n\n- Maintaining the confidentiality of your account credentials.\n- All activity that occurs under your account.\n- The accuracy of information you enter, including client data and project details.\n- Ensuring that recordings or photos you upload comply with applicable laws, including any consent requirements.\n\n## Accuracy of Estimates\n\nXtimator uses AI to assist in generating estimates and proposals. These are tools to support your judgment, not substitutes for it. Xtimator makes no warranties about the accuracy or suitability of AI-generated content for any specific project.\n\n## Acceptable Use\n\nYou agree not to:\n\n- Use the platform for illegal, fraudulent, or abusive purposes.\n- Attempt to reverse-engineer, scrape, or overload the platform.\n- Upload content that violates third-party rights.\n\n## Subscription and Payment\n\nAccess to certain features requires a paid subscription. Fees are charged in advance and are non-refundable except as required by applicable law. We reserve the right to change pricing with reasonable notice.\n\n## Intellectual Property\n\nXtimator and its original content, features, and functionality are owned by us and protected by applicable intellectual property laws. You retain ownership of the business data you enter into the platform.\n\n## Limitation of Liability\n\nTo the maximum extent permitted by law, Xtimator is not liable for indirect, incidental, special, or consequential damages arising from your use of the platform.\n\n## Changes to These Terms\n\nWe may update these Terms at any time. We will notify you of material changes. Continued use of the platform after changes are posted constitutes acceptance of the revised Terms.\n\n## Contact\n\nFor questions about these Terms, contact us at: [your contact email]',
  current_date
)
ON CONFLICT (id) DO NOTHING;
