/**
 * Reply for an inbound WhatsApp number that is not a registered Xtimator
 * business. Pure module: language comes from the sender's country calling code.
 * (Sent outside the app UI, so it does not go through the app's t() system.)
 */

export type UnknownSenderLang = 'en' | 'pt' | 'es'

export const SIGNUP_URL = 'https://xtimator.com/?auth=signup'

// Spanish-speaking calling codes (E.164 digits, no '+'). Codes are prefix-free
// among each other, so a startsWith check is unambiguous.
const SPANISH_CODES = [
  '52', '34', '54', '56', '57', '58', '51', '53',
  '593', '591', '595', '598', '502', '503', '504', '505', '506', '507',
]

export function detectUnknownSenderLang(fromPhone: string): UnknownSenderLang {
  const digits = fromPhone.replace(/\D/g, '')
  if (digits.startsWith('55')) return 'pt'
  if (SPANISH_CODES.some((code) => digits.startsWith(code))) return 'es'
  return 'en'
}

const TEXTS: Record<UnknownSenderLang, string> = {
  en: `This is the Xtimator assistant for registered businesses. To use it, create an account with this phone number: ${SIGNUP_URL}`,
  pt: `Este é o assistente da Xtimator para empresas cadastradas. Para usar, crie uma conta com este número: ${SIGNUP_URL}`,
  es: `Este es el asistente de Xtimator para negocios registrados. Para usarlo, crea una cuenta con este número: ${SIGNUP_URL}`,
}

export function unknownSenderReplyText(fromPhone: string): string {
  return TEXTS[detectUnknownSenderLang(fromPhone)]
}
