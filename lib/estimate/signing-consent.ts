import { isSupportedLanguage, type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

const CONSENT = {
  estimate: {
    key: 'sign_consent_v1',
    statements: {
      en: 'By signing, you agree to the pricing and terms in this estimate.',
      pt: 'Ao assinar, você concorda com os preços e termos deste orçamento.',
      es: 'Al firmar, aceptas los precios y términos de este presupuesto.',
    },
  },
  change_order: {
    key: 'sign_change_order_consent_v2',
    statements: {
      en: 'By signing, you approve this change and the new contract total.',
      pt: 'Ao assinar, você aprova esta alteração e o novo total do contrato.',
      es: 'Al firmar, usted aprueba este cambio y el nuevo total del contrato.',
    },
  },
} as const

/** The literal statement displayed to the signer and persisted as evidence. */
export function getSigningConsent(
  kind: keyof typeof CONSENT,
  language: unknown,
): { statement: string; key: string; locale: EstimateLanguage } {
  const locale = isSupportedLanguage(language) ? language : 'en'
  const { key, statements } = CONSENT[kind]
  return {
    statement: statements[locale],
    key: locale === 'en' ? key : `${key}_${locale}`,
    locale,
  }
}
